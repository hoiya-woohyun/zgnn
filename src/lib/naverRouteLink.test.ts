import { describe, expect, it } from 'vitest';
import { naverDirectionsPoint, naverDirectionsUrl } from './naverPlaceLink';
import { MAX_WAYPOINTS, routeUrl, splitStops, WAYPOINT_SEPARATOR, type TRouteStop } from './naverRouteLink';

const stop = (n: number, geo = true): TRouteStop & { id: string } => ({
  id: `p${n}`,
  name: `곳${n}`,
  ...(geo ? { geo: { lat: 33.3 + n / 100, lng: 126.3 + n / 100 } } : {}),
});
const stops = (count: number) => Array.from({ length: count }, (_, index) => stop(index + 1));
const ids = (list: { id?: string }[]) => list.map((item) => item.id);

describe('splitStops', () => {
  it('빈 입력이면 묶음도 빠진 곳도 없다 — 깨진 주소를 만들지 않는다', () => {
    expect(splitStops([])).toEqual({ legs: [], missing: [] });
  });

  it('좌표가 전부 없으면 묶음은 없고 전부 빠진 곳이다', () => {
    const { legs, missing } = splitStops([stop(1, false), stop(2, false)]);
    expect(legs).toEqual([]);
    expect(ids(missing)).toEqual(['p1', 'p2']);
  });

  it('한 곳이면 경유 없이 도착 하나', () => {
    const [leg] = splitStops(stops(1)).legs;
    expect(leg.via).toEqual([]);
    expect(leg.goal.id).toBe('p1');
    expect(leg.start).toBeNull();
  });

  it(`${MAX_WAYPOINTS + 1}곳까지는 한 묶음, 하나 넘으면 두 묶음 — 다음 묶음은 앞 도착에서 출발한다`, () => {
    expect(splitStops(stops(MAX_WAYPOINTS + 1)).legs).toHaveLength(1);
    const { legs } = splitStops(stops(MAX_WAYPOINTS + 2));
    expect(legs).toHaveLength(2);
    expect(ids(legs[0].via)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);
    expect(legs[0].goal.id).toBe('p6');
    expect(legs[1].start).toBe(legs[0].goal);
    expect(legs[1].via).toEqual([]);
    expect(legs[1].goal.id).toBe('p7');
  });

  it('12곳은 두 묶음, 13곳은 세 묶음', () => {
    expect(splitStops(stops(12)).legs).toHaveLength(2);
    expect(splitStops(stops(13)).legs).toHaveLength(3);
  });

  it('좌표 없는 곳은 순서 가운데 있어도 빼고 따로 돌려준다(끌어 바꾼 순서)', () => {
    const { legs, missing } = splitStops([stop(1), stop(2, false), stop(3)]);
    expect(ids(legs[0].via)).toEqual(['p1']);
    expect(legs[0].goal.id).toBe('p3');
    expect(ids(missing)).toEqual(['p2']);
  });

  it('첫 묶음의 출발은 부르는 쪽이 준다(전날 숙소·공항)', () => {
    const airport = { name: '제주국제공항', geo: { lat: 33.5071, lng: 126.4916 } };
    expect(splitStops(stops(2), { start: airport }).legs[0].start).toBe(airport);
  });
});

describe('routeUrl', () => {
  it('경유가 없고 출발을 비우면 한 곳짜리 길찾기와 같은 문자열이다', () => {
    const place = { name: ' 솔숲펜션 ', geo: { lat: 33.5111848, lng: 126.8488419 } };
    const [leg] = splitStops([place]).legs;
    expect(routeUrl(leg)).toBe(naverDirectionsUrl(place));
  });

  it('{출발}/{도착}/{경유}/car — 경유는 도착 뒤에, 구분자로 이어서', () => {
    const [a, b, c] = stops(3);
    const start = { name: '숙소', geo: { lat: 33.4, lng: 126.5 } };
    const [leg] = splitStops([a, b, c], { start }).legs;
    const point = (s: { name: string; geo?: { lat: number; lng: number } }) => naverDirectionsPoint(s.name, s.geo!);
    expect(routeUrl(leg)).toBe(
      `https://map.naver.com/p/directions/${point(start)}/${point(c)}/${point(a)}${WAYPOINT_SEPARATOR}${point(b)}/car`,
    );
  });

  it('이름의 / · , 는 칸 구분자라 인코딩한다', () => {
    const [leg] = splitStops([{ name: ' 카페/바, 제주 ', geo: { lat: 33.1, lng: 126.2 } }]).legs;
    const url = routeUrl(leg);
    expect(url).toContain(encodeURIComponent('카페/바, 제주'));
    expect(url.split('/')).toHaveLength('https://map.naver.com/p/directions/-/x/-/car'.split('/').length);
  });
});
