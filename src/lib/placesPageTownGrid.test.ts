import { describe, expect, it } from 'vitest';
import { ALL_TOWNS, PLACES, placesOfType } from './places';
import { PLACES_PAGE_TOWN_ORDER, placesPageTownDirections, placesPageTownGrid, placesPageTownInDirections } from './placesPageTownGrid';
import type { TPlaceType } from '../types';

const TYPES: TPlaceType[] = ['stay', 'restaurant', 'cafe'];

describe('placesPageTownGrid — 지역 칸(22 D-7)', () => {
  it('지도 차례가 데이터의 읍면을 다 덮는다 — 빠지면 그 읍면이 끝으로 밀려 차례가 깨진다', () => {
    for (const town of ALL_TOWNS) expect(PLACES_PAGE_TOWN_ORDER, town).toContain(town);
  });

  it('읍면마다 방향이 하나다 — 방향으로 칸을 거르는 근거(둘이면 한 읍면이 두 방향 칸에 다 선다)', () => {
    for (const town of ALL_TOWNS) expect(placesPageTownDirections(town).size, town).toBe(1);
  });

  it('칸은 이 종류에 곳이 있는 읍면을 지도 차례로 — 개수순이 아니라 종류를 바꿔도 같은 차례', () => {
    for (const type of TYPES) {
      const grid = placesPageTownGrid({ type, directions: [], town: null });
      expect(new Set(grid)).toEqual(new Set(placesOfType(type).map((place) => place.region.town)));
      const indexes = grid.map((town) => PLACES_PAGE_TOWN_ORDER.indexOf(town));
      expect(indexes).toEqual([...indexes].sort((a, b) => a - b));
    }
  });

  it("방향을 고르면 그 방향 읍면만 — '동쪽 + 애월' 을 만들 칸이 없다", () => {
    const east = placesPageTownGrid({ type: 'cafe', directions: ['east'], town: null });
    expect(east.length).toBeGreaterThan(0);
    expect(east).not.toContain('애월읍');
    for (const town of east) expect(placesPageTownDirections(town).has('east'), town).toBe(true);
    const both = placesPageTownGrid({ type: 'cafe', directions: ['east', 'west'], town: null });
    expect(both).toContain('애월읍');
    expect(both).toContain('구좌읍');
  });

  it('골라 둔 읍면은 늘 선다 — 이 종류에 없거나 방향 밖이어도 끌 칸이 있다(12 U1.6)', () => {
    const stayTowns = new Set(placesOfType('stay').map((place) => place.region.town));
    const missing = [...ALL_TOWNS].find((town) => !stayTowns.has(town))!;
    expect(missing).toBeDefined();
    expect(placesPageTownGrid({ type: 'stay', directions: [], town: missing })).toContain(missing);
    expect(placesPageTownGrid({ type: 'cafe', directions: ['east'], town: '애월읍' })).toContain('애월읍');
  });

  it('방향 안의 읍면인가 — 방향을 안 골랐으면 늘 그렇다', () => {
    expect(placesPageTownInDirections('애월읍', [])).toBe(true);
    expect(placesPageTownInDirections('애월읍', ['east'])).toBe(false);
    expect(placesPageTownInDirections('애월읍', ['east', 'west'])).toBe(true);
    // 데이터의 방향 그대로다.
    const sample = PLACES.find((place) => place.region.town === '구좌읍')!;
    expect(placesPageTownInDirections('구좌읍', [sample.region.direction])).toBe(true);
  });
});
