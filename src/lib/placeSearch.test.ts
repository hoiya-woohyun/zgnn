import { describe, expect, it } from 'vitest';
import { matchesQuery } from './placeSearch';
import type { TPlaceEntry } from './places';

const place = (over: Partial<Pick<TPlaceEntry, 'name' | 'features' | 'category' | 'geo'>> & { town?: string } = {}) => ({
  name: over.name ?? '어느 곳',
  features: over.features ?? '',
  category: over.category,
  geo: over.geo,
  region: { direction: 'west' as const, town: over.town ?? '애월읍', raw: '' },
});

describe('matchesQuery', () => {
  it('"애월 카페" — 종류 이름은 빼고 읍면으로 찾는다', () => {
    expect(matchesQuery(place({ town: '애월읍' }), '애월 카페')).toBe(true);
    expect(matchesQuery(place({ town: '구좌읍' }), '애월 카페')).toBe(false);
  });

  it('"그리너리 빌리지" — 이름의 띄어쓰기와 상관없다', () => {
    expect(matchesQuery(place({ name: '그리너리빌리지 펜션' }), '그리너리 빌리지')).toBe(true);
    expect(matchesQuery(place({ name: '그리너리빌리지 펜션' }), '그리너리빌리지펜션')).toBe(true);
  });

  it('"고기 굽는" — 단어마다 어디든 있으면 된다', () => {
    expect(matchesQuery(place({ features: '마당에서 고기를 굽는 바베큐' }), '고기 굽는')).toBe(true);
    expect(matchesQuery(place({ features: '마당에서 고기를 먹는다' }), '고기 굽는')).toBe(false);
  });

  it('"카레" — 업종으로 찾는다', () => {
    expect(matchesQuery(place({ category: '카레' }), '카레')).toBe(true);
    expect(matchesQuery(place({ category: undefined }), '카레')).toBe(false);
  });

  it('빈 질의 · 종류 이름뿐이면 전부 맞는다', () => {
    expect(matchesQuery(place(), '')).toBe(true);
    expect(matchesQuery(place(), '   ')).toBe(true);
    expect(matchesQuery(place(), '카페')).toBe(true);
  });

  describe('관광지 이름 — 좌표 반경으로도 맞는다', () => {
    // 중문 중심(33.2496, 126.412)에서 위도 0.01° ≈ 1.1km.
    const nearJungmun = { lat: 33.2596, lng: 126.412 };
    const seogwipoTown = { lat: 33.2461, lng: 126.5636 }; // 서귀포 시내, 약 14km

    it('"중문 카페" — 지역 태그가 서귀포시여도 반경 안이면 맞는다', () => {
      expect(matchesQuery(place({ town: '서귀포시', geo: nearJungmun }), '중문 카페')).toBe(true);
      expect(matchesQuery(place({ town: '서귀포시', geo: seogwipoTown }), '중문 카페')).toBe(false);
    });

    it('별칭 "중문관광단지" 도 같은 랜드마크다', () => {
      expect(matchesQuery(place({ geo: nearJungmun }), '중문관광단지')).toBe(true);
    });

    it('좌표가 없으면 글자로만 본다', () => {
      expect(matchesQuery(place({ town: '서귀포시' }), '중문')).toBe(false);
      expect(matchesQuery(place({ name: '중문 바당집' }), '중문')).toBe(true);
    });

    it('다른 단어는 그대로 모두 맞아야 한다', () => {
      expect(matchesQuery(place({ geo: nearJungmun, category: '카레' }), '중문 카레')).toBe(true);
      expect(matchesQuery(place({ geo: nearJungmun }), '중문 카레')).toBe(false);
    });
  });
});
