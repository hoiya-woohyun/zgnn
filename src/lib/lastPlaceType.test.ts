import { describe, expect, it } from 'vitest';
import { placesTabHref } from './lastPlaceType';

describe('placesTabHref', () => {
  it('목록에 서 있으면 그 주소 그대로 — 같은 탭은 맨 위로', () => {
    expect(placesTabHref('/places/cafe', 'stay')).toBe('/places/cafe');
    expect(placesTabHref('/places/restaurant/', null)).toBe('/places/restaurant');
  });

  it('다른 화면이면 보던 종류로, 없으면 숙소', () => {
    expect(placesTabHref('/map', 'cafe')).toBe('/places/cafe');
    expect(placesTabHref('/place/abc', 'restaurant')).toBe('/places/restaurant');
    expect(placesTabHref('/', null)).toBe('/places/stay');
  });
});
