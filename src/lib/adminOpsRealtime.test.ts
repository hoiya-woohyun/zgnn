import { describe, expect, it } from 'vitest';
import type { TOpsOverview, TOpsWorker, TPipelineRun } from './adminOps';
import { applyRunToOverview, runFromRow, runMatchesFilter, upsertRun, upsertWorker, workerFromRow } from './adminOpsRealtime';

const NOW = Date.parse('2026-10-07T12:00:00.000Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const MIN = 60_000;

const run = (patch: Partial<TPipelineRun> = {}): TPipelineRun => ({
  id: 'r1',
  script: 'analyze',
  status: 'running',
  started_at: ago(10 * MIN),
  ended_at: null,
  heartbeat_at: ago(MIN),
  args: null,
  stats: null,
  error: null,
  alert: null,
  progress: null,
  ...patch,
});

const worker = (patch: Partial<TOpsWorker> = {}): TOpsWorker => ({
  host: 'mac',
  last_seen_at: ago(10_000),
  phase: 'idle',
  run_id: null,
  started_at: ago(60 * MIN),
  version: null,
  ...patch,
});

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

describe('runFromRow · workerFromRow', () => {
  it('실행 행은 RUN_COLUMNS 칸만 옮긴다 — operator 는 버린다', () => {
    const row = runFromRow({ ...run({ progress: { done: 3, total: 10, current: '애월 카페' } }), operator: 'u1' });
    expect(row).not.toHaveProperty('operator');
    expect(row?.progress).toEqual({ done: 3, total: 10, current: '애월 카페' });
  });

  it('DELETE 의 빈 new·모양이 어긋난 행은 null', () => {
    expect(runFromRow({})).toBeNull();
    expect(runFromRow(null)).toBeNull();
    expect(workerFromRow({ host: 'mac' })).toBeNull();
  });

  it('워커 행 — 빠진 칸은 null', () => {
    expect(workerFromRow({ host: 'mac', last_seen_at: ago(0), phase: 'analyze' })).toEqual({
      host: 'mac',
      last_seen_at: ago(0),
      phase: 'analyze',
      run_id: null,
      started_at: null,
      version: null,
    });
  });
});

describe('upsertWorker', () => {
  it('host 로 바꿔 끼운다', () => {
    const next = upsertWorker([worker(), worker({ host: 'other' })], worker({ phase: 'collect' }));
    expect(next).toHaveLength(2);
    expect(next.find((row) => row.host === 'mac')?.phase).toBe('collect');
  });

  it('처음 보는 host 는 더한다', () => {
    expect(upsertWorker([], worker())).toHaveLength(1);
  });
});

describe('runMatchesFilter', () => {
  it('스크립트 칩 밖의 행은 맞지 않는다', () => {
    expect(runMatchesFilter(run(), { scripts: ['collect'], failedOnly: false }, NOW)).toBe(false);
    expect(runMatchesFilter(run(), { scripts: null, failedOnly: false }, NOW)).toBe(true);
  });

  it('실패만 — 뛰고 있는 행은 아니고, 실패·멎은 행은 맞다', () => {
    const filter = { scripts: null, failedOnly: true };
    expect(runMatchesFilter(run(), filter, NOW)).toBe(false);
    expect(runMatchesFilter(run({ status: 'failed' }), filter, NOW)).toBe(true);
    expect(runMatchesFilter(run({ heartbeat_at: ago(30 * MIN) }), filter, NOW)).toBe(true);
  });
});

describe('upsertRun', () => {
  it('같은 id 는 바꾼다', () => {
    const next = upsertRun([run()], run({ progress: { done: 5, total: 10 } }), true);
    expect(next).toHaveLength(1);
    expect(next[0].progress).toEqual({ done: 5, total: 10 });
  });

  it('새 행은 최신순 자리에 들어간다', () => {
    const older = run({ id: 'old', started_at: ago(60 * MIN) });
    const next = upsertRun([older], run({ id: 'new' }), true);
    expect(next.map((row) => row.id)).toEqual(['new', 'old']);
  });

  it('걸러 보기에 안 맞으면 넣지 않고, 이미 있던 행은 뺀다', () => {
    expect(upsertRun([], run(), false)).toEqual([]);
    expect(upsertRun([run(), run({ id: 'r2' })], run(), false).map((row) => row.id)).toEqual(['r2']);
  });
});

describe('applyRunToOverview', () => {
  it('runsLatest 를 같은 id·더 새 행으로 바꾼다 — 다섯 칸이 진행 막대와 같은 말을 하게', () => {
    const before = overview({ runsLatest: { analyze: run({ id: 'old', started_at: ago(60 * MIN), status: 'ok' }) } });
    const next = applyRunToOverview(before, run());
    expect(next.runsLatest.analyze?.id).toBe('r1');
    expect(next.runsLastOk.analyze).toBeUndefined();
  });

  it('더 오래된 행은 runsLatest 를 덮지 않는다', () => {
    const before = overview({ runsLatest: { analyze: run() } });
    expect(applyRunToOverview(before, run({ id: 'old', started_at: ago(60 * MIN) })).runsLatest.analyze?.id).toBe('r1');
  });

  it('ok·partial 로 끝나면 마지막 성공도 바꾼다', () => {
    const next = applyRunToOverview(overview(), run({ status: 'partial', ended_at: ago(0) }));
    expect(next.runsLastOk.analyze?.status).toBe('partial');
    expect(applyRunToOverview(overview(), run({ status: 'failed' })).runsLastOk.analyze).toBeUndefined();
  });
});
