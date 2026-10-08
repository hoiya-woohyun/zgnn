import { describe, expect, it } from 'vitest';
import { AREAS, areaOf, areaTownsLabel, countByArea, LANDMARK_KEY_TO_AREA, TOWN_TO_AREA, type TAreaCounts } from './areaGroups';
import { countByLevel } from './eligibilityCounts';
import { LANDMARKS_BY_AREA } from './landmarks';
import { ALL_TOWNS, PLACE_TYPES, PLACES, placesOfType } from './places';
import type { TDogProfile, TPlaceType } from '../types';

// 토론 2026-10-08 §1 의 세 원형(docs/reviews/2026-10-08-region-pick.md).
const DUBU: TDogProfile = { dogs: [{ name: '두부', weightKg: 3 }], carrier: 'bag' };
const BORI: TDogProfile = { dogs: [{ name: '보리', weightKg: 30 }], carrier: 'none' };
const KONG_HAPPY: TDogProfile = { dogs: [{ name: '콩', weightKg: 2.5 }, { name: '해피', weightKg: 12 }], carrier: 'stroller' };

/** 권역 순서대로 "갈 수 있는 곳"(ok + outdoor) — 히어로와 같은 셈. */
const reachRow = (counts: TAreaCounts, type: TPlaceType) => AREAS.map(({ id }) => counts[id][type].ok + counts[id][type].outdoor);

describe('두 매핑 — 읍면(셈)과 관광지 키(칩 배치)', () => {
  it('데이터의 모든 읍면이 권역을 갖는다 — 빠지면 그 곳이 셈에서 사라진다', () => {
    for (const town of ALL_TOWNS) expect(TOWN_TO_AREA[town], town).toBeDefined();
  });

  it('같은 이름은 같은 권역이다(애월 ↔ 애월읍, 제주시 ↔ 제주시)', () => {
    for (const key of Object.keys(LANDMARKS_BY_AREA) as (keyof typeof LANDMARKS_BY_AREA)[]) {
      const town = Object.keys(TOWN_TO_AREA).find((name) => name.startsWith(key));
      if (town) expect(LANDMARK_KEY_TO_AREA[key], `${key} ↔ ${town}`).toBe(TOWN_TO_AREA[town]);
    }
  });

  it('읍면이 아닌 관광지 키 — 중문은 서귀포시의 동이라 남부', () => {
    expect(LANDMARK_KEY_TO_AREA.중문).toBe('south');
    expect(LANDMARK_KEY_TO_AREA.서귀포).toBe(TOWN_TO_AREA.서귀포시);
  });

  it('6권역 모두 읍면이 있다 — 빈 카드가 매핑 실수로 생기지 않는다', () => {
    const used = new Set(Object.values(TOWN_TO_AREA));
    for (const { id } of AREAS) expect(used.has(id), id).toBe(true);
  });

  it('권역 라벨은 매핑의 읍면에서 — 읍·면 꼬리만 뗀다', () => {
    expect(areaTownsLabel('west')).toBe('서부(애월·한림·한경)');
    expect(areaTownsLabel('south')).toBe('남부(서귀포시·남원)');
  });

  it('모르는 읍면은 null', () => {
    expect(areaOf({ region: { town: '어딘가면' } })).toBeNull();
    expect(areaOf({ region: { town: '우도면' } })).toBe('east');
  });
});

describe('countByArea — 권역 × 종류', () => {
  it.each([
    ['두부', DUBU, {}],
    ['보리', BORI, {}],
    ['보리 · 실내 자리 필요', BORI, { needsIndoor: true }],
  ])('%s — 6권역 합 = 종류별 countByLevel 전체(칸마다)', (_, dog, opts) => {
    const byArea = countByArea(PLACES, dog, opts);
    for (const type of PLACE_TYPES) {
      const total = countByLevel(placesOfType(type), dog, opts);
      for (const level of ['ok', 'outdoor', 'cond', 'unknown', 'hard'] as const) {
        expect(AREAS.reduce((sum, { id }) => sum + byArea[id][type][level], 0), `${type}.${level}`).toBe(total[level]);
      }
    }
  });

  it('빈 목록이면 모든 칸이 0', () => {
    const counts = countByArea([], DUBU);
    for (const { id } of AREAS) for (const type of PLACE_TYPES) expect(counts[id][type].ok).toBe(0);
  });

  // 토론 §1 표 — 게시 84곳에서 시작해 2026-10-08 122곳(블로그 38곳)으로 다시 쟀다(19 T2.1). 데이터·판정이 바뀌면 여기가 먼저 깨진다 —
  // 새 곳만 들어온 갱신이면 칸은 같거나 늘어야 한다(줄면 판정 회귀다). 표(19 §4)를 고친 뒤 이 값을 고친다.
  describe('토론 §1 표 — 갈 수 있는 곳(ok + 야외), 권역 순서 서부·서남·남부·동남·동부·북부', () => {
    it('두부 3kg · 가방', () => {
      const counts = countByArea(PLACES, DUBU);
      expect(reachRow(counts, 'stay')).toEqual([10, 3, 0, 2, 5, 3]);
      expect(reachRow(counts, 'cafe')).toEqual([7, 6, 4, 5, 10, 4]);
      expect(reachRow(counts, 'restaurant')).toEqual([3, 0, 3, 3, 1, 2]);
    });

    it('보리 30kg · 이동 수단 없음 — 식당은 전 권역 ok 0, 동남·북부 야외 1', () => {
      const counts = countByArea(PLACES, BORI);
      expect(reachRow(counts, 'stay')).toEqual([1, 1, 0, 0, 1, 1]);
      expect(reachRow(counts, 'cafe')).toEqual([1, 1, 1, 1, 1, 0]);
      expect(AREAS.map(({ id }) => counts[id].restaurant.ok)).toEqual([0, 0, 0, 0, 0, 0]);
      expect(AREAS.map(({ id }) => counts[id].restaurant.outdoor)).toEqual([0, 0, 0, 1, 0, 1]);
    });

    it('콩 2.5kg + 해피 12kg · 유모차', () => {
      const counts = countByArea(PLACES, KONG_HAPPY);
      expect(reachRow(counts, 'stay')).toEqual([4, 1, 0, 1, 1, 3]);
      expect(reachRow(counts, 'cafe')).toEqual([7, 6, 4, 5, 10, 4]);
      expect(reachRow(counts, 'restaurant')).toEqual([3, 0, 3, 3, 1, 1]);
    });
  });
});
