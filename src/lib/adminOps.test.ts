import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import {
  fetchOpsOverview,
  fetchRun,
  fetchRuns,
  flattenStats,
  mergeRuns,
  RUN_COLUMNS,
  runAlertLabel,
  runDurationLabel,
  runSummaryLine,
  type TPipelineRun,
} from './adminOps';
import { formatAnalyzeSummary, formatUsageSummary } from './runSummary';

/** 쿼리 빌더가 받은 호출을 순서대로 적는다. 마지막(`limit`·`maybeSingle`)이 결과를 돌려준다. */
function fakeClient(result: { data: unknown; error: { message: string } | null } = { data: [], error: null }) {
  const calls: [string, ...unknown[]][] = [];
  const builder: Record<string, (...args: unknown[]) => unknown> = {};
  for (const name of ['select', 'in', 'or', 'lt', 'eq', 'order']) {
    builder[name] = (...args: unknown[]) => {
      calls.push([name, ...args]);
      return builder;
    };
  }
  builder.limit = (...args: unknown[]) => {
    calls.push(['limit', ...args]);
    return Promise.resolve(result);
  };
  builder.maybeSingle = () => {
    calls.push(['maybeSingle']);
    return Promise.resolve(result);
  };
  const client = {
    from: (table: string) => {
      calls.push(['from', table]);
      return builder;
    },
    rpc: (name: string, args: unknown) => {
      calls.push(['rpc', name, args]);
      return Promise.resolve(result);
    },
  } as unknown as SupabaseClient;
  return { calls, client };
}

describe('fetchRuns', () => {
  it('걸러 보기 없이 — 최신순 한 장, operator 칸은 읽지 않는다', async () => {
    const { calls, client } = fakeClient();
    await fetchRuns(client);
    expect(calls).toEqual([
      ['from', 'pipeline_runs'],
      ['select', RUN_COLUMNS],
      ['order', 'started_at', { ascending: false }],
      ['limit', 30],
    ]);
    expect(RUN_COLUMNS).not.toContain('operator');
  });

  it('스크립트 · 실패만(중단된 듯 포함) · 다음 장', async () => {
    const { calls, client } = fakeClient();
    await fetchRuns(client, {
      scripts: ['approve', 'reject'],
      failedOnly: { stalledBefore: '2026-10-06T00:00:00.000Z' },
      before: '2026-10-05T00:00:00.000Z',
      limit: 10,
    });
    expect(calls).toContainEqual(['in', 'script', ['approve', 'reject']]);
    expect(calls).toContainEqual([
      'or',
      'status.in.(failed,partial),and(status.eq.running,or(heartbeat_at.lt.2026-10-06T00:00:00.000Z,and(heartbeat_at.is.null,started_at.lt.2026-10-06T00:00:00.000Z)))',
    ]);
    expect(calls).toContainEqual(['lt', 'started_at', '2026-10-05T00:00:00.000Z']);
    expect(calls.at(-1)).toEqual(['limit', 10]);
  });

  it('오류는 던진다', async () => {
    const { client } = fakeClient({ data: null, error: { message: 'boom' } });
    await expect(fetchRuns(client)).rejects.toThrow('실행 기록: boom');
  });
});

describe('fetchRun', () => {
  it('uuid 모양이 아니면 부르지도 않고 null — 22P02 문장이 화면에 뜨지 않게', async () => {
    const { calls, client } = fakeClient();
    expect(await fetchRun(client, 'abc')).toBeNull();
    expect(await fetchRun(client, "1' or 1=1")).toBeNull();
    expect(calls).toEqual([]);
  });

  it('uuid 면 그 행 하나', async () => {
    const id = '0b6f2a7e-1c1d-4d8e-9a4b-1f2e3d4c5b6a';
    const { calls, client } = fakeClient({ data: { id }, error: null });
    expect(await fetchRun(client, id)).toEqual({ id });
    expect(calls).toContainEqual(['eq', 'id', id]);
  });
});

describe('fetchOpsOverview', () => {
  it('days 를 그대로 넘긴다', async () => {
    const { calls, client } = fakeClient({ data: { days: 30 }, error: null });
    await fetchOpsOverview(client, 30);
    expect(calls).toEqual([['rpc', 'ops_overview', { days: 30 }]]);
  });

  it('빈 응답은 "기록 없음" 이 아니라 오류다', async () => {
    const { client } = fakeClient({ data: null, error: null });
    await expect(fetchOpsOverview(client, 7)).rejects.toThrow('비어 왔어요');
  });

  it('42501 은 그 문장으로 던진다', async () => {
    const { client } = fakeClient({ data: null, error: { message: '운영 현황은 운영자만 볼 수 있어요.' } });
    await expect(fetchOpsOverview(client, 7)).rejects.toThrow('운영자만');
  });
});

describe('runSummaryLine — 터미널과 같은 문장', () => {
  it('collect', () => {
    expect(
      runSummaryLine({
        script: 'collect',
        stats: { fetched: 120, new: 12, existing: 108, excludedOld: 0, excludedOther: 0, durationMs: 123_000 },
      }),
    ).toBe('수집 120건 (신규 12 · 기존 108 · 1년 밖 제외 0 · 비네이버/비제주 제외 0) · 2분 3초');
  });

  it('analyze — 계량기 줄은 스크립트처럼 meters.extract 로', () => {
    const stats = {
      analyzed: 47,
      skipped: 0,
      candidates: 23,
      auto: 9,
      ask: 4,
      new: 10,
      meters: { extract: { calls: 47, input: 1000, output: 200, cacheRead: 30, cacheWrite: 4 } },
    };
    expect(runSummaryLine({ script: 'analyze', stats })).toBe(formatAnalyzeSummary(stats, formatUsageSummary('추출', stats.meters.extract)));
  });

  it('approve · reject', () => {
    expect(runSummaryLine({ script: 'approve', stats: { requested: 3, done: 3, failed: 0 } })).toBe('approved 3건 — 반영은 pnpm data apply');
    expect(runSummaryLine({ script: 'reject', stats: { requested: 2, done: 2, failed: 0 } })).toBe('rejected 2건');
  });

  it('null·문자열 수는 그럴듯한 틀린 문장이 되므로 null — apply 의 draftWaiting null 만 허락', () => {
    expect(runSummaryLine({ script: 'collect', stats: { fetched: null, new: 1, existing: 0, excludedOld: 0, excludedOther: 0, durationMs: 1 } })).toBeNull();
    expect(
      runSummaryLine({ script: 'analyze', stats: { analyzed: 1, skipped: 0, candidates: 0, auto: 0, ask: 0, new: 0, excluded: { other: '3', notJeju: 0, notAllowed: 0 } } }),
    ).toBeNull();
    expect(
      runSummaryLine({
        script: 'apply',
        stats: { applied: 1, patched: 1, patchedPublished: 0, inserted: 0, failed: 0, revertedToPending: 0, draftWaiting: null },
      }),
    ).toContain('published 대기 draft ?곳');
  });

  it('stats 가 없거나 칸이 빠져 NaN·undefined 가 섞이면 null — 틀린 문장보다 빈 칸', () => {
    expect(runSummaryLine({ script: 'collect', stats: null })).toBeNull();
    expect(runSummaryLine({ script: 'collect', stats: { fetched: 3 } })).toBeNull();
    expect(runSummaryLine({ script: 'analyze', stats: { analyzed: 1, excluded: { notJeju: 1 } } })).toBeNull();
    expect(runSummaryLine({ script: 'apply', stats: [] as unknown as Record<string, unknown> })).toBeNull();
  });
});

describe('mergeRuns — 새로고침이 더 불러온 장을 날리지 않는다', () => {
  const row = (id: string, startedAt: string, status: TPipelineRun['status'] = 'ok') =>
    ({ id, started_at: startedAt, status }) as TPipelineRun;

  it('첫 장이 덮는 구간에서 첫 장에 없는 옛 행은 버린다 — 실패만에서 다시 살아난 행이 남지 않게', () => {
    const current = [row('x', '2026-10-06', 'running'), row('b', '2026-10-05'), row('a', '2026-10-01')];
    // 첫 장이 꽉 찼다(pageSize 2) — b 까지가 덮인 구간, 그 안의 x 는 더 이상 맞지 않는다. a 는 구간 밖이라 남는다
    expect(mergeRuns(current, [row('c', '2026-10-07'), row('b', '2026-10-05')], 2).map((r) => r.id)).toEqual(['c', 'b', 'a']);
    // 첫 장이 덜 찼으면 그게 결과 전부다
    expect(mergeRuns(current, [row('b', '2026-10-05')], 2).map((r) => r.id)).toEqual(['b']);
  });

  it('같은 id 는 새 행이 이기고, 옛 장은 남고, 최신순', () => {
    const current = [row('b', '2026-10-05', 'running'), row('a', '2026-10-01')];
    const fresh = [row('c', '2026-10-06'), row('b', '2026-10-05', 'ok')];
    expect(mergeRuns(current, fresh, 2).map((r) => [r.id, r.status])).toEqual([
      ['c', 'ok'],
      ['b', 'ok'],
      ['a', 'ok'],
    ]);
  });
});

describe('runDurationLabel', () => {
  const at = (iso: string) => Date.parse(iso);
  it('끝난 실행은 걸린 시간, 안 끝났으면 N분째', () => {
    expect(runDurationLabel({ started_at: '2026-10-06T00:00:00Z', ended_at: '2026-10-06T00:00:42Z' }, 0)).toBe('42초');
    expect(runDurationLabel({ started_at: '2026-10-06T00:00:00Z', ended_at: '2026-10-06T00:41:20Z' }, 0)).toBe('41분');
    expect(runDurationLabel({ started_at: '2026-10-06T00:00:00Z', ended_at: '2026-10-06T01:05:00Z' }, 0)).toBe('1시간 5분');
    expect(runDurationLabel({ started_at: '2026-10-06T00:00:00Z', ended_at: null }, at('2026-10-06T00:03:00Z'))).toBe('3분째');
    expect(runDurationLabel({ started_at: '2026-10-03T00:00:00Z', ended_at: null }, at('2026-10-06T02:00:00Z'))).toBe('3일 2시간째');
  });
});

describe('flattenStats', () => {
  it('중첩은 점으로, 손으로 고친 문자열도 숨기지 않는다', () => {
    expect(flattenStats({ analyzed: 1200, verify: { checked: 3, failed: '2' }, meters: {} , note: null })).toEqual([
      ['analyzed', '1,200'],
      ['verify.checked', '3'],
      ['verify.failed', '"2"'],
      ['meters', '{}'],
      ['note', '—'],
    ]);
    expect(flattenStats(null)).toEqual([]);
  });
});

describe('runAlertLabel', () => {
  it('없음·꺼 둠은 —, 보냈으면 Slack, 오류·비2xx 는 Slack 실패', () => {
    expect(runAlertLabel(null)).toBe('—');
    expect(runAlertLabel({ state: 'missing' })).toBe('—');
    expect(runAlertLabel({ state: 'sent', requestId: 1 })).toBe('Slack');
    expect(runAlertLabel({ state: 'sent', requestId: 1, responseStatus: 200 })).toBe('Slack');
    expect(runAlertLabel({ state: 'sent', requestId: 1, responseStatus: 404 })).toBe('Slack 실패');
    expect(runAlertLabel({ state: 'error', note: 'x' })).toBe('Slack 실패');
  });
});
