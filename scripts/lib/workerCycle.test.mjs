import { describe, expect, it, vi } from 'vitest';
import { STEP_HOOKS, createWorkerCycle } from './workerCycle.mjs';

const none = { collect: [], analyze: [], apply: [] };
const state = (patch = {}) => ({ collectQueued: 0, requestedPosts: 0, approved: 0, requests: none, ...patch });

/**
 * 가짜 의존성 — DB 대신 상태를 차례로 돌려주고, 단계는 `steps[name]` 이 정한다(기본 exit 0).
 * `closed` 에는 요청 행마다 `requestClose` 가 정한 patch 가 쌓인다.
 */
function harness({ resident = false, states, steps = {}, sessionOk = true, lose = [], ...extra } = {}) {
  const queue = [...states];
  const calls = { runStep: [], taken: [], closed: [], phases: [], ensure: 0, paused: [], order: [] };
  let cycle;
  const deps = {
    resident,
    readState: async () => (queue.length > 1 ? queue.shift() : queue[0]),
    ensureSession: async () => {
      calls.ensure += 1;
      calls.order.push('ensure');
      return sessionOk;
    },
    runStep: async (name, argv, hooks) => {
      calls.runStep.push({ name, argv, hooks });
      return (await steps[`${name} ${argv.join(' ')}`.trim()]?.({ hooks, cycle })) ?? 0;
    },
    takeRequests: async (rows) => {
      calls.taken.push(rows.map((row) => row.id));
      return rows.filter((row) => !lose.includes(row.id)); // lose — 남이 먼저 집은 줄
    },
    closeRequests: async (rows, decide) => {
      calls.order.push('close');
      for (const row of rows) calls.closed.push({ id: row.id, ...decide(row) });
    },
    setPhase: async (phase) => {
      calls.phases.push(phase);
    },
    onPause: (until) => calls.paused.push(until),
    log: () => {},
    now: () => Date.parse('2026-10-07T03:00:00Z'),
    ...extra,
  };
  cycle = createWorkerCycle(deps);
  return { cycle, calls };
}

const names = (calls) => calls.runStep.map(({ name, argv }) => `${name} ${argv.join(' ')}`.trim());

describe('createWorkerCycle — 원자 집기와 비킴(ADR-028)', () => {
  it('요청 줄을 하나도 못 집었으면 그 단계를 건너뛴다(같은 바퀴에서 다시 고르지도 않는다)', async () => {
    const q1 = { id: 'q1', kind: 'analyze', args: { limit: 10 } };
    const { cycle, calls } = harness({ states: [state({ requests: { ...none, analyze: [q1] } })], lose: ['q1'] });
    expect(await cycle.runCycle()).toMatchObject({ ran: 1, code: 0 });
    expect(names(calls)).toEqual([]);
    expect(calls.closed).toEqual([]);
  });

  it('일부만 집히면 집힌 줄만 돌리고 닫는다', async () => {
    const r1 = { id: 'r1', kind: 'collect' };
    const r2 = { id: 'r2', kind: 'collect' };
    const { cycle, calls } = harness({ states: [state({ requests: { ...none, collect: [r1, r2] } }), state()], lose: ['r2'] });
    await cycle.runCycle();
    expect(names(calls)).toEqual(['collect']);
    expect(calls.closed.map((c) => c.id)).toEqual(['r1']);
  });

  it('정기 수집이 겸한 collect 는 요청을 못 집어도 요청 없이 돈다', async () => {
    const r1 = { id: 'r1', kind: 'collect' };
    const { cycle, calls } = harness({ states: [state({ requests: { ...none, collect: [r1] } }), state()], lose: ['r1'] });
    await cycle.runCycle({ daily: true });
    expect(names(calls)).toEqual(['collect']);
    expect(calls.closed).toEqual([]);
  });

  it('요청만으로 선 collect 는 못 집으면 건너뛴다', async () => {
    const r1 = { id: 'r1', kind: 'collect' };
    const { cycle, calls } = harness({ states: [state({ requests: { ...none, collect: [r1] } })], lose: ['r1'] });
    await cycle.runCycle();
    expect(names(calls)).toEqual([]);
  });

  it('서버 워커가 일하는 중(remoteBusy)이면 바퀴를 넘기고, 정기 수집은 다음으로 미룬다', async () => {
    const { cycle, calls } = harness({ states: [state({ collectQueued: 1, remoteBusy: true })] });
    expect(await cycle.runCycle({ daily: true })).toMatchObject({ ran: 0, code: 0, dailyDone: false });
    expect(names(calls)).toEqual([]);
  });
});

describe('createWorkerCycle — 서버 워커의 홉(analyzeCap · stopAfter · history, ADR-028 결정 5)', () => {
  const hop = { analyzeCap: 5, stopAfter: (step) => step.step === 'analyze' };

  it('분석 하나를 돈 뒤 다시 세고 멈춘다 — 수집은 앞에서 돌고, 반영은 다음 홉으로 남는다', async () => {
    const { cycle, calls } = harness({
      ...hop,
      states: [state({ collectQueued: 1 }), state({ requestedPosts: 8, approved: 1 }), state({ requestedPosts: 3, approved: 2 })],
    });
    const result = await cycle.runCycle();
    expect(names(calls)).toEqual(['collect --only-requests', 'analyze --requested-only --limit 5']);
    expect(result).toMatchObject({ ran: 2, code: 0, state: { requestedPosts: 3, approved: 2 } });
    expect(result.history).toEqual([
      { key: 'collect', step: 'collect', code: 0, rateLimited: false, remainder: 0, progressed: true },
      { key: 'analyze:requested', step: 'analyze', code: 0, rateLimited: false, remainder: 0, progressed: true },
    ]);
  });

  it('「지금 분석 N건」 은 cap 만 돌고 남은 수가 closeRequests 까지 간다(성공이면 queued + limit 남은 수)', async () => {
    const q1 = { id: 'q1', kind: 'analyze', args: { limit: 12 } };
    const { cycle, calls } = harness({
      ...hop,
      states: [state({ requests: { ...none, analyze: [q1] } }), state({ requests: { ...none, analyze: [q1] } })],
      steps: {
        'analyze --limit 5': ({ cycle: c }) => {
          c.onRunStarted({ id: 'run-3', end: async () => {} });
          return 0;
        },
      },
    });
    const result = await cycle.runCycle();
    expect(names(calls)).toEqual(['analyze --limit 5']);
    expect(calls.closed).toEqual([{ id: 'q1', patch: { status: 'queued', taken_at: null, args: { limit: 7 }, run_id: 'run-3' }, gaveUp: false }]);
    expect(result.history).toEqual([{ key: 'analyze:limit', step: 'analyze', code: 0, rateLimited: false, remainder: 7, progressed: true }]);
  });

  it('진척 — 다시 센 수가 그대로면 false, 「지금 분석」 은 실패면 false, 한도는 rateLimited', async () => {
    const stuck = harness({ ...hop, states: [state({ requestedPosts: 2 }), state({ requestedPosts: 2 })] });
    expect((await stuck.cycle.runCycle()).history).toEqual([
      { key: 'analyze:requested', step: 'analyze', code: 0, rateLimited: false, remainder: 0, progressed: false },
    ]);

    const q1 = { id: 'q1', kind: 'analyze', args: { limit: 10 } };
    const limited = harness({
      ...hop,
      states: [state({ requests: { ...none, analyze: [q1] } }), state()],
      steps: {
        'analyze --limit 5': ({ hooks }) => {
          hooks.onRateLimit('usage limit reached');
          return 1;
        },
      },
    });
    const result = await limited.cycle.runCycle();
    expect(result.history).toEqual([{ key: 'analyze:limit', step: 'analyze', code: 1, rateLimited: true, remainder: 5, progressed: false }]);
    // 한도로 끊긴 실패는 남은 몫이 아니라 원래 수로 되돌린다
    expect(limited.calls.closed[0].patch).toEqual({ status: 'queued', taken_at: null, args: { limit: 10, attempts: 1 } });
  });

  it('남이 먼저 집어 건너뛴 단계는 history 에 없고 stopAfter 도 걸리지 않는다 — 뒤의 반영이 그 홉에서 돈다', async () => {
    const q1 = { id: 'q1', kind: 'analyze', args: { limit: 10 } };
    const { cycle, calls } = harness({
      ...hop,
      states: [state({ approved: 1, requests: { ...none, analyze: [q1] } }), state({ approved: 1 }), state()],
      lose: ['q1'],
    });
    const result = await cycle.runCycle();
    expect(names(calls)).toEqual(['apply']);
    expect(result.history.map((h) => h.key)).toEqual(['apply']);
  });

  it('다시 못 셌으면(null) 진척이 아니다', async () => {
    const { cycle } = harness({ ...hop, states: [state({ requestedPosts: 2 }), null] });
    const result = await cycle.runCycle();
    expect(result).toMatchObject({ code: 1, state: null });
    expect(result.history[0].progressed).toBe(false);
  });
});

describe('createWorkerCycle — 한 바퀴의 조율(17 리뷰 17)', () => {
  it('단계마다 다시 센다 — 수집이 만든 요청 글을 분석이, 분석이 만든 승인을 반영이 이어받는다', async () => {
    const { cycle, calls } = harness({
      states: [state({ collectQueued: 1 }), state({ requestedPosts: 2 }), state({ approved: 1 }), state()],
    });
    expect(await cycle.runCycle()).toMatchObject({ ran: 3, code: 0, dailyDone: true });
    expect(names(calls)).toEqual(['collect --only-requests', 'analyze --requested-only', 'apply']);
    // 단계는 묻지 않고(키 게이트) 신호를 갖지 않는다(워커가 받는다)
    expect(calls.runStep[0].hooks).toMatchObject(STEP_HOOKS);
    expect(typeof calls.runStep[1].hooks.onRateLimit).toBe('function');
  });

  it('once 는 첫 실패에서 멈추고 그 코드로 끝난다 — 상주는 다음 단계로 간다', async () => {
    const failing = { 'collect --only-requests': () => 3 };
    const once = harness({ states: [state({ collectQueued: 1, approved: 1 })], steps: failing });
    expect(await once.cycle.runCycle()).toMatchObject({ ran: 1, code: 3 });
    expect(names(once.calls)).toEqual(['collect --only-requests']);

    const resident = harness({ resident: true, states: [state({ collectQueued: 1, approved: 1 })], steps: failing });
    expect(await resident.cycle.runCycle()).toMatchObject({ ran: 2, code: 3 });
    expect(names(resident.calls)).toEqual(['collect --only-requests', 'apply']);
  });

  it('실행 행이 서기 전에 실패한 요청(잠금·키)은 queued 로 되돌리고, 닫기 전에 세션을 본다', async () => {
    const q1 = { id: 'q1', kind: 'analyze', args: { limit: 10 } };
    const { cycle, calls } = harness({
      states: [state({ requests: { ...none, analyze: [q1] } }), state()],
      steps: { 'analyze --limit 10': () => 1 },
    });
    expect(await cycle.runCycle()).toMatchObject({ code: 1 });
    expect(calls.taken).toEqual([['q1']]);
    expect(calls.closed).toEqual([{ id: 'q1', patch: { status: 'queued', taken_at: null, args: { limit: 10, attempts: 1 } }, gaveUp: false }]);
    expect(calls.order).toEqual(['ensure', 'close']);
  });

  it('실행 행이 선 요청은 done + run_id', async () => {
    const p1 = { id: 'p1', kind: 'apply', args: null };
    const { cycle, calls } = harness({
      states: [state({ requests: { ...none, apply: [p1] } }), state()],
      steps: {
        apply: ({ cycle: c }) => {
          c.onRunStarted({ id: 'run-7', end: async () => {} });
          return 0;
        },
      },
    });
    await cycle.runCycle();
    expect(calls.closed).toEqual([{ id: 'p1', patch: { status: 'done', run_id: 'run-7' }, gaveUp: false }]);
  });

  it('Claude 한도면 남은 분석을 쉬고(수집·반영은 돈다), 한도로 끊긴 요청은 queued 로 되돌린다', async () => {
    const q1 = { id: 'q1', kind: 'analyze', args: { limit: 10 } };
    const { cycle, calls } = harness({
      resident: true,
      states: [state({ requestedPosts: 3, approved: 1, requests: { ...none, analyze: [q1] } })],
      steps: {
        'analyze --requested-only': ({ hooks, cycle: c }) => {
          c.onRunStarted({ id: 'run-1', end: async () => {} });
          hooks.onRateLimit('5-hour limit reached ∙ resets 3pm');
          return 1;
        },
      },
    });
    await cycle.runCycle();
    expect(names(calls)).toEqual(['analyze --requested-only', 'apply']); // 「지금 분석」 은 쉬는 동안 빠진다 — 요청은 queued 그대로
    expect(calls.taken).toEqual([]);
    expect(calls.paused).toHaveLength(1);
    expect(cycle.idlePhase()).toBe('rate-limited');
    expect(calls.phases.at(-1)).toBe('rate-limited');

    // 「지금 분석」 자신이 한도로 끊기면 실행 행이 섰어도 queued
    const again = harness({
      states: [state({ requests: { ...none, analyze: [q1] } }), state()],
      steps: {
        'analyze --limit 10': ({ hooks, cycle: c }) => {
          c.onRunStarted({ id: 'run-2', end: async () => {} });
          hooks.onRateLimit('usage limit reached');
          return 1;
        },
      },
    });
    await again.cycle.runCycle();
    expect(again.calls.closed[0].patch).toMatchObject({ status: 'queued', args: { limit: 10, attempts: 1 } });
  });

  it('상태를 못 읽은 바퀴는 실패다 — once 는 exit 1, 정기 수집은 다음 wake 로(dailyDone false)', async () => {
    const { cycle, calls } = harness({ states: [null] });
    expect(await cycle.runCycle({ daily: true })).toMatchObject({ ran: 0, code: 1, dailyDone: false, state: null });
    expect(calls.runStep).toHaveLength(0);
  });

  it('지난번 실행이 수를 줄였으면 다음 바퀴가 바로 다시 돈다 — 그대로면 기다린다(17 리뷰 2)', async () => {
    const { cycle, calls } = harness({
      resident: true,
      states: [state({ requestedPosts: 5 }), state({ requestedPosts: 2 }), state({ requestedPosts: 2 }), state({ requestedPosts: 2 }), state({ requestedPosts: 2 })],
    });
    await cycle.runCycle(); // 5 → 2: 진척
    await cycle.runCycle(); // 진척이 있었으니 다시 — 2 → 2: 그대로
    await cycle.runCycle(); // 기다린다
    expect(names(calls)).toEqual(['analyze --requested-only', 'analyze --requested-only']);
  });

  it('abortRun — 도는 단계의 실행 행을 실패로 닫는다, 단계가 끝난 뒤엔 아무것도 안 한다', async () => {
    const end = vi.fn(async () => {});
    let during;
    const { cycle } = harness({
      states: [state({ approved: 1 }), state()],
      steps: {
        apply: async ({ cycle: c }) => {
          c.onRunStarted({ id: 'run-9', end });
          during = c.abortRun('중단(SIGINT)');
          return 0;
        },
      },
    });
    await cycle.runCycle();
    await during;
    expect(end).toHaveBeenCalledWith({ status: 'failed', error: '중단(SIGINT)' });
    await cycle.abortRun('중단(SIGINT)');
    expect(end).toHaveBeenCalledTimes(1);
  });
});
