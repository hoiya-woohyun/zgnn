import { describe, expect, it } from 'vitest';
import type { TPlaceType } from '../types';
import { JEJU_AIRPORT, routeStartGeo, suggestOrder } from './tripRoute';

// 제주 좌표 샘플(어림값) — 공항에서 서쪽으로 애월 → 협재, 동쪽으로 함덕 → 성산, 남쪽에 중문.
const GEO = {
  aewol: { lat: 33.463, lng: 126.31 },
  hyeopjae: { lat: 33.394, lng: 126.239 },
  hamdeok: { lat: 33.543, lng: 126.669 },
  seongsan: { lat: 33.458, lng: 126.94 },
  jungmun: { lat: 33.25, lng: 126.41 },
};
const at = (id: string, type: TPlaceType, geo?: { lat: number; lng: number }) => ({ id, type, geo });
const ids = (list: readonly { id: string }[]) => list.map((place) => place.id);

describe('suggestOrder', () => {
  it('공항에서 가까운 순으로 잇고 숙소는 마지막', () => {
    const day = [at('stay-jungmun', 'stay', GEO.jungmun), at('cafe-hyeopjae', 'cafe', GEO.hyeopjae), at('food-aewol', 'restaurant', GEO.aewol)];
    expect(ids(suggestOrder(day, JEJU_AIRPORT))).toEqual(['food-aewol', 'cafe-hyeopjae', 'stay-jungmun']);
  });

  it('그리디 — 시작점이 아니라 직전 장소에서 가장 가까운 곳', () => {
    // 공항에서는 함덕이 애월보다 가깝지만, 애월에서 시작하면 협재가 함덕보다 가깝다.
    const day = [at('hamdeok', 'cafe', GEO.hamdeok), at('hyeopjae', 'cafe', GEO.hyeopjae), at('aewol', 'cafe', GEO.aewol)];
    expect(ids(suggestOrder(day, GEO.aewol))).toEqual(['aewol', 'hyeopjae', 'hamdeok']);
  });

  it('숙소가 가장 가까워도 끝에 선다 · stayLast: false 면 거리대로', () => {
    const day = [at('cafe-seongsan', 'cafe', GEO.seongsan), at('stay-hamdeok', 'stay', GEO.hamdeok)];
    expect(ids(suggestOrder(day, JEJU_AIRPORT))).toEqual(['cafe-seongsan', 'stay-hamdeok']);
    expect(ids(suggestOrder(day, JEJU_AIRPORT, { stayLast: false }))).toEqual(['stay-hamdeok', 'cafe-seongsan']);
  });

  it('숙소가 둘이면 앞 체인 끝에서부터 가까운 순', () => {
    const day = [at('stay-jungmun', 'stay', GEO.jungmun), at('stay-seongsan', 'stay', GEO.seongsan), at('cafe-hamdeok', 'cafe', GEO.hamdeok)];
    expect(ids(suggestOrder(day, JEJU_AIRPORT))).toEqual(['cafe-hamdeok', 'stay-seongsan', 'stay-jungmun']);
  });

  it('좌표 없는 곳은 그 묶음 뒤에 원래 순서대로 — 숙소는 그래도 마지막', () => {
    const day = [at('none1', 'cafe'), at('stay-none', 'stay'), at('aewol', 'cafe', GEO.aewol), at('none2', 'restaurant')];
    expect(ids(suggestOrder(day, JEJU_AIRPORT))).toEqual(['aewol', 'none1', 'none2', 'stay-none']);
  });

  it('시작점이 없으면 첫 좌표 있는 곳부터 잇는다', () => {
    const day = [at('none', 'cafe'), at('hyeopjae', 'cafe', GEO.hyeopjae), at('seongsan', 'cafe', GEO.seongsan), at('aewol', 'cafe', GEO.aewol)];
    expect(ids(suggestOrder(day, null))).toEqual(['hyeopjae', 'aewol', 'seongsan', 'none']);
  });

  it('동점이면 입력 순서 · 빈 입력은 빈 배열 · 입력을 바꾸지 않는다', () => {
    const day = [at('b', 'cafe', GEO.aewol), at('a', 'cafe', GEO.aewol)];
    const snapshot = ids(day);
    expect(ids(suggestOrder(day, JEJU_AIRPORT))).toEqual(['b', 'a']);
    expect(ids(day)).toEqual(snapshot);
    expect(suggestOrder([], JEJU_AIRPORT)).toEqual([]);
  });
});

describe('routeStartGeo', () => {
  it('공항 · 현재 위치 · 전날 숙소(좌표 없으면 null)', () => {
    expect(routeStartGeo({ kind: 'airport' })).toBe(JEJU_AIRPORT);
    expect(routeStartGeo({ kind: 'here', geo: GEO.aewol })).toBe(GEO.aewol);
    expect(routeStartGeo({ kind: 'prevStay', geo: GEO.jungmun })).toBe(GEO.jungmun);
    expect(routeStartGeo({ kind: 'prevStay' })).toBeNull();
  });
});
