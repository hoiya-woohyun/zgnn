// 서버 워커(Vercel `zgnn-worker`, ADR-028)의 본체 — `/admin` 이 운영자 JWT 를 실어 부르는 `POST /api/run` 하나(`handleRun`)와, 그 요청이 `waitUntil` 로 도는 홉 하나(`runHop`).
// 진입점(`worker/entry/run.mjs`)은 프로세스 env·`waitUntil`·사슬 URL 만 꽂는다. DB·세션·단계는 전부 주입이라 가짜로 순서를 테스트한다.
//
// 왜 이렇게 생겼나 —
//  - **401·403 이면 아무것도 돌지 않는다**(결정 3). 토큰은 `auth.getUser` 로, 운영자는 `is_operator()` 로 본다. 사이트 방문자가 누르면 도는 길은 어떤 모양이든 없다.
//  - **로컬 워커가 살아 있으면 비킨다**(결정 10) — 상태 칸 큐(요청 글·추가 수집)는 원자적으로 집을 줄이 없고 `candidates` 에 유일 제약이 없어,
//    같은 글을 둘이 읽으면 후보가 둘 생긴다. 로컬은 같은 요청을 ~1초 안에 집는다. 조회가 실패하면 비키지 않는다(서버를 멈출 근거가 아니다).
//  - **홉 하나는 로컬 `once` 의 한 바퀴를 분석 하나·글 5건까지만**(결정 5) — 함수 하나가 300초 안에 끝나야 한다. 남았고 줄였으면 같은 JWT 로 자기를 다시 부른다.
//  - **한 인스턴스에서 홉은 하나만** 돈다(`hopRunning`). Fluid 는 한 인스턴스에 요청을 겹쳐 보낼 수 있는데, 세션 주입(`injectSession`)과
//    실행 행 리스너(`setRunListener`)가 모듈 상태라 두 홉이 겹치면 서로의 JWT·실행 행을 덮는다. 그래서 확인과 세움 사이에 `await` 가 없다.
//  - 응답 본문은 상태 낱말 하나다. 토큰·오류 원문은 싣지 않는다 — 오류는 이 함수의 로그에만 첫 줄로 남는다.
import { createClient } from '@supabase/supabase-js';
import { probeExcludedAt } from './postExclusion.mjs';
import { setRunListener } from './runLog.mjs';
import { createSupabase, injectSession, jwtExpiresAt, resolveSupabaseCredentials, sessionUsableUntil } from './supabaseClient.mjs';
import { PROJECT_URL, PUBLISHABLE_KEY } from './supabasePublic.mjs';
import { createWorkerCycle } from './workerCycle.mjs';
import { startHeartbeat } from './workerHeartbeat.mjs';
import { pickRequests, planCycle } from './workerLoop.mjs';
import { REMOTE_WORKER_HOST, closeRequests, localWorkerAlive, readWorkerPeers, readWorkerState, takeRequests } from './workerQueue.mjs';
import { runPipelineStep } from './workerSteps.mjs';

/** 한 홉의 분석이 읽는 글 수 — 글당 ~30초(ADR-028 「맥락」) × 5 + 수집·반영·콜드 스타트 여유 < 300초(`maxDuration`). */
export const HOP_ANALYZE_CAP = 5;
/** 다음 홉을 부르려면 JWT 실효(exp − 30분)가 이만큼 남아야 한다 — 모자라면 그 홉의 단계 스크립트가 `createSupabase` 에서 거부된다. */
export const HOP_BUDGET_S = 5 * 60;

const defaultLog = (line) => console.log(`[worker] ${line}`);
const firstLine = (e) => String(e?.message ?? e).split('\n')[0].slice(0, 200);

let hopRunning = false;
/** 이 인스턴스에서 홉이 도는 중인가 — `handleRun` 이 202 busy 를 고르는 데 쓴다. */
export const isBusy = () => hopRunning;

/** `Authorization: Bearer <토큰>` → 토큰. 다른 꼴이면 null. */
export function bearerToken(header) {
  const match = /^Bearer\s+(\S+)$/i.exec(typeof header === 'string' ? header.trim() : '');
  return match ? match[1] : null;
}

/**
 * 이번 홉 뒤에 자기를 한 번 더 부를까. 넷이 다 맞아야 한다 — 이번 홉이 **줄였고** · Claude 한도에 **안 걸렸고** · **남은 일**이 있고 · JWT 실효가 **한 홉 이상** 남았다.
 * "줄였고" 가 없으면 403 으로 계속 실패하는 글 하나(요청 글 수가 안 준다)가 JWT 가 끝날 때까지 홉마다 한도를 태운다.
 * 수집은 성공(code 0)이면 줄인 것으로 친다 — 「지금 수집」(키워드 전체)은 줄일 상태 칸이 없고, 남기는 일(요청 글)은 다음 홉의 분석이 센다.
 * @param {{ history: { step: string, code: number, rateLimited: boolean, progressed: boolean }[], nextSteps: object[], usableUntilSec: number, nowSec: number }} p
 * @returns {{ chain: boolean, why: string }}
 */
export function shouldChain({ history, nextSteps, usableUntilSec, nowSec }) {
  if (history.some((h) => h.rateLimited)) return { chain: false, why: 'Claude 한도 — 사슬을 멈춘다(요청은 queued 로 남아 리셋 뒤 이어 간다)' };
  if (!history.some((h) => h.progressed || (h.step === 'collect' && h.code === 0))) {
    return { chain: false, why: '이번 홉이 줄인 일이 없다 — 같은 실패를 되풀이하지 않게 멈춘다' };
  }
  if (nextSteps.length === 0) return { chain: false, why: '남은 일 없음' };
  const left = usableUntilSec - nowSec;
  if (!Number.isFinite(left) || left < HOP_BUDGET_S) {
    const minutes = Number.isFinite(left) ? `${Math.max(0, Math.floor(left / 60))}분` : '알 수 없음';
    return { chain: false, why: `세션 실효가 한 홉(${HOP_BUDGET_S / 60}분)보다 짧다(${minutes}) — 남은 일은 다음 버튼이나 로컬 워커가` };
  }
  return { chain: true, why: `남은 일 ${nextSteps.length}단계 — 다음 홉을 부른다` };
}

/** 요청 JWT 를 실은 클라이언트 — `auth.getUser` 와 `rpc('is_operator')` 둘 다 그 사용자로 간다(rpc 는 헤더의 JWT 로 `auth.uid()` 를 본다). */
export function createUserClient(token) {
  return createClient(PROJECT_URL, PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

const reply = (status, state, headers = {}) => Response.json({ state }, { status, headers });

/**
 * `POST /api/run`. 순서가 곧 규칙이다 — 인증(401) → 운영자(403) → 로컬 워커(200 local) → 이 인스턴스가 바쁨(202 busy) → 202 started + `waitUntil(startHop)`.
 * @param {Request} request
 * @param {{
 *   waitUntil: (p: Promise<unknown>) => void,
 *   createUserClient?: (token: string) => object,
 *   readPeers?: (client: object) => Promise<object[]>,
 *   isBusy?: () => boolean,
 *   startHop?: (token: string) => Promise<unknown>,
 *   log?: (line: string) => void,
 *   now?: () => number,
 * }} deps
 */
export async function handleRun(request, deps) {
  const {
    waitUntil,
    createUserClient: makeClient = createUserClient,
    readPeers = readWorkerPeers,
    isBusy: busy = isBusy,
    startHop = (token) => runHop(token),
    log = defaultLog,
    now = Date.now,
  } = deps;
  if (request.method !== 'POST') return reply(405, 'method-not-allowed', { Allow: 'POST' });
  const token = bearerToken(request.headers.get('authorization'));
  if (!token) return reply(401, 'unauthorized');

  const client = makeClient(token);
  try {
    const { data, error } = await client.auth.getUser(token);
    if (error || !data?.user) return reply(401, 'unauthorized');
  } catch {
    return reply(401, 'unauthorized');
  }
  try {
    const { data, error } = await client.rpc('is_operator');
    if (error || data !== true) return reply(403, 'forbidden');
  } catch {
    return reply(403, 'forbidden');
  }

  try {
    if (localWorkerAlive(await readPeers(client), now())) {
      log('로컬 워커가 살아 있다 — 비킨다');
      return reply(200, 'local');
    }
  } catch (e) {
    log(`workers 조회 실패(${firstLine(e)}) — 비키지 않고 돈다`);
  }
  // 확인(isBusy)과 세움(runHop 의 첫 줄) 사이에 await 가 없다 — 겹쳐 들어온 요청은 여기서 busy 를 본다.
  if (busy()) return reply(202, 'busy');
  waitUntil(startHop(token));
  return reply(202, 'started');
}

/**
 * 홉 하나 — 세션 주입 → 심장(`host: 'vercel'`) → 한 바퀴(분석 하나·글 5건) → 심장 idle → 다시 계획해 사슬을 이을지 → 주입·리스너·바쁨을 되돌린 **뒤에** 사슬.
 * 되돌린 뒤에 부르는 이유: 다음 홉 요청이 같은 인스턴스에 떨어질 수 있다(Fluid) — 그때 바쁨이 남아 있으면 그 요청이 busy 로 버려진다.
 * **던지지 않는다** — `waitUntil` 의 거부는 로그도 없이 사라진다. 실패는 한 줄로 남기고 심장은 idle 로 닫는다.
 * @param {string} token
 * @param {{ chain?: (token: string) => Promise<void>, version?: string|null, log?: (line: string) => void, now?: () => number, [dep: string]: unknown }} [deps]
 * @returns {Promise<{ chain: boolean, why: string }>}
 */
export async function runHop(token, deps = {}) {
  const {
    chain = async () => {},
    version = null,
    log = defaultLog,
    now = Date.now,
    injectSession: inject = injectSession,
    createSupabase: makeSupabase = createSupabase,
    startHeartbeat: beginHeartbeat = startHeartbeat,
    probeExcludedAt: probeExcluded = probeExcludedAt,
    setRunListener: listen = setRunListener,
    readWorkerState: readState = readWorkerState,
    takeRequests: take = takeRequests,
    closeRequests: close = closeRequests,
    resolveSupabaseCredentials: resolveCreds = resolveSupabaseCredentials,
    runStep = runPipelineStep,
  } = deps;
  if (hopRunning) {
    log('이 인스턴스에서 홉이 이미 돈다 — 겹치지 않게 넘긴다');
    return { chain: false, why: '바쁨' };
  }
  hopRunning = true;

  let restore = null;
  let heartbeat = null;
  let decision = { chain: false, why: '홉 실패' };
  try {
    restore = inject(token);
    const client = makeSupabase();
    heartbeat = await beginHeartbeat(client, { host: REMOTE_WORKER_HOST, version: version ?? null, warn: log });
    const excludedApplied = await probeExcluded(client, log);

    // 세션은 요청 JWT 하나뿐이라 다시 로그인할 길이 없다 — 쓸 만한지만 본다(`createSupabase` 와 같은 판정, throw 없이).
    const ensureSession = async () => {
      try {
        resolveCreds();
        return true;
      } catch (e) {
        log(`세션을 못 쓴다 — ${firstLine(e)}`);
        return false;
      }
    };
    const cycle = createWorkerCycle({
      resident: false,
      analyzeCap: HOP_ANALYZE_CAP,
      stopAfter: (step) => step.step === 'analyze',
      runStep,
      // 서버가 곧 remote 라 `remoteBusy` 는 넣지 않는다 — 로컬과의 비킴은 `handleRun` 이 시작 전에 한 번 본다.
      readState: async () => {
        if (!(await ensureSession())) return null;
        const state = await readState(client, { excludedApplied });
        return { ...state, requests: pickRequests(state.requestRows, now()) };
      },
      ensureSession,
      takeRequests: (rows) => take(client, rows, new Date(now()).toISOString(), log),
      closeRequests: (rows, decide) => close(client, rows, decide, log),
      setPhase: (phase) => heartbeat.setPhase(phase),
      currentPhase: () => heartbeat.phase(),
      onPause: () => {}, // 리셋 뒤에 깨울 타이머가 없다 — 한도면 사슬을 멈추고(`shouldChain`) 요청은 queued 로 남는다
      log,
      now,
    });
    listen((run) => {
      cycle.onRunStarted(run);
      heartbeat?.setRunId(run.id);
    });

    const result = await cycle.runCycle({ daily: false });
    const beat = heartbeat;
    heartbeat = null;
    await beat.close();

    // 다음 홉이 볼 것과 같은 눈으로 다시 계획한다 — 이번 바퀴의 `done`·`last` 를 물려받으면 방금 돈 단계가 전부 빠져 "남은 일 없음" 이 된다.
    const nextSteps = result.state ? planCycle({ ...result.state, analyzeCap: HOP_ANALYZE_CAP, now: now() }) : [];
    decision = shouldChain({ history: result.history, nextSteps, usableUntilSec: sessionUsableUntil(jwtExpiresAt(token)), nowSec: now() / 1000 });
    log(`홉 끝 — ${result.history.length}단계 · ${decision.why}`);
  } catch (e) {
    log(`⚠️ 홉 실패 — ${firstLine(e)}`);
  } finally {
    listen(null);
    if (heartbeat) {
      try {
        await heartbeat.close();
      } catch {
        /* 심장 닫기는 fail-soft(workerHeartbeat.mjs) — 5분 뒤 화면이 멎은 것으로 본다 */
      }
    }
    restore?.();
    hopRunning = false;
  }

  if (decision.chain) {
    try {
      await chain(token);
    } catch (e) {
      log(`⚠️ 다음 홉을 못 불렀다(${firstLine(e)}) — 남은 일은 다음 버튼이나 로컬 워커가`);
    }
  }
  return decision;
}
