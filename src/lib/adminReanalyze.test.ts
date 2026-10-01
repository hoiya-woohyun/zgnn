/**
 * 재분석 준비. 지키는 것은 docs/architecture/data-pipeline.md 「재분석」의 네 규칙이다 —
 * 글 단위 · 눕히기(지우지 않음) · 고친 후보는 남김 · 후보 먼저, 글 나중.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { prepareReanalyze, reanalyzePlan, reanalyzeSummary, REANALYZE_NOTE } from './adminReanalyze';
import { EDITED_NOTE } from './adminApply';
import type { TCandidateRow } from './adminCandidates';

const row = (id: string, post: string | null, over: Partial<TCandidateRow> = {}) =>
  ({ id, post_url: post, status: 'pending', reviewer_note: null, extracted: { name: id }, ...over }) as unknown as TCandidateRow;

describe('reanalyzePlan', () => {
  const a1 = row('a1', 'post-a');
  const a2 = row('a2', 'post-a'); // 같은 글의 형제 — 다른 줄
  const a3 = row('a3', 'post-a', { reviewer_note: `x\n${EDITED_NOTE}` });
  const b1 = row('b1', 'post-b');
  const nolink = row('n1', null);

  it('글 단위 — 고른 줄 밖의 형제까지 눕히고, 고친 후보는 남긴다', () => {
    const plan = reanalyzePlan([a1, nolink], [a1, a2, a3, b1, nolink]);
    expect(plan.posts).toEqual(['post-a']);
    expect(plan.lay.map((r) => r.id)).toEqual(['a1', 'a2']);
    expect(plan.keep.map((r) => r.id)).toEqual(['a3']);
    expect(reanalyzeSummary(plan)).toContain('검수 대기 후보 2건');
    expect(reanalyzeSummary(plan)).toContain('고친 후보 1건');
    expect(reanalyzeSummary(plan)).toContain('수집 완료로 되돌려요');
    expect(reanalyzeSummary(plan)).not.toMatch(/지워요|없애요|초기화|눕/);
  });
});

describe('prepareReanalyze — 후보 먼저, 글 나중', () => {
  it('순서와 값', async () => {
    const calls: { table: string; payload: Record<string, unknown>; filter: Record<string, unknown> }[] = [];
    const client = {
      from: (table: string) => ({
        update: (payload: Record<string, unknown>) => ({
          eq: (col: string, value: unknown) => {
            calls.push({ table, payload, filter: { [col]: value } });
            return Promise.resolve({ error: null });
          },
        }),
      }),
    } as unknown as SupabaseClient;

    await prepareReanalyze(client, { posts: ['post-a'], lay: [row('a1', 'post-a', { reviewer_note: '[data:review] 확인' })], keep: [] });

    expect(calls.map((c) => c.table)).toEqual(['candidates', 'blog_posts']);
    expect(calls[0].payload).toEqual({ status: 'rejected', reviewer_note: `[data:review] 확인\n${REANALYZE_NOTE}` });
    expect(calls[1]).toEqual({ table: 'blog_posts', payload: { analyzed_at: null }, filter: { url: 'post-a' } });
  });
});
