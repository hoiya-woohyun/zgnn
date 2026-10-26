import { describe, expect, it } from 'vitest';
import { placeMetaLine } from './placeMetaLine';

const place = { category: '펜션', type: 'stay' as const, region: { town: '구좌읍' } } as Parameters<typeof placeMetaLine>[0];

describe('placeMetaLine — 목록 메타 한 줄', () => {
  it("종류 · 읍면 · 확인 — '펜션 · 구좌읍 · 10월 확인'", () => {
    expect(placeMetaLine(place, { verified: '10월 확인' })).toBe('펜션 · 구좌읍 · 10월 확인');
  });

  it('거리는 읍면 뒤, 확인 앞', () => {
    expect(placeMetaLine(place, { distanceKm: 1.2, verified: '10월 확인' })).toMatch(/^펜션 · 구좌읍 · .+km · 10월 확인$/);
  });

  it('없는 칸은 가운뎃점째 빠진다', () => {
    expect(placeMetaLine(place, { verified: null })).toBe('펜션 · 구좌읍');
  });
});
