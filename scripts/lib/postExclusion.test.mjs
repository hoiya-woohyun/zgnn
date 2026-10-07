import { describe, expect, it } from 'vitest';
import { notExcluded, probeExcludedAt } from './postExclusion.mjs';

/** `from('blog_posts').select(col).limit(1)` 모양만. */
const probeClient = (error) => ({ from: () => ({ select: () => ({ limit: async () => ({ error }) }) }) });

describe('probeExcludedAt — 칸이 있나', () => {
  it('있으면 true, 경고 없음', async () => {
    const lines = [];
    expect(await probeExcludedAt(probeClient(null), (line) => lines.push(line))).toBe(true);
    expect(lines).toEqual([]);
  });

  it('칸 없음(42703)이면 false 와 경고 한 줄 — 분석은 멈추지 않는다', async () => {
    const lines = [];
    expect(await probeExcludedAt(probeClient({ code: '42703', message: 'column blog_posts.excluded_at does not exist' }), (line) => lines.push(line))).toBe(false);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('20261007160000_blog_posts_exclude.sql');
  });

  it('다른 실패(권한·네트워크)는 던진다 — "미적용" 으로 삼키면 제외한 글을 다시 읽는다', async () => {
    await expect(probeExcludedAt(probeClient({ code: '42501', message: 'permission denied' }), () => {})).rejects.toThrow('permission denied');
  });
});

describe('notExcluded', () => {
  const query = () => {
    const calls = [];
    const q = { calls, is: (col, value) => (calls.push([col, value]), q) };
    return q;
  };

  it('적용됐으면 excluded_at is null 을 붙인다', () => {
    expect(notExcluded(query(), true).calls).toEqual([['excluded_at', null]]);
  });

  it('미적용이면 조건 없이 그대로', () => {
    expect(notExcluded(query(), false).calls).toEqual([]);
  });
});
