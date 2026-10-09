// 서버 워커(Vercel `zgnn-worker`, ADR-028)의 본체 — `/admin` 이 운영자 JWT 를 실어 부르는 `POST /api/run` 하나(`handleRun`)와, 그 요청이 `waitUntil` 로 도는 홉 하나(`runHop`).
// 진입점(`worker/entry/run.mjs`)은 프로세스 env·`waitUntil`·사슬 URL 만 꽂는다. DB·세션·단계는 전부 주입이라 가짜로 순서를 테스트한다.
//
// 왜 이렇게 생겼나 —
//  - **401·403 이면 아무것도 돌지 않는다**(결정 3). 토큰은 `auth.getUser` 로, 운영자는 `is_operator()` 로 본다. 사이트 방문자가 누르면 도는 길은 어떤 모양이든 없다.
//    그 앞에서 exp 를 먼저 본다 — JWT 꼴이 아니거나 실효가 지난 토큰은 Supabase 에 묻지도 않는다(인증 없는 호출이 네트워크를 쓰지 않게).
//  - **로컬 워커가 살아 있으면 비킨다**(결정 10) — 상태 칸 큐(요청 글·추가 수집)는 원자적으로 집을 줄이 없고 `candidates` 에 유일 제약이 없어,
//    같은 글을 둘이 읽으면 후보가 둘 생긴다. 로컬은 같은 요청을 ~1초 안에 집는다. 다른 서버 인스턴스가 홉을 도는 중이어도(vercel 행이 idle 아님) 비킨다.
//    조회가 실패하면 비키지 않는다(서버를 멈출 근거가 아니다).
//  - **홉 하나는 로컬 `once` 의 한 바퀴를 분석 하나·글 5건까지만**(결정 5) — 함수 하나가 300초 안에 끝나야 한다. 남았고 줄였으면 같은 JWT 로 자기를 다시 부른다.
//    사슬은 `X-Zgnn-Hop` 으로 깊이를 세고 `MAX_HOPS` 에서 끊는다 — 진척 판정이 한 군데 틀려도 JWT 실효 끝(~11시간)까지 자기를 부르지 않게 하는 마지막 둑이다.
//  - **한 인스턴스에서 홉은 하나만** 돈다(`activeHop`). Fluid 는 한 인스턴스에 요청을 겹쳐 보낼 수 있는데, 세션 주입(`injectSession`)과
//    실행 행 리스너(`setRunListener`)가 모듈 상태라 두 홉이 겹치면 서로의 JWT·실행 행을 덮는다. 그래서 확인과 세움 사이에 `await` 가 없다.
//    `maxDuration` 을 넘겨 `waitUntil` 만 버려지고 프로세스가 남으면 바쁨이 영원히 서 있게 된다 — `HOP_STALE_MS` 가 지난 바쁨은 낡은 것으로 본다.
//  - **홉 동안 심장은 idle 로 내려가지 않는다** — 단계 사이에 idle 이 보이면 로컬 워커가 그 틈에 같은 글을 집는다. idle 은 홉 끝의 `close()` 한 번뿐이고,
//    사슬은 그 뒤에 부르므로 다음 홉이 자기 심장에 막히지 않는다.
//  - 응답 본문은 상태 낱말 하나다. 토큰·오류 원문은 싣지 않는다 — 오류는 이 함수의 로그에만 첫 줄로 남는다.
import { createClient } from '@supabase/supabase-js';
import { probeExcludedAt } from './postExclusion.mjs';
import { setRunListener } from './runLog.mjs';
import { createSupabase, injectSession, jwtExpiresAt, resolveSupabaseCredentials, sessionUsableUntil } from './supabaseClient.mjs';
import { PROJECT_URL, PUBLISHABLE_KEY } from './supabasePublic.mjs';
import { createWorkerCycle } from './workerCycle.mjs';
import { startHeartbeat } from './workerHeartbeat.mjs';
import { pickRequests, planCycle } from './workerLoop.mjs';
import { REMOTE_WORKER_HOST, closeRequests, localWorkerAlive, readWorkerPeers, readWorkerState, remoteWorkerBusy, takeRequests } from './workerQueue.mjs';
import { runPipelineStep } from './workerSteps.mjs';

/** 한 홉의 분석이 읽는 글 수 — 글당 ~30초(ADR-028 「맥락」) × 5 + 수집·반영·콜드 스타트 여유 < 300초(`maxDuration`). */
export const HOP_ANALYZE_CAP = 5;
/** 다음 홉을 부르려면 JWT 실효(exp − 30분)가 이만큼 남아야 한다 — 모자라면 그 홉의 단계 스크립트가 `createSupabase` 에서 거부된다. */
export const HOP_BUDGET_S = 5 * 60;
/**
 * 깨우기 한 번이 도는 홉의 상한 = **Vercel 이 허락하는 깊이**. 함수가 자기를 부르는 사슬을 Vercel 이 4번째 자기 호출에서 508(INFINITE_LOOP_DETECTED)로 끊는다
 * (2026-10-08 실측: 브라우저 깨우기 1 + 자기 호출 3 = 4홉이 돌고 다섯 번째 호출이 508). 감지 방식이 공개돼 있지 않아 피해 가지 않고 그 상한에 맞춘다 —
 * 12 로 두면 5홉째에서 508 을 맞고 조용히 멈춘다(화면은 서버 배지가 사라져 끝난 것처럼 보인다). 그래서 깨우기 한 번 = 글 최대 20건이고, 「저수지 30건」 은 두 번 깨워야 한다.
 */
export const MAX_HOPS = 4;
/** 사슬 호출이 다음 홉의 번호(0부터)를 싣는 헤더. 첫 깨우기(`/admin`)에는 없다 = 0. 인증을 통과한 운영자만 싣을 수 있어 믿어도 된다. */
export const HOP_HEADER = 'X-Zgnn-Hop';
/** 이만큼 지난 바쁨은 낡았다 — `maxDuration`(300초) + 여유. 그 뒤에 온 깨우기는 새 홉을 세운다. */
export const HOP_STALE_MS = 310_000;

const defaultLog = (line) => console.log(`[worker] ${line}`);
const firstLine = (e) => String(e?.message ?? e).split('\n')[0].slice(0, 200);

let activeHop = null; // { startedAt } — 이 인스턴스에서 도는 홉
let wakePending = false; // 홉이 도는 동안 busy 로 돌려보낸 깨우기가 있다 — 그 홉의 사슬 판단이 한 번 소비한다

/** 이 인스턴스에서 홉이 도는 중인가(낡은 바쁨은 아니다) — `handleRun` 이 202 busy 를 고르는 데 쓴다. */
export const isBusy = (at = Date.now()) => activeHop !== null && at - activeHop.startedAt < HOP_STALE_MS;

/** `Authorization: Bearer <토큰>` → 토큰. 다른 꼴이면 null. */
export function bearerToken(header) {
  const match = /^Bearer\s+(\S+)$/i.exec(typeof header === 'string' ? header.trim() : '');
  return match ? match[1] : null;
}

/**
 * 이번 홉 뒤에 자기를 한 번 더 부를까. 다 맞아야 한다 — Claude 한도에 **안 걸렸고** · 이번 홉이 **줄였고** · **남은 일**이 있고 ·
 * 사슬이 **`MAX_HOPS` 안**이고 · JWT 실효가 **한 홉 이상** 남았다.
 * "줄였고" 가 없으면 403 으로 계속 실패하는 글 하나(요청 글 수가 안 준다)가 JWT 가 끝날 때까지 홉마다 한도를 태운다. 줄였나는 `runCycle` 의 `progressed` 하나만 본다 —
 * 수집이 성공(code 0)했다는 것만으로는 아니다: 검색이 실패한 추가 수집 요청은 queued 로 남고 collect 는 0 을 돌려준다(그 줄 하나가 몇 초짜리 홉을 수천 번 부른다).
 * `wakePending` — 이 홉이 도는 동안 busy 로 돌려보낸 깨우기가 있었다. 그 깨우기가 가져온 일은 이 홉이 줄였을 리 없으니 진척만 건너뛰고 나머지는 그대로 본다.
 * @param {{ history: { progressed: boolean, rateLimited: boolean }[], nextSteps: object[], usableUntilSec: number, nowSec: number, hop?: number, wakePending?: boolean }} p
 * @returns {{ chain: boolean, why: string }}
 */
export function shouldChain({ history, nextSteps, usableUntilSec, nowSec, hop = 0, wakePending: pending = false }) {
  if (history.some((h) => h.rateLimited)) return { chain: false, why: 'Claude 한도 — 사슬을 멈춘다(요청은 queued 로 남아 리셋 뒤 이어 간다)' };
  if (!pending && !history.some((h) => h.progressed)) return { chain: false, why: '이번 홉이 줄인 일이 없다 — 같은 실패를 되풀이하지 않게 멈춘다' };
  if (nextSteps.length === 0) return { chain: false, why: '남은 일 없음' };
  if (hop + 1 >= MAX_HOPS) return { chain: false, why: `사슬 ${MAX_HOPS}홉 상한 — 남은 일은 다음 버튼이나 로컬 워커가` };
  const left = usableUntilSec - nowSec;
  if (!Number.isFinite(left) || left < HOP_BUDGET_S) {
    const minutes = Number.isFinite(left) ? `${Math.max(0, Math.floor(left / 60))}분` : '알 수 없음';
    return { chain: false, why: `세션 실효가 한 홉(${HOP_BUDGET_S / 60}분)보다 짧다(${minutes}) — 남은 일은 다음 버튼이나 로컬 워커가` };
  }
  const why = pending ? '도는 중에 온 깨우기' : `남은 일 ${nextSteps.length}단계`;
  return { chain: true, why: `${why} — 다음 홉(${hop + 2}/${MAX_HOPS})을 부른다` };
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
 * `POST /api/run`. 순서가 곧 규칙이다 — 인증(401) → 운영자(403) → 로컬 워커(200 local) → 이 인스턴스가 바쁨(202 busy, 깨우기를 적어 둔다) →
 * 다른 인스턴스가 홉 중(202 busy) → 202 started + `waitUntil(startHop(token, hop))`.
 * @param {Request} request
 * @param {{
 *   waitUntil: (p: Promise<unknown>) => void,
 *   createUserClient?: (token: string) => object,
 *   readPeers?: (client: object) => Promise<object[]>,
 *   isBusy?: (at: number) => boolean,
 *   startHop?: (token: string, hop: number) => Promise<unknown>,
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
    startHop = (token, hop) => runHop(token, { hop }),
    log = defaultLog,
    now = Date.now,
  } = deps;
  if (request.method !== 'POST') return reply(405, 'method-not-allowed', { Allow: 'POST' });
  const token = bearerToken(request.headers.get('authorization'));
  if (!token) return reply(401, 'unauthorized');
  // 서명은 Supabase 가 본다. 여기서는 꼴과 실효만 — 홉이 어차피 거부할 토큰(`createSupabase` 의 30분 앞당김)이면 네트워크를 쓰지 않는다.
  if (!(sessionUsableUntil(jwtExpiresAt(token)) > now() / 1000)) return reply(401, 'unauthorized');

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
  // 인증 뒤에만 읽는다. 숫자가 아니면 첫 깨우기(0).
  const rawHop = request.headers.get(HOP_HEADER) ?? '';
  const hop = /^\d{1,4}$/.test(rawHop) ? Number(rawHop) : 0;

  let peers = null;
  try {
    peers = await readPeers(client);
  } catch (e) {
    log(`workers 조회 실패(${firstLine(e)}) — 비키지 않고 돈다`);
  }
  if (peers && localWorkerAlive(peers, now())) {
    log('로컬 워커가 살아 있다 — 비킨다');
    return reply(200, 'local');
  }
  // 아래 확인들과 세움(runHop 의 첫 줄) 사이에 await 가 없다 — 겹쳐 들어온 요청은 여기서 busy 를 본다.
  // 이 인스턴스의 바쁨을 먼저 본다 — 그 홉도 vercel 행을 바쁘게 쓰므로 순서가 바뀌면 깨우기를 적어 두지 못한다.
  if (busy(now())) {
    wakePending = true;
    return reply(202, 'busy');
  }
  if (peers && remoteWorkerBusy(peers, now())) {
    log('다른 서버 인스턴스가 홉을 도는 중 — 비킨다');
    return reply(202, 'busy');
  }
  waitUntil(startHop(token, hop));
  return reply(202, 'started');
}

/**
 * 홉 하나 — 세션 주입 → 심장(`host: 'vercel'`) → 한 바퀴(분석 하나·글 5건) → 심장 idle → 다시 계획해 사슬을 이을지 → 주입·리스너·바쁨을 되돌린 **뒤에** 사슬.
 * 되돌린 뒤에 부르는 이유: 다음 홉 요청이 같은 인스턴스에 떨어질 수 있다(Fluid) — 그때 바쁨이 남아 있으면 그 요청이 busy 로 버려진다.
 * **던지지 않는다** — `waitUntil` 의 거부는 로그도 없이 사라진다. 실패는 한 줄로 남기고 심장은 idle 로 닫는다.
 * 낡은 바쁨을 밀어내고 새 홉이 섰으면, 늦게 끝난 옛 홉은 주입·리스너·바쁨을 건드리지 않고 사슬도 걸지 않는다(새 홉의 것이다).
 * @param {string} token
 * @param {{ hop?: number, chain?: (token: string, nextHop: number) => Promise<void>, version?: string|null, log?: (line: string) => void, now?: () => number, [dep: string]: unknown }} [deps]
 * @returns {Promise<{ chain: boolean, why: string }>}
 */
export async function runHop(token, deps = {}) {
  const {
    hop = 0,
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
  const startedAt = now();
  if (isBusy(startedAt)) {
    log('이 인스턴스에서 홉이 이미 돈다 — 겹치지 않게 넘긴다');
    return { chain: false, why: '바쁨' };
  }
  if (activeHop) log(`낡은 바쁨(${HOP_STALE_MS / 1000}초 넘음) — 새 홉을 세운다`);
  const mine = { startedAt };
  activeHop = mine;
  wakePending = false; // 지금 서는 홉이 큐를 처음부터 센다 — 그 전에 적힌 깨우기는 이 홉이 덮는다

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
      // 단계 사이의 idle 은 쓰지 않는다(머리 주석) — 한도(`rate-limited`)와 단계 이름만 쓰고, idle 은 홉 끝의 close 가 쓴다.
      setPhase: (phase) => (phase === 'idle' ? Promise.resolve() : heartbeat.setPhase(phase)),
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

    if (activeHop === mine) {
      // 다음 홉이 볼 것과 같은 눈으로 다시 계획한다 — 이번 바퀴의 `done`·`last` 를 물려받으면 방금 돈 단계가 전부 빠져 "남은 일 없음" 이 된다.
      const nextSteps = result.state ? planCycle({ ...result.state, analyzeCap: HOP_ANALYZE_CAP, now: now() }) : [];
      const pending = wakePending;
      wakePending = false;
      const usableUntilSec = sessionUsableUntil(jwtExpiresAt(token));
      decision = shouldChain({ history: result.history, nextSteps, usableUntilSec, nowSec: now() / 1000, hop, wakePending: pending });
    } else {
      decision = { chain: false, why: '낡은 홉 — 새 홉이 이어 받았다' };
    }
    log(`홉 ${hop + 1}/${MAX_HOPS} 끝 — ${result.history.length}단계 · ${decision.why}`);
  } catch (e) {
    log(`⚠️ 홉 ${hop + 1}/${MAX_HOPS} 실패 — ${firstLine(e)}`);
  } finally {
    const current = activeHop === mine;
    if (current) listen(null);
    if (heartbeat) {
      try {
        await heartbeat.close();
      } catch {
        /* 심장 닫기는 fail-soft(workerHeartbeat.mjs) — 5분 뒤 화면이 멎은 것으로 본다 */
      }
    }
    if (current) {
      restore?.();
      activeHop = null;
    }
  }

  if (decision.chain) {
    try {
      await chain(token, hop + 1);
    } catch (e) {
      log(`⚠️ 다음 홉을 못 불렀다(${firstLine(e)}) — 남은 일은 다음 버튼이나 로컬 워커가`);
    }
  }
  return decision;
}
