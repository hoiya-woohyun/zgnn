import { describe, expect, it } from 'vitest';
import type { TPlaceEntry } from './places';
import { movedStop, tripDayStart, tripDayStops } from './tripDayView';
import type { TTripPlan } from './tripPlan';
import type { TPlaceType } from '../types';

// 제주 좌표 샘플(어림값, tripRoute.test 와 같다).
const GEO = {
  aewol: { lat: 33.463, lng: 126.31 },
  hyeopjae: { lat: 33.394, lng: 126.239 },
  hamdeok: { lat: 33.543, lng: 126.669 },
  seongsan: { lat: 33.458, lng: 126.94 },
};
// 순서·시작점은 id · type · geo 만 본다 — 나머지 칸은 채우지 않는다.
const at = (id: string, type: TPlaceType, geo?: { lat: number; lng: number }) => ({ id, type, geo }) as unknown as TPlaceEntry;
const ids = (list: readonly { id: string }[]) => list.map((place) => place.id);

const PLACES = [
  at('cafe-hamdeok', 'cafe', GEO.hamdeok),
  at('stay-aewol', 'stay', GEO.aewol),
  at('cafe-hyeopjae', 'cafe', GEO.hyeopjae),
  at('stay-seongsan', 'stay', GEO.seongsan),
  at('food-nogeo', 'restaurant'),
];

describe('tripDayStart — 그 날의 기본 시작점', () => {
  it('첫날은 공항, 다음 날은 전날 순서의 마지막 숙소', () => {
    const plan: TTripPlan = { days: { 'cafe-hamdeok': 1, 'stay-aewol': 1, 'cafe-hyeopjae': 2 }, order: {} };
    expect(tripDayStart(plan, PLACES, 1)).toEqual({ kind: 'airport' });
    const second = tripDayStart(plan, PLACES, 2);
    expect(second.kind === 'prevStay' && second.place.id).toBe('stay-aewol');
  });

  it('비워 둔 날은 건너뛰고 곳이 있는 가장 가까운 앞 날을 본다 · 앞 날이 하나도 없으면 공항', () => {
    const plan: TTripPlan = { days: { 'stay-aewol': 1, 'cafe-hyeopjae': 3 }, order: {} };
    const third = tripDayStart(plan, PLACES, 3);
    expect(third.kind === 'prevStay' && third.place.id).toBe('stay-aewol');
    expect(tripDayStart({ days: { 'cafe-hyeopjae': 3 }, order: {} }, PLACES, 3)).toEqual({ kind: 'airport' });
  });

  it('앞 날에 숙소가 없거나 숙소 좌표가 없으면 none — 공항으로 되돌리지 않는다', () => {
    expect(tripDayStart({ days: { 'cafe-hamdeok': 1, 'cafe-hyeopjae': 2 }, order: {} }, PLACES, 2)).toEqual({ kind: 'none' });
    const noGeo = [...PLACES, at('stay-nogeo', 'stay')];
    expect(tripDayStart({ days: { 'stay-nogeo': 1, 'cafe-hyeopjae': 2 }, order: {} }, noGeo, 2)).toEqual({ kind: 'none' });
  });

  it('숙소가 둘이면 손 순서의 마지막 숙소', () => {
    const plan: TTripPlan = { days: { 'stay-aewol': 1, 'stay-seongsan': 1, 'cafe-hyeopjae': 2 }, order: { 1: ['stay-seongsan', 'stay-aewol'] } };
    const second = tripDayStart(plan, PLACES, 2);
    expect(second.kind === 'prevStay' && second.place.id).toBe('stay-aewol');
  });
});

describe('tripDayStops — 그 날의 순서', () => {
  const plan: TTripPlan = { days: { 'stay-aewol': 1, 'cafe-hyeopjae': 1, 'cafe-hamdeok': 1, 'food-nogeo': 1 }, order: {} };

  it('손 순서가 없으면 기본 시작점(공항)에서 가까운 순, 숙소 마지막, 좌표 없는 곳은 숙소 앞 끝', () => {
    expect(ids(tripDayStops(plan, PLACES, 1))).toEqual(['cafe-hamdeok', 'cafe-hyeopjae', 'food-nogeo', 'stay-aewol']);
  });

  it('시작점을 주면 그 자리에서 제안한다("내 위치에서")', () => {
    expect(ids(tripDayStops(plan, PLACES, 1, GEO.hyeopjae))).toEqual(['cafe-hyeopjae', 'cafe-hamdeok', 'food-nogeo', 'stay-aewol']);
  });

  it('손 순서가 있으면 제안이 덮지 않는다', () => {
    const manual: TTripPlan = { ...plan, order: { 1: ['stay-aewol', 'food-nogeo'] } };
    expect(ids(tripDayStops(manual, PLACES, 1, GEO.hyeopjae))).toEqual(['stay-aewol', 'food-nogeo', 'cafe-hamdeok', 'cafe-hyeopjae']);
  });
});

describe('movedStop', () => {
  it('한 칸 옮기고, 끝에서는 그대로', () => {
    expect(movedStop(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c']);
    expect(movedStop(['a', 'b', 'c'], 'c', 1)).toEqual(['a', 'b', 'c']);
    expect(movedStop(['a', 'b'], 'x', 1)).toEqual(['a', 'b']);
  });
});
