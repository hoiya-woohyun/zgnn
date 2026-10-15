import { describe, expect, it } from 'vitest';
import { distanceLabel, distancesFrom, nearPlaceOf, pickNearby, placesNearHref, sortByDistance } from './distanceSort';
import { PLACES, sameIsland } from './places';

const origin = { lat: 33.5, lng: 126.5 };
const at = (id: string, lat?: number, lng?: number) => ({ id, geo: lat === undefined ? undefined : { lat, lng: lng ?? 126.5 } });

describe('sortByDistance', () => {
  it('가까운 순, 좌표 없는 곳은 원래 순서대로 뒤로', () => {
    const list = [at('none1'), at('far', 33.3), at('near', 33.49), at('none2'), at('mid', 33.45)];
    expect(sortByDistance(list, origin).map((item) => item.id)).toEqual(['near', 'mid', 'far', 'none1', 'none2']);
  });

  it('within 에 안 드는 곳(다른 섬)은 좌표 없는 곳처럼 뒤로 — 직선으로 가까워도', () => {
    const list = [at('far', 33.3), at('island', 33.49), at('none'), at('mid', 33.45)];
    expect(sortByDistance(list, origin, (item) => item.id !== 'island').map((item) => item.id)).toEqual(['mid', 'far', 'island', 'none']);
  });
});

describe('distancesFrom', () => {
  it('좌표가 있는 곳만', () => {
    expect([...distancesFrom([at('a', 33.5), at('b')], origin).keys()]).toEqual(['a']);
  });

  it('within 에 안 드는 곳도 빠진다 — 카드에 km 가 안 붙는다', () => {
    expect([...distancesFrom([at('a', 33.5), at('island', 33.49)], origin, (item) => item.id !== 'island').keys()]).toEqual(['a']);
  });
});

describe('기준 장소 주소(?near=)', () => {
  const withGeo = PLACES.find((place) => place.geo)!;
  const noGeo = PLACES.find((place) => !place.geo);

  it('링크가 만든 주소를 그대로 읽는다', () => {
    const href = placesNearHref('restaurant', withGeo.id);
    expect(href.startsWith('/places/restaurant/?')).toBe(true);
    expect(nearPlaceOf(href.slice(href.indexOf('?')))?.id).toBe(withGeo.id);
  });

  it('모르는 id·좌표 없는 곳·쿼리 없음은 null — 평소 목록', () => {
    expect(nearPlaceOf('?near=no-such-place')).toBeNull();
    expect(nearPlaceOf('')).toBeNull();
    if (noGeo) expect(nearPlaceOf(`?near=${noGeo.id}`)).toBeNull();
  });
});

describe('sameIsland', () => {
  it('우도 곳은 본섬 곳과 다른 섬 — 근처 장소·장소 기준 가까운 순이 섞지 않는다', () => {
    const udo = PLACES.find((place) => place.region.town === '우도면');
    const main = PLACES.find((place) => place.region.town !== '우도면' && place.region.town !== '추자면')!;
    expect(sameIsland(main, main)).toBe(true);
    if (udo) expect(sameIsland(main, udo)).toBe(false);
  });
});

describe('distanceLabel', () => {
  it('단위를 거리에 맞춘다', () => {
    expect(distanceLabel(0.01)).toBe('50m');
    expect(distanceLabel(0.37)).toBe('350m');
    expect(distanceLabel(1.234)).toBe('1.2km');
    expect(distanceLabel(23.6)).toBe('24km');
  });

  it('상세 근처 줄과 그 줄이 연 목록이 같은 숫자를 말한다 — 장소 기준도 반올림한다(14 W261013.14r)', () => {
    expect(distanceLabel(0.243)).toBe('250m');
    expect(distanceLabel(12.34)).toBe('12km');
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
