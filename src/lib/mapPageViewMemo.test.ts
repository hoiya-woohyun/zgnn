import { describe, expect, it } from 'vitest';
import { mapPageViewMemoOf, withMapPageViewMemo } from './mapPageViewMemo';

describe('mapPageViewMemo — 뒤로 온 지도가 떠날 때의 시야로 열린다', () => {
  const view = { lat: 33.46, lng: 126.31, zoom: 12 };

  it('적은 시야를 그대로 읽는다', () => {
    expect(mapPageViewMemoOf(withMapPageViewMemo({}, view))).toEqual(view);
  });

  it('다른 값(Next 의 __NA · 깊이 새김)은 그대로 둔다', () => {
    const next = withMapPageViewMemo({ __NA: true, zgnnDepth: 2, zgnnRoot: '/map' }, view);
    expect(next).toMatchObject({ __NA: true, zgnnDepth: 2, zgnnRoot: '/map' });
    expect(mapPageViewMemoOf(next)).toEqual(view);
  });

  it('state 가 없어도 적을 수 있다', () => {
    expect(mapPageViewMemoOf(withMapPageViewMemo(null, view))).toEqual(view);
  });

  it('없거나 모양이 틀리면 null — 평소처럼 연다(탭으로 다시 온 지도 · 미니 지도에서 온 지도)', () => {
    expect(mapPageViewMemoOf(null)).toBeNull();
    expect(mapPageViewMemoOf({ __NA: true })).toBeNull();
    expect(mapPageViewMemoOf({ zgnnMapView: { lat: '33', lng: 126, zoom: 10 } })).toBeNull();
    expect(mapPageViewMemoOf({ zgnnMapView: { lat: Number.NaN, lng: 126, zoom: 10 } })).toBeNull();
    expect(mapPageViewMemoOf({ zgnnMapView: { lat: 33, lng: 126, zoom: 0 } })).toBeNull();
    expect(mapPageViewMemoOf({ zgnnMapView: { lat: 133, lng: 126, zoom: 10 } })).toBeNull();
  });
});
