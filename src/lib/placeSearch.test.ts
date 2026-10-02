import { describe, expect, it } from 'vitest';
import { matchesQuery } from './placeSearch';
import type { TPlaceEntry } from './places';

const place = (over: Partial<Pick<TPlaceEntry, 'name' | 'features' | 'category'>> & { town?: string } = {}) => ({
  name: over.name ?? '어느 곳',
  features: over.features ?? '',
  category: over.category,
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
});
