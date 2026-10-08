import { describe, expect, it } from 'vitest';
import { parsePetPolicy } from './petPolicy';
import { matchesQuery } from './placeSearch';
import type { TPlaceEntry } from './places';
import type { TPlaceType } from '../types';

const place = (
  over: Partial<Pick<TPlaceEntry, 'type' | 'name' | 'features' | 'category' | 'geo'>> & { town?: string; policyText?: string } = {},
) => ({
  type: over.type ?? ('cafe' as TPlaceType),
  name: over.name ?? '어느 곳',
  features: over.features ?? '',
  category: over.category,
  geo: over.geo,
  region: { direction: 'west' as const, town: over.town ?? '애월읍', raw: '' },
  policy: parsePetPolicy(over.policyText ?? ''),
});

describe('matchesQuery', () => {
  it('"애월 카페" — 종류 이름은 종류로, 나머지는 읍면으로 찾는다', () => {
    expect(matchesQuery(place({ town: '애월읍' }), '애월 카페')).toBe(true);
    expect(matchesQuery(place({ town: '구좌읍' }), '애월 카페')).toBe(false);
  });

  it('다른 종류 이름이면 이 탭은 0곳 — 숙소 탭의 "서귀포 카페" 가 펜션을 내지 않는다(14 W261007.11)', () => {
    expect(matchesQuery(place({ type: 'stay', town: '서귀포시' }), '서귀포 카페')).toBe(false);
    expect(matchesQuery(place({ type: 'stay', town: '서귀포시' }), '서귀포 숙소')).toBe(true);
    // 글자로 보지 않는다 — 특징에 '카페' 가 있는 숙소도 카페 검색에 안 걸린다.
    expect(matchesQuery(place({ type: 'stay', features: '1층 카페에서 조식' }), '카페')).toBe(false);
  });

  it('카드의 조건 칩 글자로 찾는다 — "대형견"·"유모차"(14 W261007.11)', () => {
    expect(matchesQuery(place({ policyText: '대형견도 환영. 실내 동반 가능' }), '대형견')).toBe(true);
    expect(matchesQuery(place({ policyText: '대형견도 환영. 실내 동반 가능' }), '대형견 ok')).toBe(true);
    expect(matchesQuery(place({ policyText: '실내에서는 유모차/이동 가방 필요' }), '유모차')).toBe(true);
    expect(matchesQuery(place({ policyText: '실내 동반 가능' }), '유모차')).toBe(false);
  });

  it('거절하는 칩은 찾지 않는다 — "대형견" 에 "대형견 불가" 곳을 내면 답이 거꾸로다', () => {
    expect(matchesQuery(place({ policyText: '대형견 불가. 실내 동반 가능' }), '대형견')).toBe(false);
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

  it('빈 질의는 전부 · 종류 이름뿐이면 그 종류 전부가 맞는다', () => {
    expect(matchesQuery(place(), '')).toBe(true);
    expect(matchesQuery(place(), '   ')).toBe(true);
    expect(matchesQuery(place({ type: 'cafe' }), '카페')).toBe(true);
    expect(matchesQuery(place({ type: 'restaurant' }), '카페')).toBe(false);
  });

  it('"서귀포"·"제주시" — 시 이름은 소속 읍·면까지 맞는다(14 W261006.9)', () => {
    expect(matchesQuery(place({ town: '성산읍' }), '서귀포')).toBe(true);
    expect(matchesQuery(place({ town: '대정읍' }), '서귀포시 카페')).toBe(true);
    expect(matchesQuery(place({ town: '서귀포시' }), '서귀포')).toBe(true);
    expect(matchesQuery(place({ town: '애월읍' }), '서귀포')).toBe(false);
    expect(matchesQuery(place({ town: '애월읍' }), '제주시')).toBe(true);
    expect(matchesQuery(place({ town: '우도면' }), '제주시')).toBe(true);
    expect(matchesQuery(place({ town: '표선면' }), '제주시')).toBe(false);
  });

  it('맨 "제주" 는 시를 고르지 않는다 — 섬 전체라 글자로만 찾는다', () => {
    expect(matchesQuery(place({ town: '성산읍', name: '오늘도제주' }), '제주')).toBe(true);
    expect(matchesQuery(place({ town: '애월읍', name: '어느 곳' }), '제주')).toBe(false);
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
