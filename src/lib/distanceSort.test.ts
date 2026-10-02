import { describe, expect, it } from 'vitest';
import { distanceLabel, distancesFrom, sortByDistance } from './distanceSort';

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
