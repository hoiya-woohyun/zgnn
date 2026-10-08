import { describe, expect, it } from 'vitest';
import { distanceLabel, distancesFrom, pickNearby, sortByDistance } from './distanceSort';

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

describe('pickNearby', () => {
  type TItem = { id: string; km: number; hard?: boolean };
  const pick = (items: TItem[], withHard = false) => {
    const { shown, hiddenHard } = pickNearby(items, { isHard: (item) => item.hard === true, withHard });
    return { ids: shown.map((item) => item.id), hiddenHard };
  };

  it('거리 하나로 — 같은 읍면이라도 먼 곳이 앞서지 않는다(달중이네 2.2 → 1.9 를 고친다)', () => {
    expect(pick([{ id: 'same', km: 2.2 }, { id: 'other', km: 1.9 }, { id: 'far', km: 6.1 }]).ids).toEqual(['other', 'same', 'far']);
  });

  it('어려움은 뒤로 보내지 않고 빼고 센다 — 숫자가 거꾸로 서지 않는다(핀코 5.4 → 2.5 → 3.4 를 고친다)', () => {
    expect(pick([
      { id: 'h1', km: 2.5, hard: true },
      { id: 'h2', km: 3.4, hard: true },
      { id: 'a', km: 1.8 },
      { id: 'b', km: 5.1 },
      { id: 'c', km: 5.4 },
      { id: 'h3', km: 9, hard: true },
    ])).toEqual({ ids: ['a', 'b', 'c'], hiddenHard: 2 });
  });

  it('카드가 모자라면 어려움 전부를 센다 — 다 어려우면 카드 0장', () => {
    expect(pick([{ id: 'h1', km: 1, hard: true }, { id: 'a', km: 2 }, { id: 'h2', km: 9, hard: true }])).toEqual({ ids: ['a'], hiddenHard: 2 });
    expect(pick([{ id: 'h1', km: 1, hard: true }])).toEqual({ ids: [], hiddenHard: 1 });
  });

  it('함께 보기면 거르지 않고 거리순', () => {
    expect(pick([{ id: 'a', km: 3 }, { id: 'h', km: 1, hard: true }], true)).toEqual({ ids: ['h', 'a'], hiddenHard: 0 });
  });
});
