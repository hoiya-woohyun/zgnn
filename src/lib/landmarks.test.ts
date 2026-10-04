import { describe, expect, it } from 'vitest';
import { LANDMARKS, isNearLandmark, landmarkOfWord } from './landmarks';
import { distanceKm } from './places';

/** 지역 태그(`region.town`)가 글자로 이미 받는 이름들 — 별칭으로 넣으면 반경이 읍·면 검색을 좁히지 않고 넓히기만 한다. */
const TOWN_STEMS = ['애월', '한림', '한경', '대정', '안덕', '남원', '표선', '성산', '구좌', '조천', '우도', '추자', '서귀포', '제주'];

describe('LANDMARKS 표', () => {
  it('별칭은 공백이 없고 랜드마크끼리 겹치지 않는다 — 겹치면 앞의 것만 걸린다', () => {
    const all = LANDMARKS.flatMap((landmark) => landmark.aliases);
    expect(all.filter((alias) => /\s/.test(alias))).toEqual([]);
    expect(all.filter((alias, index) => all.indexOf(alias) !== index)).toEqual([]);
  });

  it('이름이 별칭에 있다 — 화면에 보인 이름으로 검색해도 걸린다', () => {
    for (const landmark of LANDMARKS) {
      expect(landmark.aliases.some((alias) => landmark.name.split('·').includes(alias))).toBe(true);
    }
  });

  it('읍·면·시 이름은 별칭이 아니다', () => {
    const all = LANDMARKS.flatMap((landmark) => landmark.aliases);
    expect(all.filter((alias) => TOWN_STEMS.includes(alias))).toEqual([]);
  });

  it('중심은 제주 본섬 둘레 안이다 — 위도·경도를 바꿔 적으면 여기서 걸린다', () => {
    for (const { name, center } of LANDMARKS) {
      expect(center.lat, name).toBeGreaterThan(33.1);
      expect(center.lat, name).toBeLessThan(33.6);
      expect(center.lng, name).toBeGreaterThan(126.1);
      expect(center.lng, name).toBeLessThan(127.0);
    }
  });
});

describe('landmarkOfWord · isNearLandmark', () => {
  it('별칭 어느 것으로도 같은 랜드마크', () => {
    expect(landmarkOfWord('금능')?.name).toBe('협재·금능');
    expect(landmarkOfWord('협재해수욕장')?.name).toBe('협재·금능');
    expect(landmarkOfWord('카페')).toBeNull();
  });

  it('반경 경계 — 안쪽은 참, 바깥은 거짓, 좌표 없으면 거짓', () => {
    const hamdeok = landmarkOfWord('함덕')!;
    const north = (km: number) => ({ geo: { lat: hamdeok.center.lat + km / 111, lng: hamdeok.center.lng } });
    expect(distanceKm(hamdeok.center, north(1.9).geo)).toBeLessThan(hamdeok.radiusKm);
    expect(isNearLandmark(north(1.9), hamdeok)).toBe(true);
    expect(isNearLandmark(north(2.1), hamdeok)).toBe(false);
    expect(isNearLandmark({}, hamdeok)).toBe(false);
  });
});
