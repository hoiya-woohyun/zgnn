// 상주 워커(`pnpm data`)와 한 바퀴(`pnpm data once`) — ADR-024 결정 3·4·5, docs/todo/17 T3.
// 터미널에 떠 있다가 DB 의 상태 칸(추가 수집 요청 · 요청 글 · 승인 후보)과 `pipeline_requests` 를 보고 collect → analyze → apply 를 그때 돈다.
// 판단은 `lib/workerLoop.mjs`(순수), 세기는 `lib/workerQueue.mjs`, 심장은 `lib/workerHeartbeat.mjs`. 여기는 순서·타이머·신호·세션뿐이다.
//
// 왜 이렇게 생겼나 —
//  - **단계는 각 스크립트의 `main(argv)` 를 같은 프로세스에서 부른다**(scripts/data.mjs 의 runStep). 코드를 옮기지 않는다. 그 대가로 단계가
//    `process.exit` 하는 자리는 워커도 끝낸다 — 그래서 세션은 단계를 부르기 **전에** 여기서 본다(`createSupabase` 는 만료면 exit 1 한다).
//  - 깨우기는 셋이고 전부 같은 `wake()` 다: Realtime(`lib/workerRealtime.mjs`, 주 — 이벤트가 깨운 단계는 재시도 간격을 안 본다) · 60초 폴링(안전망) ·
//    정기 수집(09:00 KST). `--no-realtime` 이면 폴링만(디버깅용).
//    정기 수집은 긴 setTimeout 이 아니라 **폴링이 시각을 넘었는지 본다** — 맥이 잠든 동안 타이머 시계는 멈춰 있어, 하루짜리 타이머는 깨어난 뒤에도 몇 시간 늦는다.
//  - 한 단계가 실패해도 워커는 다음 단계로 간다(승인 후보 반영은 분석 실패와 무관하다). `once` 는 T1 대로 거기서 멈춘다.
//  - 로그는 한 줄씩 시각을 붙이고, 각 스크립트의 요약 줄은 그대로 흘려보낸다.
import { formatElapsed } from '../src/lib/runSummary.ts';
import { setRunListener } from './lib/runLog.mjs';
import { createSupabase, resolveSupabaseCredentials } from './lib/supabaseClient.mjs';
import { startHeartbeat } from './lib/workerHeartbeat.mjs';
import {
  RATE_LIMIT_FALLBACK_MS,
  claudeResetAt,
  clockStamp,
  createWaker,
  formatStep,
  nextDailyAt,
  parseOnceArgs,
  parseResidentArgs,
  pickRequests,
  planCycle,
  recordRun,
} from './lib/workerLoop.mjs';
import { checkWorkerSchema, markRequests, readWorkerState } from './lib/workerQueue.mjs';
import { startRealtime } from './lib/workerRealtime.mjs';

const POLL_MS = 60_000;
const SHUTDOWN_WAIT_MS = 3_000;
const STEP_LABEL = { collect: '수집', analyze: '분석', apply: '반영' };

const log = (line) => console.log(`${clockStamp()} ${line}`);
const timeOf = (ms) => clockStamp(new Date(ms)).slice(1, -1);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** 세션이 쓸 만한가 — `createSupabase` 와 같은 판정(순수)을 exit 없이. 문제가 있으면 그 오류(`loginNeeded` 표식), 없으면 null. */
function sessionProblem() {
  try {
    resolveSupabaseCredentials();
    return null;
  } catch (e) {
    return e;
  }
}

/**
 * @param {string[]} argv
 * @param {{ mode: 'resident'|'once', runStep: (name: string, argv: string[], hooks?: object) => Promise<number> }} opts
 */
export async function main(argv, { mode, runStep }) {
  const resident = mode === 'resident';
  // 상주 워커는 사람 터미널에서만 — 에이전트가 사용법을 보려고 `pnpm data` 를 치면 키체인 세션·네이버 키 파일로 진짜 수집·분석이 돌고,
  // 셸 호출도 끝나지 않는다. `once` 는 막지 않는다(`--dry-run` 은 읽기만이고, 한 바퀴는 끝난다).
  if (resident && process.env.CLAUDECODE) {
    console.error('상주 워커(pnpm data)는 사람 터미널에서만 띄운다 — Claude Code 세션 안이다. 사용법은 pnpm data help, 계획만 보려면 pnpm data once --dry-run.');
    return 1;
  }
  let dryRun = false;
  let useRealtime = false;
  try {
    if (resident) ({ realtime: useRealtime } = parseResidentArgs(argv));
    else ({ dryRun } = parseOnceArgs(argv));
  } catch (e) {
    console.error(e.message);
    return 2;
  }

  // ── 세션 ─────────────────────────────────────────────────────────────
  let client = null;
  let heartbeat = null;
  let realtime = null;
  let shutdown = async (code) => process.exit(code); // 상주 모드에서 아래가 바꾼다
  let claudePausedUntil = 0;
  const idlePhase = () => (Date.now() < claudePausedUntil ? 'rate-limited' : 'idle');

  /**
   * 세션이 끝났으면 상주 워커는 **그 자리에서** 다시 로그인한다(ADR-024 결정 5 — `login.mjs` 의 숨김 입력). TTY 가 아니면 물을 수 없어 끝낸다.
   * 로그인해도 안 풀리는 거부(service 키 트립와이어 등)는 이유를 찍고 끝낸다. `once` 는 묻지 않는다 — 안내만 하고 false.
   */
  async function ensureSession() {
    const problem = sessionProblem();
    if (!problem) return true;
    if (!resident || !problem.loginNeeded) {
      console.error(problem.message);
      if (resident) await shutdown(1);
      return false;
    }
    log('로그인 세션이 끝났다 — 여기서 다시 로그인한다(비밀번호는 화면에 안 찍힌다)');
    await heartbeat?.setPhase('login-needed');
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      console.error('터미널(TTY)이 아니라 물을 수 없다 — 다른 터미널에서 pnpm data login 한 뒤 pnpm data 를 다시 켠다.');
      await shutdown(1);
      return false;
    }
    const { main: login } = await import('./login.mjs');
    const code = await login();
    if (code === 130) await shutdown(130);
    if (code) {
      log('로그인 실패 — 다음 바퀴(60초 뒤)에 다시 묻는다');
      return false;
    }
    client = createSupabase();
    heartbeat?.setClient(client);
    await realtime?.restart(client); // 옛 채널은 옛 토큰을 쥐고 있다(workerRealtime.mjs 머리 주석)
    await heartbeat?.setPhase(idlePhase());
    return true;
  }

  if (!(await ensureSession())) return 1;
  client = createSupabase();
  {
    const problem = await checkWorkerSchema(client);
    if (problem) {
      console.error(problem);
      return 1;
    }
  }

  // ── 한 바퀴 ──────────────────────────────────────────────────────────
  let last = {}; // 단계 → 끝난 직후 다시 센 수(폴링 재시도 간격, `isDue`)
  // Realtime 이 깨운 단계 key — 그 단계가 **시작할 때** 지운다. 도는 중에 온 이벤트는 다시 서서 다음 바퀴가 한 번 더 본다(이벤트를 잃지 않는다).
  const forced = new Set();
  let current = { requestIds: [], runId: null };
  let waker = null;

  // 단계 안에서 실행 행이 서면(`beginRun`) 그 id 를 워커 행에 잇는다 — `main` 은 exit code 만 돌려주므로 이것이 유일한 길이다.
  setRunListener(({ id }) => {
    current.runId = id;
    heartbeat?.setRunId(id);
  });

  async function readState() {
    if (!(await ensureSession())) return null;
    const state = await readWorkerState(client);
    return { ...state, requests: pickRequests(state.requestRows, Date.now()) };
  }

  function onRateLimit(message) {
    const now = Date.now();
    claudePausedUntil = claudeResetAt(message, now) ?? now + RATE_LIMIT_FALLBACK_MS;
    log(`Claude 구독 한도 — ${timeOf(claudePausedUntil)} 까지 분석을 쉰다(수집·반영은 그대로)`);
    if (resident) setTimeout(() => waker?.wake(), claudePausedUntil - now + 1_000);
  }

  async function runOne(step) {
    const label = STEP_LABEL[step.step];
    const startedAt = Date.now();
    log(`${label} 시작 — ${step.reason}`);
    forced.delete(step.key);
    current = { requestIds: step.requestIds, runId: null };
    await markRequests(client, step.requestIds, { status: 'taken', taken_at: new Date().toISOString() });
    await heartbeat?.setPhase(step.step);
    let code;
    try {
      code = await runStep(step.step, step.args, step.step === 'analyze' ? { onRateLimit } : {});
    } catch (e) {
      console.error(e);
      code = 1;
    }
    // 실패해도 done — 실행 행이 실패를 기록한다. 남겨 두면 10분마다 같은 실패를 되풀이한다. run_id 는 행이 선 뒤에만(FK).
    await markRequests(client, step.requestIds, { status: 'done', ...(current.runId ? { run_id: current.runId } : {}) });
    await heartbeat?.setPhase(idlePhase());
    log(`${label} 끝 — ${code === 0 ? '성공' : `exit ${code}`} · ${formatElapsed(Date.now() - startedAt)}`);
    return code;
  }

  /** 단계마다 다시 센다 — 수집이 요청 글을 만들고, 분석이 auto 후보를 approved 로 넣는다(workerLoop.mjs 머리 주석). */
  async function runCycle({ daily }) {
    if (heartbeat && heartbeat.phase() !== idlePhase()) await heartbeat.setPhase(idlePhase()); // 한도 휴식이 끝났으면 idle 로
    const done = new Set();
    let firstFailure = 0;
    let state = await readState();
    while (state) {
      const steps = planCycle({ ...state, isDailyTick: daily, last, done, forced, claudePausedUntil, now: Date.now() });
      if (steps.length === 0) break;
      const step = steps[0];
      done.add(step.key);
      const code = await runOne(step);
      if (code !== 0 && !firstFailure) firstFailure = code;
      state = await readState();
      if (state) last = recordRun(last, step.key, state, Date.now());
      if (code !== 0 && !resident) break;
    }
    return { ran: done.size, code: firstFailure };
  }

  // ── 한 바퀴(once) ────────────────────────────────────────────────────
  if (!resident) {
    if (dryRun) {
      const state = await readState();
      if (!state) return 1;
      const steps = planCycle({ ...state, now: Date.now() });
      console.log(
        `상태: 추가 수집 요청 ${state.collectQueued} · 요청 글 ${state.requestedPosts} · 승인 후보 ${state.approved} · ` +
          `요청(pipeline_requests) 수집 ${state.requests.collect.length} · 분석 ${state.requests.analyze.length} · 반영 ${state.requests.apply.length}`,
      );
      if (steps.length === 0) console.log('계획: 할 일 없음');
      else console.log(`계획(dry-run — 아무것도 돌리지 않는다):\n${steps.map((s) => `  ${formatStep(s)}`).join('\n')}`);
      console.log('  ※ 실제 한 바퀴는 단계마다 다시 센다 — 수집이 요청 글을 만들면 분석이, 분석이 auto 후보를 만들면 반영이 뒤따른다.');
      return 0;
    }
    const { ran, code } = await runCycle({ daily: false });
    if (ran === 0) log('할 일 없음 — 끝.');
    return code;
  }

  // ── 상주 ─────────────────────────────────────────────────────────────
  try {
    heartbeat = await startHeartbeat(client, { warn: (line) => log(line) });
  } catch (e) {
    console.error(e.message);
    return 1;
  }

  let pollTimer = null;
  let closing = false;
  // SIGINT·SIGTERM 둘 다 잡는다 — SIGTERM 을 안 잡으면 `kill` 한 번에 행이 안 닫힌 채 죽는다. 리스너를 달면 Node 의 기본 종료가 꺼지므로 직접 exit 한다.
  // 수집 중의 Ctrl-C 는 collect 자신의 핸들러도 실행 행을 닫고 exit 하려 한다 — 둘 다 닫기를 몇 초 안에 끝내고, 먼저 끝난 쪽이 프로세스를 끝낸다.
  shutdown = async (code) => {
    if (closing) return;
    closing = true;
    clearInterval(pollTimer);
    await Promise.race([Promise.all([heartbeat.close(), realtime?.close()]), sleep(SHUTDOWN_WAIT_MS)]);
    log(`워커 끝(${heartbeat.host})`);
    process.exit(code);
  };
  process.on('SIGINT', () => shutdown(130));
  process.on('SIGTERM', () => shutdown(143));

  waker = createWaker(runCycle, { onError: (e) => log(`⚠️ 이번 바퀴 실패(다음 폴링에 다시): ${e.message}`) });
  let nextDaily = nextDailyAt(Date.now());
  log(
    `워커 시작 — ${heartbeat.host} · ${useRealtime ? 'realtime + ' : 'realtime 끔(--no-realtime) · '}${POLL_MS / 1000}초마다 확인 · ` +
      `정기 수집 ${new Date(nextDaily).toLocaleString('ko-KR')} · 끝내려면 Ctrl-C`,
  );
  // 상주에서만 연다 — `once` 에서 웹소켓을 열면 이벤트 루프가 잡혀 자연 종료가 안 된다.
  if (useRealtime) {
    realtime = startRealtime(client, {
      onEvent: (key) => {
        if (key) forced.add(key);
        waker.wake();
      },
      log,
    });
  }
  pollTimer = setInterval(() => {
    const daily = Date.now() >= nextDaily;
    if (daily) nextDaily = nextDailyAt(Date.now());
    waker.wake({ daily });
  }, POLL_MS);
  await waker.wake();
  // 여기서 끝나지 않는다 — 타이머가 프로세스를 잡고, 끝은 위의 신호 처리다.
  return new Promise(() => {});
}
