import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchPromptVersions, tallyPromptVersions } from './adminPostVersions';

describe('tallyPromptVersions — 수집 완료 칸의 프롬프트 판 분포(09 T3.3)', () => {
  it('판별로 세고, 마지막에 읽은 때가 늦은 판이 위(맨 앞이 최근) · 합이 줄 수와 같다', () => {
    const out = tallyPromptVersions([
      { promptVersion: 'b0e978d8', analyzed_at: '2026-10-06T02:57:21.612+00:00' },
      { promptVersion: '4eca20be', analyzed_at: '2026-10-07T01:16:49.112+00:00' },
      { promptVersion: 'b0e978d8', analyzed_at: '2026-10-05T00:00:00+00:00' },
      { promptVersion: '4eca20be', analyzed_at: '2026-10-06T23:00:00+00:00' },
      { promptVersion: 'b0e978d8', analyzed_at: '2026-10-04T00:00:00+00:00' },
    ]);
    expect(out.versions).toEqual([
      { version: '4eca20be', count: 2, lastAnalyzedAt: '2026-10-07T01:16:49.112+00:00' },
      { version: 'b0e978d8', count: 3, lastAnalyzedAt: '2026-10-06T02:57:21.612+00:00' },
    ]);
    expect(out.total).toBe(5);
    expect(out.versions.reduce((sum, entry) => sum + entry.count, 0)).toBe(out.total);
  });

  it('판이 없거나 빈 글자는 한 칸(null)에 모은다 · 때를 모르는 판은 맨 끝', () => {
    const out = tallyPromptVersions([
      { promptVersion: null, analyzed_at: '2026-09-01T00:00:00+00:00' },
      { promptVersion: '', analyzed_at: '2026-09-02T00:00:00+00:00' },
      { promptVersion: 'aaaa1111', analyzed_at: null },
      { promptVersion: 'bbbb2222', analyzed_at: '2026-08-01T00:00:00+00:00' },
    ]);
    expect(out.versions.map((entry) => [entry.version, entry.count])).toEqual([
      [null, 2],
      ['bbbb2222', 1],
      ['aaaa1111', 1],
    ]);
    expect(out.versions[0].lastAnalyzedAt).toBe('2026-09-02T00:00:00+00:00');
  });

  it('줄이 없으면 빈 분포', () => {
    expect(tallyPromptVersions([])).toEqual({ total: 0, versions: [] });
  });
});

/** PostgREST 질의 흉내 — 붙인 필터를 적고, range 마다 정해 둔 페이지를 돌려준다. */
function fakeClient(pages: { promptVersion: string | null; analyzed_at: string }[][]) {
  const calls: string[][] = [];
  let page = 0;
  const client = {
    from: () => {
      const applied: string[] = [];
      calls.push(applied);
      const query = {
        select: (columns: string) => (applied.push(`select ${columns}`), query),
        not: (column: string, op: string, value: unknown) => (applied.push(`not ${column} ${op} ${value}`), query),
        is: (column: string, value: unknown) => (applied.push(`is ${column} ${value}`), query),
        order: (column: string) => (applied.push(`order ${column}`), query),
        range: async (from: number, to: number) => {
          applied.push(`range ${from}-${to}`);
          return { data: pages[page++] ?? [], error: null };
        },
      };
      return query;
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

describe('fetchPromptVersions — 분석됨 칩과 같은 집합을 1,000행씩', () => {
  it('제외 칸이 있으면 분석된 글 중 제외하지 않은 글만 · 꽉 찬 페이지 뒤엔 한 번 더 읽는다', async () => {
    const full = Array.from({ length: 1000 }, () => ({ promptVersion: 'b0e978d8', analyzed_at: '2026-10-06T00:00:00+00:00' }));
    const { client, calls } = fakeClient([full, [{ promptVersion: '4eca20be', analyzed_at: '2026-10-07T00:00:00+00:00' }]]);
    const out = await fetchPromptVersions(client, true);
    expect(out.total).toBe(1001);
    expect(out.versions[0]).toMatchObject({ version: '4eca20be', count: 1 });
    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual([
      'select promptVersion:analysis->>promptVersion, analyzed_at',
      'not analyzed_at is null',
      'is excluded_at null',
      'order url',
      'range 0-999',
    ]);
    expect(calls[1].at(-1)).toBe('range 1000-1999');
  });

  it('제외 칸이 없으면(미적용) 제외 조건을 붙이지 않는다', async () => {
    const { client, calls } = fakeClient([[]]);
    await fetchPromptVersions(client, false);
    expect(calls[0]).not.toContain('is excluded_at null');
  });
});
