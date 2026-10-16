import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import {
  collectRequestKey,
  collectRequestLine,
  collectRequestQuery,
  collectView,
  latestRequestByName,
  requestCollect,
  withUnread,
  type TCollectRequest,
} from './adminCollectRequest';

const request = (patch: Partial<TCollectRequest>): TCollectRequest => ({
  id: 'r1',
  query: '제주 카페살레',
  name: '카페살레',
  name_key: '카페살레',
  candidate_id: null,
  status: 'done',
  requested_at: '2026-10-01T00:00:00Z',
  done_at: '2026-10-02T03:00:00Z',
  found: 12,
  to_read: 5,
  post_urls: [],
  ...patch,
});

describe('collectRequestQuery', () => {
  it('제주 + 상호명 — 애견동반 같은 말은 붙이지 않는다', () => {
    expect(collectRequestQuery('카페살레')).toBe('제주 카페살레');
    expect(collectRequestQuery('  숨도   카페 ')).toBe('제주 숨도 카페');
  });
});

describe('collectRequestKey', () => {
  it('후보의 nameKey 가 있으면 그것, 없으면 normalizeName', () => {
    expect(collectRequestKey('카페 살레', '카페살레')).toBe('카페살레');
    expect(collectRequestKey('카페 살레')).toBe(collectRequestKey('카페살레'));
  });
});

describe('latestRequestByName', () => {
  it('대기 중이 끝난 것보다 이기고, 끝난 것끼리는 늦게 끝난 쪽', () => {
    const old = request({ id: 'a', done_at: '2026-09-20T00:00:00Z' });
    const recent = request({ id: 'b', done_at: '2026-10-05T00:00:00Z' });
    const queued = request({ id: 'c', status: 'queued', done_at: null, found: null, to_read: null });
    expect(latestRequestByName([old, recent]).카페살레.id).toBe('b');
    expect(latestRequestByName([queued, recent, old]).카페살레.id).toBe('c');
  });
});

describe('collectRequestLine', () => {
  it('요청이 없으면 아무 말도 안 한다', () => {
    expect(collectRequestLine(undefined)).toBeNull();
  });
  it('대기 중이면 검색어와 다음 명령', () => {
    expect(collectRequestLine(request({ status: 'queued', done_at: null }))).toBe("'제주 카페살레' 로 찾을 차례예요 — 터미널에서 pnpm data collect");
  });
  it('끝났으면 **지금** 미분석 수(unread) — 분석이 다 읽은 뒤에는 "먼저 읽어요" 가 남지 않는다', () => {
    expect(collectRequestLine(request({ unread: 3 }))).toMatch(/글 12건 중 3건이 아직 분석 전이에요 — 다음 분석이 먼저 읽어요$/);
    expect(collectRequestLine(request({ unread: 0 }))).toMatch(/글 12건을 다 읽었어요/);
  });
  it('못 셌으면(unread 없음) 수집 시점의 말로', () => {
    expect(collectRequestLine(request({}))).toMatch(/글 12건 중 수집 때 미분석 5건 — 다음 분석이 먼저 읽어요$/);
  });
  it('수집 때부터 읽을 글이 없었거나 찾은 글이 없으면 그렇게 말한다', () => {
    expect(collectRequestLine(request({ to_read: 0, unread: 0 }))).toMatch(/모두 이미 분석이 끝난 글이었어요 — 더 붙을 근거가 없어요$/);
    expect(collectRequestLine(request({ found: 0, to_read: 0 }))).toMatch(/찾은 글이 없어요$/);
  });
});

describe('collectView', () => {
  const extracted = { name: '카페살레', nameKey: '카페살레' };
  it('목록을 못 읽었으면 버튼을 안 그린다', () => {
    expect(collectView(undefined, extracted)).toBeUndefined();
    expect(collectView({ kind: 'error', message: 'x' }, extracted)).toBeUndefined();
  });
  it('표가 없으면 꺼진 버튼', () => {
    expect(collectView({ kind: 'unavailable' }, extracted)).toEqual({ query: '제주 카페살레', line: null, queued: false, unavailable: true });
  });
  it('대기 중인 요청이 있으면 queued', () => {
    const queued = request({ status: 'queued', done_at: null });
    expect(collectView({ kind: 'ok', byName: { 카페살레: queued } }, extracted)?.queued).toBe(true);
    expect(collectView({ kind: 'ok', byName: {} }, extracted)).toEqual({ query: '제주 카페살레', line: null, queued: false, unavailable: false });
  });
});

describe('withUnread', () => {
  it('끝난 요청에만 지금 미분석 수를 얹는다', () => {
    const done = request({ post_urls: ['a', 'b', 'c'] });
    const queued = request({ id: 'q', status: 'queued', done_at: null, post_urls: [] });
    const [d, q] = withUnread([done, queued], new Set(['b']));
    expect(d.unread).toBe(1);
    expect(q.unread).toBeUndefined();
  });
});

describe('collectView — 묶음의 다른 이름 키', () => {
  it('대표가 바뀌어도 다른 행의 키로 건 요청을 찾는다(대기 중이면 버튼이 꺼진 채)', () => {
    const queued = request({ name_key: '심바카레', status: 'queued', done_at: null });
    const view = collectView({ kind: 'ok', byName: { 심바카레: queued } }, { name: '심바 카레 애월점', nameKey: '심바카레애월' }, [
      { name: '심바 카레 애월점', nameKey: '심바카레애월' },
      { name: '심바카레', nameKey: '심바카레' },
    ]);
    expect(view?.queued).toBe(true);
    expect(view?.query).toBe('제주 심바 카레 애월점');
  });
});

describe('requestCollect — 추가 수집과 장소 제안이 같은 길(14 W261010.13a ⑥)', () => {
  /** insert → select → single 사슬만 흉내 낸다. 넣은 행을 그대로 돌려준다. */
  const insertClient = (error: { code?: string; message: string } | null) => {
    const calls: { table: string; row: Record<string, unknown> }[] = [];
    const client = {
      from: (table: string) => ({
        insert: (row: Record<string, unknown>) => {
          calls.push({ table, row });
          return { select: () => ({ single: () => Promise.resolve(error ? { data: null, error } : { data: request(row as Partial<TCollectRequest>), error: null }) }) };
        },
      }),
    } as unknown as SupabaseClient;
    return { calls, client };
  };

  it('후보가 있으면 candidate_id 를 함께 · 없으면(장소 제안) 칸을 아예 빼고 넣는다 — 검색어·이름 키는 같은 함수', async () => {
    const withCandidate = insertClient(null);
    await requestCollect(withCandidate.client, { name: '카페 바당', candidateId: 'c9' });
    expect(withCandidate.calls).toEqual([
      { table: 'collect_requests', row: { query: '제주 카페 바당', name: '카페 바당', name_key: collectRequestKey('카페 바당'), candidate_id: 'c9' } },
    ]);

    const suggestion = insertClient(null);
    const made = await requestCollect(suggestion.client, { name: '카페 바당' });
    expect(suggestion.calls[0].row).toEqual({ query: '제주 카페 바당', name: '카페 바당', name_key: collectRequestKey('카페 바당') });
    expect(suggestion.calls[0].row).not.toHaveProperty('candidate_id');
    // 넣은 행을 돌려받는다 — 화면이 다시 읽지 않고 곧바로 "찾을 차례예요" 를 그린다.
    expect(made).toMatchObject({ name_key: collectRequestKey('카페 바당') });
  });

  it('이미 대기 중(23505)은 실패가 아니다 · 다른 오류는 던진다', async () => {
    await expect(requestCollect(insertClient({ code: '23505', message: 'dup' }).client, { name: '바당' })).resolves.toBe('alreadyQueued');
    await expect(requestCollect(insertClient({ code: '42501', message: 'denied' }).client, { name: '바당' })).rejects.toThrow('수집 요청: denied');
  });
});
