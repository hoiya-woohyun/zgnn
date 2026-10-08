// 상주 워커·`once` 의 **한 바퀴**(docs/todo/17 T3.2) — 단계를 고르고(`planCycle`) 부르고(`runStep`) 요청 행을 닫고 다시 센다.
// `scripts/worker.mjs` 에서 떼어 왔다(리뷰 17): DB·세션·심장은 전부 주입이라 가짜로 조율을 테스트한다. 판단 자체는 `workerLoop.mjs`(순수)에 있다.
//
//  - 단계마다 다시 센다 — 수집이 요청 글을 만들고 분석이 auto 후보를 approved 로 넣는다(workerLoop.mjs 머리 주석).
//  - 한 단계가 실패해도 상주는 다음 단계로 간다(승인 후보 반영은 분석 실패와 무관하다). `once` 는 거기서 멈춘다.
//  - 상태를 못 읽은 바퀴(세션·네트워크)는 실패다 — `once` 는 exit 1, 상주는 정기 수집을 다음 wake 에 넘긴다(`dailyDone: false`).
import { formatElapsed } from '../../src/lib/runSummary.ts';
import { RATE_LIMIT_FALLBACK_MS, claudeResetAt, planCycle, recordRun, requestClose } from './workerLoop.mjs';

const STEP_LABEL = { collect: '수집', analyze: '분석', apply: '반영' };

/**
 * 단계를 부를 때 넘기는 hooks — 각 스크립트의 `main(argv, hooks)` 가 읽는다.
 *  - `nonInteractive`: 키가 없으면 숨김 입력으로 묻지 않고 멈춘다(워커 터미널에서 단계마다 묻고 그동안 phase 가 collect 로 멈춰 있지 않게).
 *  - `ownsSignals: false`: collect 가 자기 SIGINT 핸들러를 달지 않는다 — 신호는 워커가 받아 실행 행과 workers 행을 같이 닫는다.
 */
export const STEP_HOOKS = Object.freeze({ nonInteractive: true, ownsSignals: false });

/**
 * @param {{
 *   resident: boolean,
 *   runStep: (name: string, argv: string[], hooks: object) => Promise<number>,
 *   readState: () => Promise<object|null>,           // 세션을 보고 센 상태(+ `requests`, 서버 워커가 일하는 중이면 `remoteBusy`), 세션이 없으면 null
 *   ensureSession: () => Promise<boolean>,
 *   takeRequests: (rows: object[]) => Promise<object[]>, // 원자 집기 — 내가 집은 행만 돌려준다(남이 먼저 집은 줄은 빠진다)
 *   closeRequests: (rows: object[], decide: (row: object) => { patch: object, gaveUp: boolean }) => Promise<void>,
 *   setPhase?: (phase: string) => Promise<void>,
 *   currentPhase?: () => string|null,
 *   onPause?: (untilMs: number) => void,             // Claude 한도 — 상주가 리셋 뒤 깨울 타이머를 건다
 *   log: (line: string) => void,
 *   now?: () => number,
 * }} deps
 */
export function createWorkerCycle({ resident, runStep, readState, ensureSession, takeRequests, closeRequests, setPhase = async () => {}, currentPhase = () => null, onPause = () => {}, log, now = Date.now }) {
  let last = {}; // 단계 → 끝난 직후 다시 센 수·진척(폴링 재시도 간격, `isDue`)
  // Realtime 이 깨운 단계 key — 그 단계가 **시작할 때** 지운다. 도는 중에 온 이벤트는 다시 서서 다음 바퀴가 한 번 더 본다(이벤트를 잃지 않는다).
  const forced = new Set();
  let claudePausedUntil = 0;
  // 지금 도는 단계 — 실행 행이 서면(`onRunStarted`) id 와 닫는 핸들이 붙는다. 신호를 받은 워커가 `end` 로 그 행을 닫는다.
  let current = { requests: [], runId: null, end: null, rateLimited: false };
  const idlePhase = () => (now() < claudePausedUntil ? 'rate-limited' : 'idle');

  function onRateLimit(message) {
    const at = now();
    claudePausedUntil = claudeResetAt(message, at) ?? at + RATE_LIMIT_FALLBACK_MS;
    current.rateLimited = true;
    log(`Claude 구독 한도 — ${new Date(claudePausedUntil).toLocaleTimeString('ko-KR')} 까지 분석을 쉰다(수집·반영은 그대로)`);
    onPause(claudePausedUntil);
  }

  async function runOne(step) {
    const label = STEP_LABEL[step.step];
    const startedAt = now();
    forced.delete(step.key);
    // 요청 줄로 선 단계는 집은 줄만 한다 — 하나도 못 집었으면 다른 워커(서버·다른 PC)가 하는 일이라 건너뛴다. 정기 수집이 겸한 collect 만 요청 없이 돈다.
    const requests = step.requests.length > 0 ? await takeRequests(step.requests) : step.requests;
    if (step.requests.length > 0 && requests.length === 0 && !step.regular) {
      log(`${label} — ${step.reason} — 다른 워커가 먼저 집었다, 건너뛴다`);
      return 0;
    }
    log(`${label} 시작 — ${step.reason}`);
    current = { requests, runId: null, end: null, rateLimited: false };
    await setPhase(step.step);
    let code;
    try {
      code = await runStep(step.step, step.args, { ...STEP_HOOKS, ...(step.step === 'analyze' ? { onRateLimit } : {}) });
    } catch (e) {
      console.error(e);
      code = 1;
    }
    // 닫기 전에 세션을 다시 본다 — 긴 분석 사이에 토큰이 끝났으면 done/queued 쓰기가 조용히 0행이 된다(리뷰 4). 못 붙어도 쓰기는 시도한다(fail-soft).
    if (requests.length > 0) await ensureSession();
    const outcome = { code, runId: current.runId, rateLimited: current.rateLimited };
    await closeRequests(requests, (row) => requestClose(row, outcome));
    current = { ...current, end: null };
    await setPhase(idlePhase());
    log(`${label} 끝 — ${code === 0 ? '성공' : `exit ${code}`} · ${formatElapsed(now() - startedAt)}`);
    return code;
  }

  /** @returns {Promise<{ ran: number, code: number, dailyDone: boolean }>} */
  async function runCycle({ daily = false } = {}) {
    if (currentPhase() !== null && currentPhase() !== idlePhase()) await setPhase(idlePhase()); // 한도 휴식이 끝났으면 idle 로
    const done = new Set();
    let firstFailure = 0;
    let state = await readState();
    if (!state) firstFailure = 1; // 상태를 못 읽었다(세션·네트워크) — 할 일 없음이 아니라 실패다(리뷰 9)
    while (state) {
      if (state.remoteBusy) break; // 서버 워커가 일하는 중 — 같은 글을 둘이 분석하지 않게 이번 바퀴는 넘긴다(정기 수집은 `dailyDone: false` 로 다음에)
      const steps = planCycle({ ...state, isDailyTick: daily, last, done, forced, claudePausedUntil, now: now() });
      if (steps.length === 0) break;
      const step = steps[0];
      done.add(step.key);
      const code = await runOne(step);
      if (code !== 0 && !firstFailure) firstFailure = code;
      const before = state;
      state = await readState();
      if (state) last = recordRun(last, step.key, before, state, now());
      else if (!firstFailure) firstFailure = 1;
      if (code !== 0 && !resident) break;
    }
    return { ran: done.size, code: firstFailure, dailyDone: !daily || done.size > 0 };
  }

  return {
    runCycle,
    forced,
    idlePhase,
    /** 실행 행이 섰다(runLog 의 `setRunListener`) — id 와 닫는 핸들을 지금 단계에 잇는다. */
    onRunStarted({ id, end }) {
      current.runId = id;
      current.end = end ?? null;
    },
    /** 신호로 끝낼 때 — 도는 단계의 실행 행을 실패로 닫는다. 도는 단계가 없으면 아무것도 안 한다. */
    async abortRun(error) {
      await current.end?.({ status: 'failed', error });
    },
  };
}
