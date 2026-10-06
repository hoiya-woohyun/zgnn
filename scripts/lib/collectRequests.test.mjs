import { describe, expect, it } from 'vitest';
import { isTableMissing, requestOutcome } from './collectRequests.mjs';

describe('isTableMissing', () => {
  it('PostgREST·Postgres 의 "표 없음" 만', () => {
    expect(isTableMissing({ code: 'PGRST205', message: '' })).toBe(true);
    expect(isTableMissing({ code: '42P01', message: '' })).toBe(true);
    expect(isTableMissing({ message: "Could not find the table 'public.collect_requests' in the schema cache" })).toBe(true);
    expect(isTableMissing({ code: '42501', message: 'permission denied' })).toBe(false);
    expect(isTableMissing(null)).toBe(false);
  });
});

describe('requestOutcome', () => {
  it('담은 글 · 그중 아직 분석 안 된 글 · url 목록(겹침 없이)', () => {
    const rows = [{ url: 'a' }, { url: 'b' }, { url: 'a' }, { url: 'c' }];
    expect(requestOutcome(rows, new Set(['b']))).toEqual({ found: 3, to_read: 2, post_urls: ['a', 'b', 'c'] });
  });
  it('전부 분석이 끝난 글이면 읽을 글 0', () => {
    expect(requestOutcome([{ url: 'a' }], new Set(['a']))).toEqual({ found: 1, to_read: 0, post_urls: ['a'] });
  });
});
