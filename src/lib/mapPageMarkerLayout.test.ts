import { describe, expect, it } from 'vitest';
import {
  MARKER_BODY_RADIUS,
  MARKER_GAP,
  MARKER_HIT,
  mapPageMarkerClusterLabel,
  mapPageMarkerClusterSize,
  mapPageMarkerClusterSummary,
  mapPageMarkerClusterZoom,
  mapPageMarkerLayout,
  mapPageMarkerTabOrder,
  type TMarkerLayout,
  type TMarkerPoint,
} from './mapPageMarkerLayout';
import { PLACES } from './places';

/** 256 타일 메르카토르 — SDK 의 `fromCoordToOffset` 과 같은 값이다(2026-10-16 headless 실측, 0.1° 경도 = 줌 10 에서 72.8px). */
const worldPoint = (lat: number, lng: number, zoom: number) => {
  const scale = 256 * 2 ** zoom;
  const sin = Math.sin((lat * Math.PI) / 180);
  return { x: (scale * (lng + 180)) / 360, y: scale * (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) };
};

const placePoints = (zoom: number): TMarkerPoint[] =>
  PLACES.flatMap((place) => (place.geo ? [{ id: place.id, ...worldPoint(place.geo.lat, place.geo.lng, zoom) }] : []));

/** 같은 시드면 같은 점들 — 실패를 다시 볼 수 있게. */
function randomPoints(seed: number, count: number, spread: number): TMarkerPoint[] {
  let state = seed;
  const next = () => {
    state = (state * 1664525 + 1013904223) % 2 ** 32;
    return state / 2 ** 32;
  };
  return Array.from({ length: count }, (_, index) => ({ id: `p${index}`, x: next() * spread, y: next() * spread }));
}

/** 화면에 서는 것들 — 묶음 원(무게중심)과 혼자 선 마커(자기 자리 + 옮김). 반지름은 보이는 몸통. */
function drawn(points: readonly TMarkerPoint[], layout: TMarkerLayout) {
  const byId = new Map(points.map((point) => [point.id, point]));
  return [
    ...layout.clusters.map((cluster) => ({ x: cluster.x, y: cluster.y, radius: mapPageMarkerClusterSize(cluster.ids.length) / 2 })),
    ...layout.singles.map((single) => {
      const point = byId.get(single.id) as TMarkerPoint;
      return { x: point.x + single.dx, y: point.y + single.dy, radius: MARKER_BODY_RADIUS };
    }),
  ];
}

/** 한쪽의 투명 여백이 다른 쪽의 보이는 몸통을 덮는 쌍의 수 — 0 이어야 44px 히트 영역이 남의 탭을 가로채지 않는다. */
function coveringPairs(items: ReturnType<typeof drawn>) {
  let count = 0;
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const distance = Math.hypot(items[i].x - items[j].x, items[i].y - items[j].y);
      if (distance < MARKER_HIT / 2 + Math.max(items[i].radius, items[j].radius) - 1e-9) count++;
    }
  }
  return count;
}

const idsOf = (layout: TMarkerLayout) => [...layout.clusters.flatMap((cluster) => cluster.ids), ...layout.singles.map((single) => single.id)];

describe('mapPageMarkerLayout — 묶은 뒤엔 여백이 이웃의 몸통을 덮지 않는다(14 W261006.11)', () => {
  it('간격 36 은 44 히트의 반 + 28 원의 반이다', () => {
    expect(MARKER_GAP).toBe(36);
  });

  it('무작위 점 40벌 — 모든 id 가 한 번씩, 그려진 것끼리 덮는 쌍 0', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const points = randomPoints(seed, 60, 400);
      const layout = mapPageMarkerLayout(points);
      expect(idsOf(layout).sort()).toEqual(points.map((point) => point.id).sort());
      expect(coveringPairs(drawn(points, layout))).toBe(0);
      for (const single of layout.singles) expect([single.dx, single.dy]).toEqual([0, 0]);
    }
  });

  it.each([10, 11, 12, 14])('실제 장소 줌 %i — 묶기 전엔 겹치는 쌍이 있고, 묶은 뒤엔 0', (zoom) => {
    const points = placePoints(zoom);
    const before = coveringPairs(points.map((point) => ({ ...point, radius: MARKER_BODY_RADIUS })));
    expect(before).toBeGreaterThan(0);
    const layout = mapPageMarkerLayout(points);
    expect(coveringPairs(drawn(points, layout))).toBe(0);
    expect(layout.clusters.length).toBeGreaterThan(0);
  });

  it('실제 장소는 줌 18 이면 모두 갈라진다(가장 가까운 두 곳 18m) — 최대 21 까지 세 단계가 남는다', () => {
    expect(mapPageMarkerLayout(placePoints(18)).clusters).toEqual([]);
    expect(mapPageMarkerLayout(placePoints(17)).clusters.length).toBeGreaterThan(0);
  });

  it('고른 곳은 묶음에서 꺼내고, 다른 무리는 그대로 둔다', () => {
    const points = placePoints(10);
    const plain = mapPageMarkerLayout(points);
    const host = plain.clusters.find((cluster) => cluster.ids.length >= 3) as TMarkerLayout['clusters'][number];
    const pinnedId = host.ids[0];
    const pinned = mapPageMarkerLayout(points, { pinnedId });

    expect(pinned.singles).toContainEqual({ id: pinnedId, dx: 0, dy: 0 });
    expect(pinned.clusters.flatMap((cluster) => cluster.ids)).not.toContain(pinnedId);
    const others = (layout: TMarkerLayout) => layout.clusters.filter((cluster) => !host.ids.includes(cluster.ids[0]));
    expect(others(pinned)).toEqual(others(plain));
    expect(pinned.clusters.find((cluster) => cluster.ids.includes(host.ids[1]))?.ids).toEqual(host.ids.slice(1));
  });

  it('고른 곳을 빼 둘이던 묶음이 하나가 되면 그 하나도 혼자 선다', () => {
    const points = [
      { id: 'a', x: 0, y: 0 },
      { id: 'b', x: 10, y: 0 },
    ];
    expect(mapPageMarkerLayout(points, { pinnedId: 'a' })).toEqual({
      clusters: [],
      singles: [
        { id: 'a', dx: 0, dy: 0 },
        { id: 'b', dx: 0, dy: 0 },
      ],
    });
  });

  it('최대 확대(spread)면 같은 점의 셋을 고리로 편다 — 이웃끼리 정확히 간격만큼', () => {
    const points = [
      { id: 'a', x: 100, y: 100 },
      { id: 'b', x: 100, y: 100 },
      { id: 'c', x: 100, y: 100 },
      { id: 'far', x: 400, y: 100 },
    ];
    const layout = mapPageMarkerLayout(points, { spread: true });
    expect(layout.clusters).toEqual([]);
    expect(idsOf(layout).sort()).toEqual(['a', 'b', 'c', 'far']);
    const placed = drawn(points, layout).filter((item) => item.x < 300);
    expect(placed).toHaveLength(3);
    for (let i = 0; i < 3; i++) {
      const next = placed[(i + 1) % 3];
      expect(Math.hypot(placed[i].x - next.x, placed[i].y - next.y)).toBeCloseTo(MARKER_GAP, 6);
    }
    expect(layout.singles.find((single) => single.id === 'far')).toEqual({ id: 'far', dx: 0, dy: 0 });
  });

  it('고리는 원래 방향 순서를 지킨다 — 왼쪽에 있던 곳이 왼쪽에 선다', () => {
    const points = [
      { id: 'left', x: 95, y: 100 },
      { id: 'right', x: 105, y: 100 },
    ];
    const layout = mapPageMarkerLayout(points, { spread: true });
    const at = (id: string) => {
      const single = layout.singles.find((entry) => entry.id === id) as TMarkerLayout['singles'][number];
      const point = points.find((entry) => entry.id === id) as TMarkerPoint;
      return point.x + single.dx;
    };
    expect(at('left')).toBeCloseTo(100 - MARKER_GAP / 2, 6);
    expect(at('right')).toBeCloseTo(100 + MARKER_GAP / 2, 6);
  });
});

describe('mapPageMarkerTabOrder — 지도 안 Tab 은 읽는 순서로(14 W261006.11a)', () => {
  const p = (id: string, x: number, y: number): TMarkerPoint => ({ id, x, y });

  it('위 → 아래, 한 줄 안에서는 왼쪽 → 오른쪽 — 넣은 순서(만든 순서)와 무관하다', () => {
    const points = [p('남서', 10, 300), p('북동', 400, 20), p('묶음', 200, 160), p('북서', 15, 30)];
    expect(mapPageMarkerTabOrder(points)).toEqual(['북서', '북동', '묶음', '남서']);
  });

  it('줄은 그 줄 첫 점에서 히트 높이(44) 안 — 칸 경계 양쪽의 2px 차이는 한 줄이다', () => {
    // 고정 칸(44 의 배수)이면 43 과 45 가 다른 칸이라 오른쪽(43)이 먼저 왔을 것이다.
    expect(mapPageMarkerTabOrder([p('오른쪽', 300, 43), p('왼쪽', 20, 45)])).toEqual(['왼쪽', '오른쪽']);
    // 첫 점에서 44 이상 내려가면 다음 줄이다 — 줄이 끝없이 이어 붙지 않는다.
    expect(mapPageMarkerTabOrder([p('a', 300, 0), p('b', 200, 30), p('c', 10, 60)])).toEqual(['b', 'a', 'c']);
  });

  it('빈 목록 · 한 점 · 같은 자리', () => {
    expect(mapPageMarkerTabOrder([])).toEqual([]);
    expect(mapPageMarkerTabOrder([p('a', 5, 5)])).toEqual(['a']);
    expect(mapPageMarkerTabOrder([p('b', 5, 5), p('a', 5, 5)])).toHaveLength(2);
  });
});

describe('mapPageMarkerClusterZoom — 묶음을 누르면 갈 줌', () => {
  const pair = (distance: number) => [
    { id: 'a', x: 0, y: 0 },
    { id: 'b', x: distance, y: 0 },
  ];

  it('갈라지는 줌이 fit 보다 낮으면 거기서 멈춘다 — 18m 두 곳이 골목까지 날아가지 않게', () => {
    // 줌 10 에서 0.15px(18m 쯤) → 2^8 배면 38.4px 로 36 을 넘는다
    expect(mapPageMarkerClusterZoom({ points: pair(0.15), zoom: 10, maxZoom: 21, fitZoom: 21 })).toBe(18);
  });

  it('fit 이 낮으면 fit — 큰 무리는 다 들어오는 데까지만', () => {
    expect(mapPageMarkerClusterZoom({ points: pair(0.15), zoom: 10, maxZoom: 21, fitZoom: 12 })).toBe(12);
  });

  it('적어도 한 단계는 들어간다', () => {
    expect(mapPageMarkerClusterZoom({ points: pair(38), zoom: 10, maxZoom: 21, fitZoom: 10 })).toBe(11);
    expect(mapPageMarkerClusterZoom({ points: pair(20), zoom: 10.4, maxZoom: 21, fitZoom: 9 })).toBe(11);
  });

  it('상한은 maxZoom', () => {
    expect(mapPageMarkerClusterZoom({ points: pair(0.001), zoom: 20, maxZoom: 21, fitZoom: 25 })).toBe(21);
    expect(mapPageMarkerClusterZoom({ points: pair(10), zoom: 21, maxZoom: 21, fitZoom: 21 })).toBe(21);
  });

  it('같은 좌표(거리 0)는 갈라지는 줌이 없어 fit 을, fit 이 숫자가 아니면 maxZoom 을 따른다', () => {
    expect(mapPageMarkerClusterZoom({ points: pair(0), zoom: 12, maxZoom: 21, fitZoom: 19 })).toBe(19);
    expect(mapPageMarkerClusterZoom({ points: pair(0), zoom: 12, maxZoom: 21, fitZoom: Number.NaN })).toBe(21);
    expect(mapPageMarkerClusterZoom({ points: pair(0), zoom: 12, maxZoom: 21, fitZoom: Infinity })).toBe(21);
  });
});

describe('mapPageMarkerClusterSummary · Label — 원이 색으로 말하는 것을 이름이 글로', () => {
  it('종류는 숙소·식당·카페 순, 없는 종류는 뺀다', () => {
    const summary = mapPageMarkerClusterSummary([
      { type: 'cafe', saved: false, hard: false },
      { type: 'stay', saved: true, hard: true },
      { type: 'cafe', saved: false, hard: true },
    ]);
    expect(summary).toEqual({
      count: 3,
      types: [
        { type: 'stay', count: 1 },
        { type: 'cafe', count: 2 },
      ],
      saved: 1,
      allHard: false,
    });
    expect(mapPageMarkerClusterLabel(summary)).toBe('3곳 묶음: 숙소 1곳, 카페 2곳. 저장한 곳 1곳. 눌러서 확대');
  });

  it('모두 어려우면 흐림을 이름도 말한다', () => {
    const summary = mapPageMarkerClusterSummary([
      { type: 'restaurant', saved: false, hard: true },
      { type: 'restaurant', saved: false, hard: true },
    ]);
    expect(summary.allHard).toBe(true);
    expect(mapPageMarkerClusterLabel(summary)).toBe('2곳 묶음: 식당 2곳. 모두 어려운 곳. 눌러서 확대');
  });
});
