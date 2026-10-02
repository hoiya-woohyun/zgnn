import { describe, expect, it } from 'vitest';
import { regionWarnings, townOfAddress } from './regionCheck.mjs';

describe('townOfAddress', () => {
  it('읍면 주소는 읍면', () => {
    expect(townOfAddress('제주 제주시 구좌읍 행원로1길 32-5')).toBe('구좌읍');
    expect(townOfAddress('제주특별자치도 서귀포시 안덕면 녹차분재로 44-26')).toBe('안덕면');
  });

  it('동 주소는 시', () => {
    expect(townOfAddress('제주 제주시 노형동 123')).toBe('제주시');
    expect(townOfAddress('제주 서귀포시 소보리당로 200')).toBe('서귀포시');
  });

  it('도로명 안의 글자에 걸리지 않고, 못 읽으면 null', () => {
    expect(townOfAddress('제주 제주시 중산간동로 1')).toBe('제주시');
    expect(townOfAddress('')).toBeNull();
    expect(townOfAddress(undefined)).toBeNull();
    expect(townOfAddress('제주 어딘가')).toBeNull();
  });
});

const place = (name, town, direction, address) => ({ name, address, region: { town, direction, raw: '' } });

describe('regionWarnings', () => {
  it('읍면이 주소와 다르면 이름을 대고, 맞으면 조용하다', () => {
    const warnings = regionWarnings([
      place('위미애머물다락쿤', '남원읍', 'south', '제주 제주시 구좌읍 행원로1길 32-5'),
      place('솔숲펜션', '구좌읍', 'east', '제주 제주시 구좌읍 충렬로 141-15'),
    ]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('위미애머물다락쿤');
  });

  it('시내 표기(서귀포 ↔ 서귀포시)는 같은 곳이다', () => {
    expect(regionWarnings([
      place('그리너리빌리지 펜션', '서귀포', 'south', '제주 서귀포시 소보리당로 200'),
      place('어느 카페', '서귀포시', 'south', '제주 서귀포시 중앙로 1'),
    ])).toEqual([]);
  });

  it('시를 읍면 자리에 둔 곳이 읍면 주소면 경고한다', () => {
    expect(regionWarnings([place('살롱드라방', '제주시', 'north', '제주 제주시 애월읍 하가로 146-9')])).toHaveLength(1);
  });

  it('주소가 없으면 읍면 대조는 건너뛴다', () => {
    expect(regionWarnings([place('미트타운', '애월읍', 'west', undefined)])).toEqual([]);
  });

  it('같은 읍면이 두 방향이면 양쪽 이름을 댄다', () => {
    const warnings = regionWarnings([
      place('웨스티하우스', '안덕면', 'south', undefined),
      place('개떼목장', '안덕면', 'west', undefined),
    ]);
    expect(warnings).toEqual([expect.stringContaining('안덕면')]);
    expect(warnings[0]).toContain('웨스티하우스');
    expect(warnings[0]).toContain('개떼목장');
  });
});
