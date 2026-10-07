import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  BACKLOG_NO_DATE,
  BACKLOG_NO_KEYWORD,
  countPosts,
  fetchPosts,
  planReread,
  postDateLabel,
  postPageCount,
  postStatus,
  reopenPlan,
  reopenSummary,
  rereadSummary,
  tallyBacklog,
  tallyExistingReasons,
} from './adminPosts';

describe('tallyExistingReasons — 이미 있는 가게를 쓴 글(11 T2.4)', () => {
  it('같은 말 · 옛 글 · 근거 약함을 세고, 옛 alreadyHave 는 같은 말에 합친다 · 다른 이유·이상한 값은 세지 않는다', () => {
    const lists = [
      [{ name: 'a', reason: 'sameAsSite' }, { name: 'b', reason: 'notJeju' }],
      [{ name: 'c', reason: 'alreadyHave' }, { name: 'd', reason: 'stale' }, { name: 'e', reason: 'weak' }],
      null,
      'x',
      [null],
    ];
    expect(tallyExistingReasons(lists)).toEqual({ total: 4, same: 2, stale: 1, weak: 1, noPetEvidence: 0, alreadyHavePosts: [] });
  });
});

describe('옛 규칙으로 버려진 글 다시 열기(11 런북 3단계를 화면으로)', () => {
  it('alreadyHave 가 있는 글의 url 만 모은다', () => {
    const out = tallyExistingReasons([[{ reason: 'alreadyHave' }], [{ reason: 'sameAsSite' }], [{ reason: 'alreadyHave' }]], ['a', 'b', 'c']);
    expect(out.alreadyHavePosts).toEqual(['a', 'c']);
  });

  it('사람이 반려한 형제가 딸린 글은 빼고 · pending 은 눕히되 사람이 고친 것은 남긴다 · 재분석 머리표 반려는 사람의 반려가 아니다', () => {
    const sib = (id: string, post_url: string, status: string, reviewer_note: string | null = null) => ({ id, post_url, status, reviewer_note }) as never;
    const plan = reopenPlan(
      ['a', 'b', 'c'],
      [
        sib('1', 'a', 'pending'),
        sib('2', 'a', 'pending', '[admin] 고침'),
        sib('3', 'b', 'rejected', '[admin] 목록글'),
        sib('4', 'b', 'pending'),
        sib('5', 'c', 'rejected', '[admin] 재분석'),
        sib('6', 'c', 'approved'),
      ],
    );
    expect(plan.posts).toEqual(['a', 'c']);
    expect(plan.lay.map((row) => row.id)).toEqual(['1']);
    expect(plan.keep.map((row) => row.id)).toEqual(['2']);
    expect(plan.skipped).toBe(1);
    expect(reopenSummary(plan)).toContain('글 2건');
    expect(reopenSummary(plan)).toContain('1건은 빼요');
  });
});

describe('tallyExistingReasons — 신규·동반 근거 없음(ADR-019 v6)', () => {
  it('따로 세고 total 에는 안 넣는다', () => {
    expect(tallyExistingReasons([[{ reason: 'noPetEvidence' }, { reason: 'noPetEvidence' }, { reason: 'stale' }]])).toMatchObject({ total: 1, stale: 1, noPetEvidence: 2 });
  });
});

describe('tallyBacklog — 미분석 글의 검색어별·달별 건수(todo/13 T4.4)', () => {
  it('많은 검색어가 위 · 최근 달이 위 · 합은 행 수와 같다', () => {
    const tally = tallyBacklog([
      { keyword: '애월 애견동반', posted_at: '2026-09-03' },
      { keyword: '애월 애견동반', posted_at: '2026-08-30' },
      { keyword: '성산 애견카페', posted_at: '2026-09-21' },
    ]);
    expect(tally.total).toBe(3);
    expect(tally.byKeyword).toEqual([
      { key: '애월 애견동반', count: 2 },
      { key: '성산 애견카페', count: 1 },
    ]);
    expect(tally.byMonth).toEqual([
      { key: '2026-09', count: 2 },
      { key: '2026-08', count: 1 },
    ]);
  });

  it('검색어·날짜가 없는 글도 버리지 않고 한 칸에 모은다(날짜 없음은 맨 끝)', () => {
    const tally = tallyBacklog([
      { keyword: null, posted_at: null },
      { keyword: '  ', posted_at: '2026-01-02' },
    ]);
    expect(tally.byKeyword).toEqual([{ key: BACKLOG_NO_KEYWORD, count: 2 }]);
    expect(tally.byMonth).toEqual([
      { key: '2026-01', count: 1 },
      { key: BACKLOG_NO_DATE, count: 1 },
    ]);
  });
});

/**
 * 질의를 기록만 하는 가짜 클라이언트 — 모든 필터 메서드가 자기를 돌려주고, await 하면 빈 결과다.
 * `queries` 에 질의마다 [메서드, 인자] 목록이 쌓인다.
 */
function recordingClient(result: { data?: unknown[]; error?: { message: string } | null } = {}) {
  const queries: { table: string; calls: [string, unknown[]][] }[] = [];
  const client = {
    from(table: string) {
      const entry = { table, calls: [] as [string, unknown[]][] };
      queries.push(entry);
      const builder: Record<string, unknown> = {};
      for (const method of ['select', 'is', 'not', 'in', 'order', 'range', 'limit', 'filter', 'update', 'eq']) {
        builder[method] = (...args: unknown[]) => {
          entry.calls.push([method, args]);
          return builder;
        };
      }
      builder.then = (resolve: (value: unknown) => void) => resolve({ data: result.data ?? [], count: 0, error: result.error ?? null });
      return builder;
    },
  };
  return { client: client as unknown as SupabaseClient, queries };
}

const filtersOf = (calls: [string, unknown[]][]) => calls.filter(([method]) => method === 'is' || method === 'not');

describe('글 목록(수집 완료 칸, 09 T3.2)', () => {
  it('postStatus — 제외를 먼저, 분석된 글은 프롬프트 버전 앞 8자', () => {
    expect(postStatus({ analyzed_at: null, excluded_at: null, promptVersion: null })).toBe('미분석');
    expect(postStatus({ analyzed_at: '2026-10-01', excluded_at: null, promptVersion: 'v7-abcdef0123' })).toBe('v7-abcde');
    expect(postStatus({ analyzed_at: '2026-10-01', excluded_at: null, promptVersion: null })).toBe('분석됨');
    expect(postStatus({ analyzed_at: '2026-10-01', excluded_at: '2026-10-07', promptVersion: 'v7' })).toBe('제외');
    expect(postStatus({ analyzed_at: null, promptVersion: null })).toBe('미분석'); // 칸 미적용 — excluded_at 이 아예 없다
  });

  it('postPageCount — 50건 단위, 0건이어도 한 페이지', () => {
    expect(postPageCount(0)).toBe(1);
    expect(postPageCount(50)).toBe(1);
    expect(postPageCount(51)).toBe(2);
    expect(postPageCount(3360)).toBe(68);
  });

  it('postDateLabel — 짧은 한국식', () => {
    expect(postDateLabel('2025-10-07')).toBe('25.10.07');
    expect(postDateLabel(null)).toBe('날짜 없음');
    expect(postDateLabel('어제')).toBe('어제');
  });

  it('미분석 필터의 조건이 머리글 건수(countPosts)의 미분석과 같다 — 제외 칸이 있을 때', async () => {
    const counted = recordingClient();
    await countPosts(counted.client);
    // 머리글 세 질의: 전체 · 제외 · 미분석. 미분석은 셋째다.
    const countFilters = filtersOf(counted.queries[2].calls);

    const listed = recordingClient();
    await fetchPosts(listed.client, { filter: 'unanalyzed', page: 0, excludedApplied: true });
    expect(filtersOf(listed.queries[0].calls)).toEqual(countFilters);
    expect(countFilters).toEqual([
      ['is', ['analyzed_at', null]],
      ['is', ['excluded_at', null]],
    ]);
  });

  it('분석됨 필터는 제외한 글을 빼고, 미적용이면 제외 칸을 select 에도 조건에도 넣지 않는다', async () => {
    const applied = recordingClient();
    await fetchPosts(applied.client, { filter: 'analyzed', page: 2, excludedApplied: true });
    expect(filtersOf(applied.queries[0].calls)).toEqual([
      ['not', ['analyzed_at', 'is', null]],
      ['is', ['excluded_at', null]],
    ]);
    expect(applied.queries[0].calls.find(([method]) => method === 'range')?.[1]).toEqual([100, 149]);

    const bare = recordingClient();
    await fetchPosts(bare.client, { filter: 'unanalyzed', page: 0, excludedApplied: false });
    const select = String(bare.queries[0].calls[0][1][0]);
    expect(select).not.toContain('excluded_at');
    expect(filtersOf(bare.queries[0].calls)).toEqual([['is', ['analyzed_at', null]]]);
    await expect(fetchPosts(bare.client, { filter: 'excluded', page: 0, excludedApplied: false })).rejects.toThrow('마이그레이션');
  });

  it('같은 날 글이 많아도 페이지가 겹치지 않게 url 을 둘째 정렬 키로', async () => {
    const { client, queries } = recordingClient();
    await fetchPosts(client, { filter: 'excluded', page: 0, excludedApplied: true });
    expect(queries[0].calls.filter(([method]) => method === 'order').map(([, args]) => args[0])).toEqual(['posted_at', 'url']);
  });

  it('planReread — 분석된·제외 안 된 글만, 형제 후보까지 눕힌다(reopenPlan 그대로)', async () => {
    const siblings = [
      { id: '1', post_url: 'a', status: 'pending', reviewer_note: null },
      { id: '2', post_url: 'a', status: 'pending', reviewer_note: '[admin] 고침' },
      { id: '3', post_url: 'b', status: 'rejected', reviewer_note: '[admin] 광고' },
    ];
    const { client, queries } = recordingClient({ data: siblings });
    const plan = await planReread(client, [
      { url: 'a', analyzed_at: '2026-10-01', excluded_at: null },
      { url: 'b', analyzed_at: '2026-10-01', excluded_at: null },
      { url: 'c', analyzed_at: null, excluded_at: null },
      { url: 'd', analyzed_at: '2026-10-01', excluded_at: '2026-10-07' },
    ]);
    expect(queries[0].calls.find(([method]) => method === 'in')?.[1]).toEqual(['post_url', ['a', 'b']]);
    expect(plan.posts).toEqual(['a']);
    expect(plan.lay.map((row) => row.id)).toEqual(['1']);
    expect(plan.keep.map((row) => row.id)).toEqual(['2']);
    expect(plan.skipped).toBe(1);
    expect(rereadSummary(plan)).toContain('글 1건을 수집 완료로 되돌려요');
    expect(rereadSummary(plan)).toContain('사람이 제외한 후보가 딸린 글 1건은 빼요');
  });
});
