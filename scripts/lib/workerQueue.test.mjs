import { describe, expect, it } from 'vitest';
import { closeRequests, isSchemaMissing, markRequests } from './workerQueue.mjs';

/** `from('pipeline_requests').update(patch).in('id', ids)` · `.eq('id', id)` 모양만. */
function fakeClient(error = null) {
  const calls = [];
  const filter = (patch) => ({
    async in(col, value) {
      calls.push({ patch, col, value });
      return { error };
    },
    async eq(col, value) {
      calls.push({ patch, col, value });
      return { error };
    },
  });
  return { calls, from: () => ({ update: (patch) => filter(patch) }) };
}

describe('isSchemaMissing — 마이그레이션 미적용', () => {
  it('표 없음 · 칸 없음(42703 · column … does not exist) · schema cache', () => {
    expect(isSchemaMissing({ code: 'PGRST205', message: '' })).toBe(true);
    expect(isSchemaMissing({ code: '42703', message: '' })).toBe(true);
    expect(isSchemaMissing({ message: 'column blog_posts.requested_at does not exist' })).toBe(true);
    expect(isSchemaMissing({ code: 'PGRST204', message: "Could not find the 'requested_at' column of 'blog_posts' in the schema cache" })).toBe(true);
    expect(isSchemaMissing({ code: '42501', message: 'permission denied for table blog_posts' })).toBe(false);
    expect(isSchemaMissing(null)).toBe(false);
  });
});

describe('markRequests · closeRequests — 요청 행 쓰기는 fail-soft', () => {
  it('비면 쓰지 않고, 실패해도 던지지 않고 경고 한 줄', async () => {
    const lines = [];
    const quiet = fakeClient();
    await markRequests(quiet, [], { status: 'taken' });
    expect(quiet.calls).toHaveLength(0);
    const broken = fakeClient({ message: 'JWT expired' });
    await expect(markRequests(broken, ['a', 'b'], { status: 'taken' }, (l) => lines.push(l))).resolves.toBeUndefined();
    expect(broken.calls).toEqual([{ patch: { status: 'taken' }, col: 'id', value: ['a', 'b'] }]);
    expect(lines).toEqual(['⚠️ 요청 2건을 taken 로 못 적음 — JWT expired']);
  });

  it('행마다 정한 patch 를 쓰고, 포기한 요청은 경고한다', async () => {
    const lines = [];
    const client = fakeClient();
    const decide = (row) => (row.id === 'a' ? { patch: { status: 'queued', taken_at: null, args: { attempts: 1 } }, gaveUp: false } : { patch: { status: 'done', args: { attempts: 3 } }, gaveUp: true });
    await closeRequests(client, [{ id: 'a' }, { id: 'b' }], decide, (l) => lines.push(l));
    expect(client.calls.map((c) => [c.value, c.patch.status])).toEqual([
      ['a', 'queued'],
      ['b', 'done'],
    ]);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/요청 b 가 3번 돌지 못해 done/);
  });
});
