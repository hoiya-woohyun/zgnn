import { describe, expect, it } from 'vitest';
import {
  ANALYZE_REQUEST_DEFAULT_LIMIT,
  ANALYZE_REQUEST_MAX_LIMIT,
  MAX_REQUEST_ATTEMPTS,
  RETRY_AFTER_MS,
  STALE_TAKEN_MS,
  claudeResetAt,
  clockStamp,
  createWaker,
  formatStep,
  isDue,
  nextDailyAt,
  parseOnceArgs,
  parseResidentArgs,
  pickRequests,
  planCycle,
  recordRun,
  requestClose,
  requestLimit,
} from './workerLoop.mjs';

const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

describe('createWaker — 도는 중이면 끝난 뒤 한 번 더', () => {
  it('도는 중에 몇 번을 불러도 한 번만 더 돌고, 동시에 두 바퀴가 돌지 않는다', async () => {
    const gates = [deferred(), deferred()];
    let active = 0;
    let maxActive = 0;
    let runs = 0;
    const waker = createWaker(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await gates[runs++].promise;
      active -= 1;
    });
    const first = waker.wake();
    waker.wake();
    waker.wake();
    waker.wake();
    expect(waker.isRunning()).toBe(true);
    gates[0].resolve();
    await Promise.resolve();
    await Promise.resolve();
    gates[1].resolve();
    await first;
    expect(runs).toBe(2);
    expect(maxActive).toBe(1);
    expect(waker.isRunning()).toBe(false);
  });

  it('쉬는 중에 부르면 바로 한 바퀴 — 끝나면 다음 wake 가 또 돈다', async () => {
    let runs = 0;
    const waker = createWaker(async () => {
      runs += 1;
    });
    await waker.wake();
    await waker.wake();
    expect(runs).toBe(2);
  });

  it('daily 는 다음 바퀴 하나가 가져간다 — 도는 중에 와도 잃지 않는다', async () => {
    const seen = [];
    const gate = deferred();
    let first = true;
    const waker = createWaker(async ({ daily }) => {
      seen.push(daily);
      if (first) {
        first = false;
        await gate.promise;
      }
    });
    const done = waker.wake();
    waker.wake({ daily: true });
    gate.resolve();
    await done;
    expect(seen).toEqual([false, true]);
    await waker.wake();
    expect(seen).toEqual([false, true, false]);
  });

  it('바퀴가 던져도 루프는 산다 — onError 로 넘기고 한 번 더 도는 것도 그대로', async () => {
    const errors = [];
    const gate = deferred();
    let runs = 0;
    const waker = createWaker(
      async () => {
        runs += 1;
        if (runs === 1) {
          await gate.promise;
          throw new Error('boom');
        }
      },
      { onError: (e) => errors.push(e.message) },
    );
    const done = waker.wake();
    waker.wake();
    gate.resolve();
    await expect(done).resolves.toBeUndefined();
    expect(errors).toEqual(['boom']);
    expect(runs).toBe(2);
  });

  it('정기 수집을 못 돈 바퀴(dailyDone false · 던짐)는 daily 를 다음 wake 에 넘긴다 — 그 자리에서 다시 돌지 않는다(17 리뷰 9)', async () => {
    const seen = [];
    const results = [{ dailyDone: false }, undefined, { dailyDone: true }];
    const waker = createWaker(async ({ daily }) => {
      seen.push(daily);
      return results.shift();
    });
    await waker.wake({ daily: true });
    expect(seen).toEqual([true]); // 바로 다시 돌지 않는다
    expect(waker.dailyCarried()).toBe(true);
    await waker.wake(); // 다음 폴링이 가져간다
    expect(seen).toEqual([true, true]);
    expect(waker.dailyCarried()).toBe(false);

    const thrown = createWaker(
      async ({ daily }) => {
        seen.push(daily);
        if (daily) throw new Error('offline');
      },
      { onError: () => {} },
    );
    await thrown.wake({ daily: true });
    expect(thrown.dailyCarried()).toBe(true);
  });
});

describe('nextDailyAt — 다음 09:00 KST', () => {
  it('KST 오후면 다음 날 09:00, 09:00 직전이면 그날 09:00', () => {
    expect(new Date(nextDailyAt(Date.parse('2026-10-07T05:00:00Z'))).toISOString()).toBe('2026-10-08T00:00:00.000Z'); // 14:00 KST
    expect(new Date(nextDailyAt(Date.parse('2026-10-07T23:59:00Z'))).toISOString()).toBe('2026-10-08T00:00:00.000Z'); // 08:59 KST
  });

  it('정확히 09:00 이면 내일 — 방금 돈 것을 또 돌지 않는다', () => {
    expect(new Date(nextDailyAt(Date.parse('2026-10-08T00:00:00Z'))).toISOString()).toBe('2026-10-09T00:00:00.000Z');
  });

  it('UTC 로는 전날인 KST 새벽(00:30 KST)도 그날 09:00 — 날짜를 KST 로 자른다', () => {
    expect(new Date(nextDailyAt(Date.parse('2026-10-07T15:30:00Z'))).toISOString()).toBe('2026-10-08T00:00:00.000Z');
  });

  it('달·해 경계와 다른 시각', () => {
    expect(new Date(nextDailyAt(Date.parse('2026-12-31T12:00:00Z'))).toISOString()).toBe('2027-01-01T00:00:00.000Z');
    expect(new Date(nextDailyAt(Date.parse('2026-10-07T05:00:00Z'), 18)).toISOString()).toBe('2026-10-07T09:00:00.000Z');
  });
});

describe('pickRequests — queued 와 10분 넘은 taken', () => {
  const now = Date.parse('2026-10-07T05:00:00Z');
  const ago = (ms) => new Date(now - ms).toISOString();

  it('kind 별로 모으고, 막 집힌 taken · done · 모르는 kind 는 뺀다', () => {
    const rows = [
      { id: 'a', kind: 'analyze', status: 'queued', args: { limit: 10 } },
      { id: 'b', kind: 'analyze', status: 'taken', taken_at: ago(STALE_TAKEN_MS + 1) },
      { id: 'c', kind: 'analyze', status: 'taken', taken_at: ago(STALE_TAKEN_MS - 1) },
      { id: 'd', kind: 'apply', status: 'done' },
      { id: 'e', kind: 'collect', status: 'taken', taken_at: null },
      { id: 'f', kind: 'pull', status: 'queued' },
    ];
    const picked = pickRequests(rows, now);
    expect(picked.analyze.map((r) => r.id)).toEqual(['a', 'b']);
    expect(picked.collect.map((r) => r.id)).toEqual(['e']); // taken_at 이 없으면 언제 집혔는지 모른다 — 다시 집는다
    expect(picked.apply).toEqual([]);
    expect(pickRequests(undefined, now)).toEqual({ collect: [], analyze: [], apply: [] });
  });
});

describe('requestLimit', () => {
  it('요청 하나의 정수, 없거나 이상하면 기본값, 상한으로 자른다', () => {
    expect(requestLimit({ args: { limit: 30 } })).toBe(30);
    for (const args of [null, { limit: '30' }, { limit: -1 }, { limit: 2.5 }]) expect(requestLimit({ args })).toBe(ANALYZE_REQUEST_DEFAULT_LIMIT);
    expect(requestLimit({ args: { limit: 5000 } })).toBe(ANALYZE_REQUEST_MAX_LIMIT);
  });
});

describe('requestClose — 요청을 done 으로 닫을까 queued 로 되돌릴까(17 리뷰 3)', () => {
  it('성공·실행 행이 선 실패는 done(run_id 는 행이 섰을 때만)', () => {
    expect(requestClose({ args: null }, { code: 0, runId: 'run-1', rateLimited: false })).toEqual({ patch: { status: 'done', run_id: 'run-1' }, gaveUp: false });
    expect(requestClose({ args: null }, { code: 0, runId: null, rateLimited: false })).toEqual({ patch: { status: 'done' }, gaveUp: false });
    expect(requestClose({ args: null }, { code: 1, runId: 'run-1', rateLimited: false }).patch.status).toBe('done');
  });

  it('실행 행 없는 실패(잠금·키·세션)와 한도로 끊긴 실패는 queued 로, attempts 를 센다', () => {
    expect(requestClose({ args: { limit: 10 } }, { code: 1, runId: null, rateLimited: false })).toEqual({
      patch: { status: 'queued', taken_at: null, args: { limit: 10, attempts: 1 } },
      gaveUp: false,
    });
    expect(requestClose({ args: { limit: 10, attempts: 1 } }, { code: 1, runId: 'run-1', rateLimited: true }).patch).toEqual({
      status: 'queued',
      taken_at: null,
      args: { limit: 10, attempts: 2 },
    });
  });

  it('성공한 홉의 남은 몫(remainder)은 그 수를 limit 에 적어 queued 로 — attempts 는 세지 않는다(ADR-028 결정 5)', () => {
    expect(requestClose({ args: { limit: 30, attempts: 1 } }, { code: 0, runId: 'run-1', rateLimited: false, remainder: 25 })).toEqual({
      patch: { status: 'queued', taken_at: null, args: { limit: 25, attempts: 1 }, run_id: 'run-1' },
      gaveUp: false,
    });
    expect(requestClose({ args: null }, { code: 0, runId: null, rateLimited: false, remainder: 5 })).toEqual({
      patch: { status: 'queued', taken_at: null, args: { limit: 5 } },
      gaveUp: false,
    });
    // 남은 몫이 없으면 기존대로 done
    expect(requestClose({ args: { limit: 5 } }, { code: 0, runId: 'run-1', rateLimited: false, remainder: 0 }).patch).toEqual({ status: 'done', run_id: 'run-1' });
  });

  it('남은 몫이 있어도 실패·한도는 기존 규칙 — 원래 limit 그대로', () => {
    expect(requestClose({ args: { limit: 30 } }, { code: 1, runId: 'run-1', rateLimited: false, remainder: 25 }).patch).toEqual({ status: 'done', run_id: 'run-1' });
    expect(requestClose({ args: { limit: 30 } }, { code: 1, runId: 'run-1', rateLimited: true, remainder: 25 }).patch).toEqual({
      status: 'queued',
      taken_at: null,
      args: { limit: 30, attempts: 1 },
    });
    expect(requestClose({ args: { limit: 30 } }, { code: 1, runId: null, rateLimited: false, remainder: 25 }).patch.args).toEqual({ limit: 30, attempts: 1 });
  });

  it(`${MAX_REQUEST_ATTEMPTS}번째면 done 으로 닫고 gaveUp — 같은 요청이 영원히 되돌아오지 않게`, () => {
    expect(requestClose({ args: { attempts: MAX_REQUEST_ATTEMPTS - 1 } }, { code: 1, runId: null, rateLimited: false })).toEqual({
      patch: { status: 'done', args: { attempts: MAX_REQUEST_ATTEMPTS } },
      gaveUp: true,
    });
  });
});

describe('isDue · recordRun — 지워지지 않는 일감이 60초마다 다시 돌지 않게', () => {
  const now = 1_000_000_000;

  it('처음 · 수가 늘면 · 30분 지나면 돈다. 같으면 기다린다. 0 이면 안 돈다', () => {
    expect(isDue(2, undefined, now)).toBe(true);
    expect(isDue(0, undefined, now)).toBe(false);
    expect(isDue(2, { count: 2, at: now - 1000 }, now)).toBe(false);
    expect(isDue(1, { count: 2, at: now - 1000 }, now)).toBe(false);
    expect(isDue(3, { count: 2, at: now - 1000 }, now)).toBe(true);
    expect(isDue(2, { count: 2, at: now - RETRY_AFTER_MS }, now)).toBe(true);
  });

  it('지난번 실행이 수를 줄였으면(진척) 30분을 안 기다리고 바로 — 그대로였을 때만 기다린다(17 리뷰 2)', () => {
    expect(isDue(1, { count: 1, at: now - 1000, progressed: true }, now)).toBe(true);
    expect(isDue(1, { count: 1, at: now - 1000, progressed: false }, now)).toBe(false);
  });

  it('끝난 뒤 다시 센 수와 진척(단계 앞보다 줄었나)을 적는다 — 트리거가 없는 단계는 그대로', () => {
    const before = { collectQueued: 1, requestedPosts: 5, approved: 0 };
    const after = { collectQueued: 1, requestedPosts: 3, approved: 0 };
    expect(recordRun({}, 'analyze:requested', before, after, now)).toEqual({ 'analyze:requested': { count: 3, at: now, progressed: true } });
    expect(recordRun({ apply: { count: 9, at: 0 } }, 'apply', before, after, now)).toEqual({ apply: { count: 0, at: now, progressed: false } });
    const last = {};
    expect(recordRun(last, 'analyze:limit', before, after, now)).toBe(last);
  });
});

describe('planCycle — 한 바퀴의 단계', () => {
  const now = Date.parse('2026-10-07T05:00:00Z');
  const none = { collect: [], analyze: [], apply: [] };
  const keys = (steps) => steps.map((s) => `${s.step} ${s.args.join(' ')}`.trim());

  it('할 것이 없으면 빈 배열', () => {
    expect(planCycle({ now })).toEqual([]);
  });

  it('추가 수집 요청 → 요청만, 요청 글 → 요청 글만 분석, 승인 → 반영(이 순서)', () => {
    const steps = planCycle({ requests: none, collectQueued: 2, requestedPosts: 5, approved: 1, now });
    expect(keys(steps)).toEqual(['collect --only-requests', 'analyze --requested-only', 'apply']);
    expect(steps.map((s) => s.reason)).toEqual(['추가 수집 요청 2건', '요청 글 5건', '승인 후보 1건']);
  });

  it('정기 수집과 「지금 수집」 요청은 키워드 전체 — 추가 수집 요청도 그 실행이 같이 돈다', () => {
    expect(keys(planCycle({ isDailyTick: true, collectQueued: 3, now }))).toEqual(['collect']);
    const steps = planCycle({ requests: { ...none, collect: [{ id: 'r1' }] }, now });
    expect(steps[0]).toMatchObject({ key: 'collect', args: [], requestIds: ['r1'] });
  });

  it('「지금 분석 N건」 은 요청 글 분석과 따로 --limit N(저수지 포함), 요청 id 를 싣는다', () => {
    const steps = planCycle({ requests: { ...none, analyze: [{ id: 'q1', args: { limit: 30 } }] }, requestedPosts: 2, now });
    expect(keys(steps)).toEqual(['analyze --requested-only', 'analyze --limit 30']);
    expect(steps[1].requestIds).toEqual(['q1']);
  });

  it('「지금 분석」 이 여럿이면 가장 오래된 하나만 집는다 — 나머지는 queued 로 남아 다음 바퀴가(17 리뷰 13)', () => {
    const analyze = [{ id: 'old', args: { limit: 10 } }, { id: 'new', args: { limit: 30 } }];
    const [step] = planCycle({ requests: { ...none, analyze }, now });
    expect(step).toMatchObject({ args: ['--limit', '10'], requestIds: ['old'], requests: [analyze[0]] });
    expect(step.reason).toBe('「지금 분석」 10건(저수지 포함) · 뒤에 1건 대기');
  });

  it('저수지는 자동으로 읽지 않는다 — 요청 글도 요청도 없으면 analyze 가 없다', () => {
    expect(planCycle({ collectQueued: 0, requestedPosts: 0, approved: 0, now })).toEqual([]);
  });

  it('이미 돈 단계(done)는 빠진다 — 단계마다 다시 불러도 같은 일을 두 번 하지 않는다', () => {
    const done = new Set(['collect', 'analyze:requested']);
    expect(keys(planCycle({ isDailyTick: true, requestedPosts: 4, approved: 2, done, now }))).toEqual(['apply']);
  });

  it('지난번 뒤로 수가 안 늘었으면 폴링으로는 다시 안 돈다 — 명시 요청은 예외', () => {
    const last = { collect: { count: 1, at: now - 1000 }, 'analyze:requested': { count: 4, at: now - 1000 }, apply: { count: 2, at: now - 1000 } };
    expect(planCycle({ collectQueued: 1, requestedPosts: 4, approved: 2, last, now })).toEqual([]);
    const steps = planCycle({ requests: { ...none, apply: [{ id: 'p1' }] }, requestedPosts: 5, approved: 2, last, now });
    expect(keys(steps)).toEqual(['analyze --requested-only', 'apply']);
    expect(steps[1].reason).toBe('승인 후보 2건 · 「지금 반영」 요청 1건');
  });

  it('Realtime 이 깨운 단계(forced)는 재시도 간격을 안 본다 — 그 단계만, 0 건이면 여전히 안 돈다', () => {
    const last = { collect: { count: 1, at: now - 1000 }, 'analyze:requested': { count: 4, at: now - 1000 }, apply: { count: 2, at: now - 1000 } };
    const forced = new Set(['apply']);
    expect(keys(planCycle({ collectQueued: 1, requestedPosts: 4, approved: 2, last, forced, now }))).toEqual(['apply']);
    expect(planCycle({ approved: 0, last, forced, now })).toEqual([]);
    expect(keys(planCycle({ collectQueued: 1, requestedPosts: 4, last, forced: new Set(['collect', 'analyze:requested']), now }))).toEqual([
      'collect --only-requests',
      'analyze --requested-only',
    ]);
  });

  it('Claude 한도로 쉬는 동안은 분석 둘 다 빠지고 수집·반영은 돈다', () => {
    const requests = { ...none, analyze: [{ id: 'q1', args: { limit: 10 } }] };
    const paused = planCycle({ requests, collectQueued: 1, requestedPosts: 3, approved: 1, claudePausedUntil: now + 1, now });
    expect(keys(paused)).toEqual(['collect --only-requests', 'apply']);
    expect(keys(planCycle({ requests, requestedPosts: 3, claudePausedUntil: now, now }))).toEqual(['analyze --requested-only', 'analyze --limit 10']);
  });

  it('analyzeCap(서버 홉) — 요청 글은 --limit cap, 「지금 분석 N건」 은 min(N, cap) 만 돌고 남는 수를 remainder 로(ADR-028 결정 5)', () => {
    const analyze = [{ id: 'q1', args: { limit: 30 } }, { id: 'q2', args: { limit: 10 } }];
    const steps = planCycle({ requests: { ...none, analyze }, requestedPosts: 12, analyzeCap: 5, now });
    expect(keys(steps)).toEqual(['analyze --requested-only --limit 5', 'analyze --limit 5']);
    expect(steps[0].reason).toBe('요청 글 12건 · 이번에 최대 5건');
    expect(steps[0].remainder).toBeUndefined();
    expect(steps[1]).toMatchObject({ remainder: 25, requestIds: ['q1'] });
    expect(steps[1].reason).toBe('「지금 분석」 30건(저수지 포함) 중 5건 · 남은 25건은 되돌린다 · 뒤에 1건 대기');
  });

  it('analyzeCap 보다 적게 남은 「지금 분석」 은 remainder 없이 그 수만', () => {
    const [step] = planCycle({ requests: { ...none, analyze: [{ id: 'q1', args: { limit: 3 } }] }, analyzeCap: 5, now });
    expect(step.args).toEqual(['--limit', '3']);
    expect(step).not.toHaveProperty('remainder');
    expect(step.reason).toBe('「지금 분석」 3건(저수지 포함)');
  });

  it('analyzeCap 이 무한(기본)이면 출력이 그대로다 — 로컬 워커는 바뀌지 않는다', () => {
    const input = { requests: { ...none, analyze: [{ id: 'q1', args: { limit: 30 } }] }, collectQueued: 1, requestedPosts: 12, approved: 2, now };
    expect(planCycle({ ...input, analyzeCap: Infinity })).toEqual(planCycle(input));
    expect(planCycle(input).every((step) => !Object.hasOwn(step, 'remainder'))).toBe(true);
  });

  it('formatStep — dry-run 한 줄', () => {
    expect(formatStep(planCycle({ requestedPosts: 3, now })[0])).toBe('analyze --requested-only — 요청 글 3건');
  });
});

describe('claudeResetAt', () => {
  const now = new Date(2026, 9, 7, 14, 0, 0).getTime(); // 이 기기의 현지 14:00

  it('epoch 초(|1759820400 꼴) — 하루 안의 미래만', () => {
    expect(claudeResetAt(`Claude AI usage limit reached|${Math.floor(now / 1000) + 3600}`, now)).toBe((Math.floor(now / 1000) + 3600) * 1000);
    expect(claudeResetAt(`limit reached|${Math.floor(now / 1000) - 60}`, now)).toBeNull();
    expect(claudeResetAt(`limit reached|${Math.floor(now / 1000) + 2 * 86_400}`, now)).toBeNull();
  });

  it('resets 3pm · resets at 15:30 · 지난 시각이면 내일', () => {
    expect(claudeResetAt("You've hit your limit · resets 3pm", now)).toBe(new Date(2026, 9, 7, 15, 0, 0).getTime());
    expect(claudeResetAt('5-hour limit reached ∙ resets at 15:30', now)).toBe(new Date(2026, 9, 7, 15, 30, 0).getTime());
    expect(claudeResetAt('limit reached · resets 9am', now)).toBe(new Date(2026, 9, 8, 9, 0, 0).getTime());
    expect(claudeResetAt('resets 12am', now)).toBe(new Date(2026, 9, 8, 0, 0, 0).getTime());
  });

  it('모르는 모양이면 null', () => {
    expect(claudeResetAt('claude 한도·서버 오류: Too many requests', now)).toBeNull();
    expect(claudeResetAt('resets 27pm', now)).toBeNull();
    expect(claudeResetAt(undefined, now)).toBeNull();
  });
});

describe('clockStamp · parseOnceArgs', () => {
  it('[HH:MM:SS] 현지 시각', () => {
    expect(clockStamp(new Date(2026, 9, 7, 5, 7, 2))).toBe('[05:07:02]');
  });

  it('--dry-run 하나만 받는다 — 오타는 실제 실행으로 새지 않고 거부', () => {
    expect(parseOnceArgs([])).toEqual({ dryRun: false });
    expect(parseOnceArgs(['--dry-run'])).toEqual({ dryRun: true });
    expect(() => parseOnceArgs(['--dryrun'])).toThrow(/알 수 없는 인자: --dryrun/);
  });

  it('상주는 --no-realtime 하나만 받는다', () => {
    expect(parseResidentArgs([])).toEqual({ realtime: true });
    expect(parseResidentArgs(['--no-realtime'])).toEqual({ realtime: false });
    expect(() => parseResidentArgs(['--no-realtim'])).toThrow(/알 수 없는 인자: --no-realtim/);
  });
});
