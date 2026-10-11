import { describe, expect, it } from 'vitest';
import { selectAllPages } from './selectAllPages.mjs';

/** 서버 상한(`cap`)으로 자르는 가짜 PostgREST — `range` 를 줘도 상한을 넘겨 주지 않는다. */
function fakeTable(total, cap) {
  const all = Array.from({ length: total }, (_, i) => ({ id: i }));
  const calls = [];
  const pageAt = async (from, to) => {
    calls.push([from, to]);
    return { data: all.slice(from, Math.min(to + 1, from + cap)), error: null };
  };
  return { pageAt, calls };
}

describe('selectAllPages', () => {
  it('상한을 넘는 행을 빠짐없이 읽는다 — 1,075건', async () => {
    const t = fakeTable(1075, 1000);
    const { data, error } = await selectAllPages(t.pageAt);
    expect(error).toBeNull();
    expect(data).toHaveLength(1075);
    expect(t.calls).toEqual([[0, 999], [1000, 1999], [1075, 2074]]);
  });

  it('서버 상한이 페이지보다 작아도 건너뛰거나 일찍 멈추지 않는다', async () => {
    const t = fakeTable(1200, 500);
    const { data } = await selectAllPages(t.pageAt, { pageSize: 1000 });
    expect(data.map((r) => r.id)).toEqual(Array.from({ length: 1200 }, (_, i) => i));
  });

  it('빈 표는 빈 배열', async () => {
    const t = fakeTable(0, 1000);
    expect(await selectAllPages(t.pageAt)).toEqual({ data: [], error: null });
  });

  it('에러는 supabase-js 모양 그대로 돌려준다', async () => {
    const err = { message: 'boom' };
    expect(await selectAllPages(async () => ({ data: null, error: err }))).toEqual({ data: null, error: err });
  });
});
