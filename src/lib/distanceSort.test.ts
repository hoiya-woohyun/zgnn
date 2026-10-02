import { describe, expect, it } from 'vitest';
import { distanceLabel, distancesFrom, sortByDistance, sortNearby } from './distanceSort';

const origin = { lat: 33.5, lng: 126.5 };
const at = (id: string, lat?: number, lng?: number) => ({ id, geo: lat === undefined ? undefined : { lat, lng: lng ?? 126.5 } });

describe('sortByDistance', () => {
  it('가까운 순, 좌표 없는 곳은 원래 순서대로 뒤로', () => {
    const list = [at('none1'), at('far', 33.3), at('near', 33.49), at('none2'), at('mid', 33.45)];
    expect(sortByDistance(list, origin).map((item) => item.id)).toEqual(['near', 'mid', 'far', 'none1', 'none2']);
  });
});

describe('distancesFrom', () => {
  it('좌표가 있는 곳만', () => {
    expect([...distancesFrom([at('a', 33.5), at('b')], origin).keys()]).toEqual(['a']);
  });
});

describe('distanceLabel', () => {
  it('단위를 거리에 맞춘다', () => {
    expect(distanceLabel(0.01)).toBe('50m');
    expect(distanceLabel(0.37)).toBe('350m');
    expect(distanceLabel(1.234)).toBe('1.2km');
    expect(distanceLabel(23.6)).toBe('24km');
  });
});

describe('sortNearby', () => {
  type TItem = { id: string; km: number; town: string; hard?: boolean };
  const order = (items: TItem[], town = '애월읍') =>
    sortNearby(items, { isSameTown: (item) => item.town === town, isHard: (item) => item.hard === true }).map((item) => item.id);

  it('같은 읍면이라도 멀면 가까운 곳이 먼저 — 살롱드라방의 12.9 → 16.9 → 1.9 를 고친다', () => {
    expect(order([
      { id: 'a', km: 12.9, town: '애월읍' },
      { id: 'b', km: 16.9, town: '애월읍' },
      { id: 'c', km: 1.9, town: '한림읍' },
    ])).toEqual(['c', 'a', 'b']);
  });

  it('거리 차가 1km 안이면 같은 읍면이 먼저', () => {
    expect(order([
      { id: 'other', km: 1.8, town: '한림읍' },
      { id: 'same', km: 2.5, town: '애월읍' },
    ])).toEqual(['same', 'other']);
  });

  it('어려움은 가까워도 뒤로', () => {
    expect(order([
      { id: 'hard', km: 0.5, town: '애월읍', hard: true },
      { id: 'ok', km: 5, town: '한림읍' },
    ])).toEqual(['ok', 'hard']);
  });
});
