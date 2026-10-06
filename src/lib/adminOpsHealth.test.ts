import { describe, expect, it } from 'vitest';
import type { TOpsOverview, TOpsRebuildEntry, TPipelineRun } from './adminOps';
import { runState, stageHealth, stalledBefore, worstStage } from './adminOpsHealth';

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

    expect(stage(overview({ stranded: 2 }), 'apply')).toMatchObject({ state: 'warn', hint: 'pnpm data:apply' });
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
