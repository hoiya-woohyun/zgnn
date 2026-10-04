import { describe, expect, it } from 'vitest';
import { parseRegion } from './placeFields.mjs';
import { canonicalRegionRaw, canonicalTown, regionFromBranchName, TOPONYM_TOWN, TOWN_DIRECTION, townFromBranchName } from './jejuRegions.mjs';

describe('정본 지역 표', () => {
  it('방향은 추출 프롬프트의 표와 같다 — 안덕면은 남쪽', () => {
    expect(TOWN_DIRECTION.안덕면).toBe('south');
    expect(canonicalRegionRaw('안덕면')).toBe('남쪽 (안덕면)');
    expect(canonicalRegionRaw('구좌읍')).toBe('동쪽 (구좌읍)');
    expect(canonicalRegionRaw('우도면')).toBe('우도면');
    expect(canonicalRegionRaw('서귀포')).toBe('남쪽 (서귀포시)');
    expect(canonicalRegionRaw('모르는면')).toBeNull();
  });

  it('정본 regionRaw 는 parseRegion 과 왕복이 맞는다', () => {
    for (const [town, direction] of Object.entries(TOWN_DIRECTION)) {
      const parsed = parseRegion(canonicalRegionRaw(town));
      expect(parsed.direction, town).toBe(direction);
      expect(parsed.town, town).toBe(town);
    }
  });

  it('리·동 지명은 읍·면(시)으로 — 모든 지명의 읍·면이 표에 있다', () => {
    expect(TOPONYM_TOWN.get('월정')).toBe('구좌읍');
    expect(TOPONYM_TOWN.get('중문')).toBe('서귀포시');
    for (const town of TOPONYM_TOWN.values()) expect(TOWN_DIRECTION[town], town).toBeDefined();
  });

  it('비정규 표기는 시로', () => {
    expect(canonicalTown('서귀포')).toBe('서귀포시');
    expect(canonicalTown('애월읍')).toBe('애월읍');
  });
});

describe('townFromBranchName — 지점 꼬리의 지명만', () => {
  it.each([
    ['이춘옥고등어쌈밥 월정리점', '구좌읍'],
    ['이춘옥고등어쌈밥월정리점', '구좌읍'],
    ['레스토랑 제주성산점', '성산읍'],
    ['프릳츠 성산점', '성산읍'],
    ['어느식당 애월본점', '애월읍'],
    ['어느카페 서귀포점', '서귀포시'],
    ['어느카페 노형동점', '제주시'],
  ])('%s → %s', (name, town) => {
    expect(townFromBranchName(name)).toBe(town);
  });

  it.each([
    ['함덕해물라면'], // 이름 앞의 지명은 본점 위치이거나 상호의 일부다
    ['제주하도'],
    ['어느카페 제주점'], // 너무 넓다
    ['어느카페 공항점'],
    ['어느카페 본점'],
    ['어느카페 성산일출봉점'], // 지명표에 없는 말
    [null],
  ])('%s → null', (name) => {
    expect(townFromBranchName(name)).toBeNull();
  });

  it('정본 regionRaw 로', () => {
    expect(regionFromBranchName('이춘옥고등어쌈밥 월정리점')).toBe('동쪽 (구좌읍)');
    expect(regionFromBranchName('함덕해물라면')).toBeNull();
  });
});
