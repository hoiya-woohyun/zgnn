import { describe, expect, it } from 'vitest';
import { collectRequestKey, collectRequestLine, collectRequestQuery, collectView, latestRequestByName, type TCollectRequest } from './adminCollectRequest';

const request = (patch: Partial<TCollectRequest>): TCollectRequest => ({
  id: 'r1',
  query: '제주 카페살레',
  name_key: '카페살레',
  status: 'done',
  requested_at: '2026-10-01T00:00:00Z',
  done_at: '2026-10-02T03:00:00Z',
  found: 12,
  to_read: 5,
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
    expect(collectRequestLine(request({ status: 'queued', done_at: null }))).toBe("'제주 카페살레' 로 찾을 차례예요 — 터미널에서 pnpm data:collect");
  });
  it('끝났으면 다음 분석이 읽을 글 수 — 0 이면 더 붙을 근거가 없다고 말한다', () => {
    expect(collectRequestLine(request({}))).toMatch(/글 12건 중 5건을 다음 pnpm data:analyze 가 먼저 읽어요$/);
    expect(collectRequestLine(request({ to_read: 0 }))).toMatch(/글 12건 모두 분석이 끝난 글이에요 — 더 붙을 근거가 없어요$/);
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
