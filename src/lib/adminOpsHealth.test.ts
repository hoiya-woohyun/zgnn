import { describe, expect, it } from 'vitest';
import type { TOpsOverview, TOpsRebuildEntry, TOpsWorker, TPipelineRun } from './adminOps';
import { adminBandStage, runState, stageHealth, stalledBefore, workerHealth, worstStage } from './adminOpsHealth';

const NOW = Date.parse('2026-10-06T12:00:00.000Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const MIN = 60_000;
const DAY = 24 * 60 * MIN;

const run = (patch: Partial<TPipelineRun> = {}): TPipelineRun => ({
  id: 'r1',
  script: 'collect',
  status: 'ok',
  started_at: ago(2 * DAY),
  ended_at: ago(2 * DAY - 2 * MIN),
  heartbeat_at: ago(2 * DAY),
  args: null,
  stats: null,
  error: null,
  alert: null,
  ...patch,
});

const rebuild = (patch: Partial<TOpsRebuildEntry> = {}): TOpsRebuildEntry => ({
  requested_at: ago(2 * MIN),
  op: 'UPDATE',
  place_name: null,
  place_status: 'published',
  hook: 'sent',
  note: null,
  response_status: 201,
  response_error: null,
  place_count: 1,
  responded_at: ago(2 * MIN),
  ...patch,
});

/** 첫날 — 실행 기록 0행, 재빌드도 없음 */
const overview = (patch: Partial<TOpsOverview> = {}): TOpsOverview => ({
  days: 7,
  runsLatest: {},
  runsLastOk: {},
  funnel: { newPosts: 0, analyzed: 0, candidates: 0, approved: 0, rejected: 0, applied: 0, rebuilds: 0, pendingNow: 0 },
  backlog: { count: 0, oldestFetchedAt: null },
  pending: { count: 0, oldestCreatedAt: null },
  stranded: 0,
  usage30d: { claudeCalls: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, naverCalls: 0, rebuilds2xx: 0 },
  rebuildRecent: [],
  slackConfigured: false,
  ...patch,
});

const stage = (o: TOpsOverview, key: string) => stageHealth(o, NOW).find((s) => s.key === key)!;

describe('runState — 심장이 멎으면 중단된 듯', () => {
  it('running + 심장 11분 전 → stalled, 9분 전 → running', () => {
    expect(runState(run({ status: 'running', heartbeat_at: ago(11 * MIN) }), NOW)).toBe('stalled');
    expect(runState(run({ status: 'running', heartbeat_at: ago(9 * MIN) }), NOW)).toBe('running');
  });

  it('심장이 null 이면 시작 시각을 본다 — null 을 "살아 있다" 로 읽지 않는다', () => {
    expect(runState(run({ status: 'running', heartbeat_at: null, started_at: ago(30 * MIN) }), NOW)).toBe('stalled');
  });

  it('끝난 행은 저장된 상태 그대로', () => {
    expect(runState(run({ status: 'partial' }), NOW)).toBe('partial');
    expect(stalledBefore(NOW)).toBe(ago(10 * MIN));
  });
});

describe('stageHealth', () => {
  it('첫날 — 실행 칸은 회색(기록 없음), 검수는 비었어요(정상), 반영은 회색이 없다, 띠 없음', () => {
    const stages = stageHealth(overview(), NOW);
    expect(stages.map((s) => [s.key, s.state])).toEqual([
      ['collect', 'none'],
      ['analyze', 'none'],
      ['review', 'ok'],
      ['apply', 'ok'],
      ['rebuild', 'none'],
    ]);
    expect(worstStage(stages)).toBeNull();
  });

  it('수집 — 마지막 실행이 실패면 실패, 마지막 성공이 7일 넘으면 주의(`runsLastOk` 를 본다)', () => {
    const okOld = run({ ended_at: ago(9 * DAY), stats: { new: 12 } });
    expect(stage(overview({ runsLatest: { collect: okOld }, runsLastOk: { collect: okOld } }), 'collect')).toMatchObject({
      state: 'warn',
      reason: '수집이 9일째 없어요',
      second: '신규 12',
    });
    const failed = run({ status: 'failed', error: '네이버 검색 429', ended_at: ago(1 * DAY) });
    expect(stage(overview({ runsLatest: { collect: failed }, runsLastOk: { collect: okOld } }), 'collect')).toMatchObject({
      state: 'fail',
      reason: '마지막 수집이 실패했어요(네이버 검색 429)',
    });
  });

  it('분석 — running + 심장 11분 전은 실패(중단된 듯), backlog 가 2일 넘게 쌓이면 주의', () => {
    const dead = run({ script: 'analyze', status: 'running', heartbeat_at: ago(11 * MIN) });
    expect(stage(overview({ runsLatest: { analyze: dead } }), 'analyze').state).toBe('fail');

    const alive = run({ script: 'analyze', status: 'running', heartbeat_at: ago(3 * MIN) });
    expect(stage(overview({ runsLatest: { analyze: alive } }), 'analyze')).toMatchObject({ state: 'ok', first: '돌고 있음(심장 3분 전)' });

    const done = run({ script: 'analyze' });
    expect(
      stage(overview({ runsLatest: { analyze: done }, runsLastOk: { analyze: done }, backlog: { count: 47, oldestFetchedAt: ago(5 * DAY) } }), 'analyze'),
    ).toMatchObject({ state: 'warn', reason: '분석 backlog 47건(5일째)' });
  });

  it('검수 — 가장 오래된 대기가 7일 넘으면 주의, 실패는 없다', () => {
    expect(stage(overview({ pending: { count: 31, oldestCreatedAt: ago(8 * DAY) } }), 'review')).toMatchObject({
      state: 'warn',
      first: '대기 31',
      second: '오래된 8일',
    });
    expect(stage(overview({ pending: { count: 3, oldestCreatedAt: ago(1 * DAY) } }), 'review').state).toBe('ok');
  });

  it('반영 — 크래시(stats 없음)도 실패 건수도 실패, 끊긴 승인은 주의 + 명령 한 줄', () => {
    const crashed = run({ script: 'apply', status: 'failed', stats: null });
    expect(stage(overview({ runsLatest: { apply: crashed } }), 'apply').state).toBe('fail');

    const partial = run({ script: 'apply', status: 'partial', stats: { failed: 2, applied: 16 } });
    expect(stage(overview({ runsLatest: { apply: partial }, runsLastOk: { apply: partial } }), 'apply')).toMatchObject({
      state: 'fail',
      reason: '마지막 반영에서 2건이 실패했어요',
    });

    // 손으로 고친 행의 문자열 "2" 는 수가 아니다
    const handEdited = run({ script: 'apply', status: 'ok', stats: { failed: '2' } });
    expect(stage(overview({ runsLatest: { apply: handEdited }, runsLastOk: { apply: handEdited } }), 'apply').state).toBe('ok');

    expect(stage(overview({ stranded: 2 }), 'apply')).toMatchObject({ state: 'warn', hint: 'pnpm data apply' });
  });

  it('재빌드 — 429 는 주의(BUG-011), 그 밖의 4xx 는 실패, 응답 없이 3분 넘으면 주의, skipped 는 건너뛴다', () => {
    const at = (entries: TOpsRebuildEntry[]) => stage(overview({ rebuildRecent: entries }), 'rebuild');
    expect(at([rebuild()]).state).toBe('ok');
    expect(at([rebuild({ response_status: 429 })]).state).toBe('warn');
    expect(at([rebuild({ response_status: 404 })]).state).toBe('fail');
    expect(at([rebuild({ response_status: 503 })])).toMatchObject({ state: 'fail', reason: 'Vercel 쪽 오류예요(503) — 잠시 뒤 다시 확인해 주세요' });
    expect(at([rebuild({ response_status: null, requested_at: ago(4 * MIN) })]).state).toBe('warn');
    expect(at([rebuild({ response_status: null, requested_at: ago(1 * MIN) })]).state).toBe('ok');
    expect(at([rebuild({ hook: 'missing', response_status: null })]).state).toBe('warn');
    expect(at([rebuild({ hook: 'skipped', response_status: null }), rebuild({ response_status: 410 })]).state).toBe('fail');
  });

  /** 줄을 선 것은 응답 대기가 아니다 — 3분 "응답 없음" 이 아니라 5분 "cron 이 안 돈다" 로만 경고한다(머리글과 같은 말). */
  it('재빌드 — queued 는 대기, 5분 넘게 남으면 cron 경고', () => {
    const at = (entries: TOpsRebuildEntry[]) => stage(overview({ rebuildRecent: entries }), 'rebuild');
    const queued = { hook: 'queued' as const, response_status: null, responded_at: null };
    expect(at([rebuild({ ...queued, requested_at: ago(4 * MIN) })])).toMatchObject({ state: 'ok', reason: null });
    const stalled = at([rebuild({ ...queued, requested_at: ago(6 * MIN) })]);
    expect(stalled.state).toBe('warn');
    expect(stalled.reason).toContain('flush-vercel-rebuild');
  });
});

describe('worstStage — 띠에는 가장 심한 하나', () => {
  it('실패가 주의보다 먼저, 같은 무게면 장치 순서상 앞의 것', () => {
    const stages = stageHealth(
      overview({
        pending: { count: 3, oldestCreatedAt: ago(9 * DAY) },
        stranded: 1,
        rebuildRecent: [rebuild({ response_status: 404 })],
      }),
      NOW,
    );
    expect(worstStage(stages)?.key).toBe('rebuild');
    expect(worstStage(stages.filter((s) => s.key !== 'rebuild'))?.key).toBe('review');
  });
});

describe('adminBandStage — /admin 띠에는 /admin 이 아직 말하지 않은 것만', () => {
  const stages = stageHealth(
    overview({
      pending: { count: 3, oldestCreatedAt: ago(9 * DAY) },
      stranded: 2,
      rebuildRecent: [rebuild({ response_status: 404 })],
    }),
    NOW,
  );

  it('재빌드가 이미 띠에 있으면 그다음으로 심한 것', () => {
    expect(adminBandStage(stages, { rebuildWarn: false, strandedShown: false })?.key).toBe('rebuild');
    expect(adminBandStage(stages, { rebuildWarn: true, strandedShown: false })?.key).toBe('review');
  });

  it('끊긴 반영 줄이 머리글에 있으면 반영 칸의 주의는 빼지만, 반영 실패는 빼지 않는다', () => {
    const onlyApply = stages.filter((s) => s.key === 'apply');
    expect(adminBandStage(onlyApply, { rebuildWarn: true, strandedShown: true })).toBeNull();
    const failed = stageHealth(overview({ runsLatest: { apply: run({ script: 'apply', status: 'failed' }) }, stranded: 2 }), NOW);
    expect(adminBandStage(failed, { rebuildWarn: false, strandedShown: true })?.key).toBe('apply');
  });
});

describe('workerHealth', () => {
  const worker = (patch: Partial<TOpsWorker> = {}): TOpsWorker => ({
    host: 'mac',
    last_seen_at: ago(10_000),
    phase: 'idle',
    run_id: null,
    started_at: ago(DAY),
    version: 'abc1234',
    ...patch,
  });

  it('행이 없으면 없음 — 켜 달라고 말한다', () => {
    const health = workerHealth([], NOW);
    expect(health.state).toBe('none');
    expect(health.hint).toContain('pnpm data');
  });

  it('심장이 5분 안이면 살아 있음, 단계와 run_id 를 넘긴다', () => {
    const health = workerHealth([worker({ phase: 'analyze', run_id: 'r9', last_seen_at: ago(4 * MIN) })], NOW);
    expect(health).toMatchObject({ state: 'alive', tone: 'ok', phase: 'analyze', runId: 'r9', ageSec: 240, hint: null });
  });

  it('심장이 5분 넘게 멎었으면 멎은 듯 — 행이 남아 있어도(kill -9)', () => {
    const health = workerHealth([worker({ phase: 'analyze', last_seen_at: ago(6 * MIN) })], NOW);
    expect(health.state).toBe('stale');
    expect(health.hint).toContain('터미널');
  });

  it('로그인 기다림은 심장이 멎었어도 그 상태다 — 만료된 세션으로는 심장을 못 쓴다', () => {
    const health = workerHealth([worker({ phase: 'login-needed', last_seen_at: ago(20 * MIN) })], NOW);
    expect(health.state).toBe('login-needed');
    expect(health.hint).toContain('20분 전');
    expect(workerHealth([worker({ phase: 'login-needed' })], NOW).hint).not.toContain('꺼졌을');
  });

  it('한도 휴식도 단계가 먼저다', () => {
    expect(workerHealth([worker({ phase: 'rate-limited', last_seen_at: ago(2 * 60 * MIN) })], NOW).state).toBe('rate-limited');
  });

  it('여러 행이면 가장 최근에 뛴 하나, 나머지는 수로', () => {
    const health = workerHealth([worker({ host: 'old', last_seen_at: ago(DAY) }), worker({ host: 'new', last_seen_at: ago(MIN) })], NOW);
    expect(health).toMatchObject({ state: 'alive', host: 'new', others: 1 });
  });

  it('시각을 못 읽으면 멎은 것으로 친다', () => {
    expect(workerHealth([worker({ last_seen_at: 'garbage' })], NOW).state).toBe('stale');
  });
});
