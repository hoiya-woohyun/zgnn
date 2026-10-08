import { describe, expect, it } from 'vitest';
import { AREAS, countByArea, type TAreaCounts } from './areaGroups';
import { LANDMARKS } from './landmarks';
import {
  homePageAreaCardCounts,
  homePageAreaLandmarks,
  homePageAreaStayGap,
  nearestAreaWithStay,
} from './homePageAreaCards';
import { countByLevel } from './eligibilityCounts';
import { PLACES, placesOfType } from './places';
import type { TDogProfile } from '../types';

const DUBU: TDogProfile = { dogs: [{ name: '두부', weightKg: 3 }], carrier: 'bag' };
const BORI: TDogProfile = { dogs: [{ name: '보리', weightKg: 30 }], carrier: 'none' };

const zero = { ok: 0, cond: 0, unknown: 0, hard: 0, outdoor: 0 };
/** 숙소 reach 만 지정한 가짜 표 — 나머지는 0. */
const withStays = (reach: Partial<Record<(typeof AREAS)[number]['id'], number>>): TAreaCounts =>
  Object.fromEntries(
    AREAS.map(({ id }) => [id, { stay: { ...zero, ok: reach[id] ?? 0 }, restaurant: zero, cafe: zero }]),
  ) as TAreaCounts;

describe('카드 수 — 히어로와 같은 셈', () => {
  it.each([DUBU, BORI])('6권역 카드의 묵을 곳·카페 합 = 히어로의 종류별 ok + 야외', (dog) => {
    const counts = countByArea(PLACES, dog);
    for (const type of ['stay', 'cafe'] as const) {
      const sum = AREAS.reduce((acc, { id }) => acc + homePageAreaCardCounts(counts, id)[type].reach, 0);
      const hero = countByLevel(placesOfType(type), dog);
      expect(sum, type).toBe(hero.ok + hero.outdoor);
      const totalSum = AREAS.reduce((acc, { id }) => acc + homePageAreaCardCounts(counts, id)[type].total, 0);
      expect(totalSum, `${type} 모은 곳`).toBe(placesOfType(type).length);
    }
  });
});

describe('0칸 문장', () => {
  it('묵을 곳이 있으면 문장이 없다', () => {
    expect(homePageAreaStayGap({ stay: { reach: 1, total: 5 }, cafe: { reach: 0, total: 0 } })).toBeNull();
  });

  it('모은 숙소가 2곳 이하면 덜 모았다, 3곳부터는 어렵다', () => {
    expect(homePageAreaStayGap({ stay: { reach: 0, total: 2 }, cafe: { reach: 0, total: 0 } })).toEqual({ kind: 'thin' });
    expect(homePageAreaStayGap({ stay: { reach: 0, total: 0 }, cafe: { reach: 0, total: 0 } })).toEqual({ kind: 'thin' });
    expect(homePageAreaStayGap({ stay: { reach: 0, total: 3 }, cafe: { reach: 0, total: 0 } })).toEqual({
      kind: 'hard',
      total: 3,
    });
  });
});

describe('가장 가까운 묵을 곳 권역', () => {
  it('섬을 도는 순서로 가까운 쪽 — 북부와 서부는 이웃이다', () => {
    expect(nearestAreaWithStay(withStays({ west: 2 }), 'north')).toBe('west');
    expect(nearestAreaWithStay(withStays({ north: 1 }), 'west')).toBe('north');
  });

  it('같은 거리면 묵을 곳이 많은 쪽, 더 먼 곳은 가까운 곳에 진다', () => {
    expect(nearestAreaWithStay(withStays({ southwest: 1, southeast: 4 }), 'south')).toBe('southeast');
    expect(nearestAreaWithStay(withStays({ southwest: 1, north: 9 }), 'south')).toBe('southwest');
  });

  it('모은 곳이 아니라 이 강아지가 묵을 곳으로 — 아무 데도 없으면 null', () => {
    expect(nearestAreaWithStay(withStays({}), 'south')).toBeNull();
    expect(nearestAreaWithStay(withStays({ south: 3 }), 'south')).toBeNull();
  });
});

describe('카드 안 관광지 칩 (14 W261007.9)', () => {
  const byArea = homePageAreaLandmarks(PLACES);
  const placed = AREAS.flatMap(({ id }) => byArea[id]);

  it('세 종류 모두 0곳인 칩은 없다', () => {
    for (const { landmark, count } of placed) expect(count, landmark.name).toBeGreaterThan(0);
  });

  it('빠진 칩은 정말 0곳이다 — 세는 말은 칩이 거는 검색어', () => {
    const shown = new Set(placed.map(({ landmark }) => landmark.name));
    const dropped = LANDMARKS.filter((landmark) => !shown.has(landmark.name));
    expect(dropped.length).toBeGreaterThan(0);
    expect(shown.size + dropped.length).toBe(LANDMARKS.length);
  });

  it('중문은 남부 카드에', () => {
    expect(byArea.south.map(({ landmark }) => landmark.name)).toContain('중문');
  });
});
