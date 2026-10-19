import { PLACE_TYPES, TYPE_META } from './places';
import type { TPlaceType } from '../types';

/*
 * 지도 마커 묶기(14 W261006.11 뒤 절반) — 화면에서 서로 가까운 마커를 "N곳" 원 하나로 모은다.
 *
 * 입력은 **지금 줌의 화면 픽셀 좌표**다(SDK 의 `fromCoordToOffset`). 같은 줌이면 지도를 끌어도 점 사이 거리가 그대로라
 * 다시 셀 때는 줌이 바뀌었을 때뿐이다. 119곳이라 쌍을 다 보는 계산(O(n³))으로도 몇 ms 다 — 네이버의 MarkerClustering
 * 확장 파일(격자 셈)을 들이지 않고 직접 한다.
 */

/** 원 마커의 보이는 몸통 반지름(px) — 28px 캔버스의 반(`naverMapPin` 의 원 + 흰 테두리 + 그림자). */
export const MARKER_BODY_RADIUS = 14;

/** 손가락 히트 영역(px). 원 마커는 보이는 28px 밖에 투명 여백을 둘러 이만큼 받는다(`mapPageMarkerIcon`). */
export const MARKER_HIT = 44;

/**
 * 둘이 이보다 가까우면 묶는다 — **한쪽의 투명 여백(44/2)이 다른 쪽의 보이는 몸통에 닿는 거리**다.
 * 원끼리면 22 + 14 = 36, 묶음 원이 끼면 그 반지름만큼 더 벌린다. 이 간격을 지키면 위에 깔린 마커의 여백이
 * 아래 마커의 보이는 몸통을 덮지 않는다 — 히트 영역을 44 로 넓힐 수 있는 조건이 이것이다(ADR-008 v22 가 미룬 이유).
 */
export const MARKER_GAP = MARKER_HIT / 2 + MARKER_BODY_RADIUS;

/** 묶음 원의 지름 — 글자("12곳")가 들어갈 만큼, 세 자리면 한 단 더. */
export const mapPageMarkerClusterSize = (count: number): number => (count < 100 ? 36 : 44);

const bodyRadius = (count: number) => (count > 1 ? mapPageMarkerClusterSize(count) / 2 : MARKER_BODY_RADIUS);

/** 두 무리 사이에 있어야 할 최소 중심 간격. */
const gapBetween = (a: number, b: number) => MARKER_HIT / 2 + Math.max(bodyRadius(a), bodyRadius(b));

export type TMarkerPoint = { id: string; x: number; y: number };

export type TMarkerLayout = {
  /** 둘 이상 모인 무리. x·y 는 무게중심(입력과 같은 좌표계)이고 원은 거기 선다. */
  clusters: { ids: string[]; x: number; y: number }[];
  /**
   * 혼자 서는 마커. dx·dy 는 그리는 자리를 옮길 픽셀이다 — 최대 확대에서도 겹친 무리를 고리로 펼 때만 0 이 아니다.
   * 좌표 자체(마커의 position)는 그대로 두고 그림만 옮긴다.
   */
  singles: { id: string; dx: number; dy: number }[];
};

type TGroup = { members: TMarkerPoint[]; x: number; y: number };

const centroid = (members: TMarkerPoint[]) => ({
  x: members.reduce((sum, point) => sum + point.x, 0) / members.length,
  y: members.reduce((sum, point) => sum + point.y, 0) / members.length,
});

/**
 * 가장 가까운 두 무리를, 둘의 간격이 `gapBetween` 보다 좁은 동안 계속 합친다(중심 연결 응집).
 * 끝나면 **보이는 것끼리는 모두 간격 이상**이다 — 격자 셈은 칸 경계 양쪽의 두 점을 못 합쳐 이걸 보장하지 못한다.
 */
function agglomerate(points: readonly TMarkerPoint[]): TGroup[] {
  const groups: TGroup[] = points.map((point) => ({ members: [point], x: point.x, y: point.y }));
  for (;;) {
    let bestI = -1;
    let bestJ = -1;
    let bestDistance = Infinity;
    for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        const distance = Math.hypot(groups[i].x - groups[j].x, groups[i].y - groups[j].y);
        if (distance < gapBetween(groups[i].members.length, groups[j].members.length) && distance < bestDistance) {
          bestI = i;
          bestJ = j;
          bestDistance = distance;
        }
      }
    }
    if (bestI < 0) return groups;
    const members = [...groups[bestI].members, ...groups[bestJ].members];
    groups[bestI] = { members, ...centroid(members) };
    groups.splice(bestJ, 1);
  }
}

/**
 * 최대 확대에서도 겹친 무리(같은 건물 — 주소로 좌표를 받은 두 가게가 같은 점에 설 수 있다)는 더 확대할 수 없으니
 * 묶지 않고 **고리로 편다.** 무게중심 둘레에 원래 방향 순서대로, 이웃끼리 정확히 `MARKER_GAP` 만큼 떨어지게.
 */
function ring(members: TMarkerPoint[]): TMarkerLayout['singles'] {
  const center = centroid(members);
  const angleOf = (point: TMarkerPoint) => Math.atan2(point.y - center.y, point.x - center.x);
  const ordered = [...members].sort((a, b) => angleOf(a) - angleOf(b));
  const radius = MARKER_GAP / (2 * Math.sin(Math.PI / ordered.length));
  const start = angleOf(ordered[0]);
  return ordered.map((point, index) => {
    const angle = start + (2 * Math.PI * index) / ordered.length;
    return {
      id: point.id,
      dx: center.x + radius * Math.cos(angle) - point.x,
      dy: center.y + radius * Math.sin(angle) - point.y,
    };
  });
}

/**
 * 마커 배치 — 무엇을 묶고 무엇을 혼자 세우나.
 *
 * - `pinnedId`(고른 곳)는 묶음에서 **꺼낸다** — 시트가 그 곳을 말하는데 핀이 "N곳" 원 속에 숨으면 안 된다.
 *   묶음을 다 센 **뒤에** 빼므로 다른 무리의 모양은 그대로다(고를 때마다 이웃 묶음이 다시 짜이지 않는다).
 *   그래서 고른 핀은 이웃과 간격을 못 지킬 수 있다 — 맨 위 층(1000)이고 여백이 없어(`mapPageMarkerIcon`) 받아들인다.
 * - `spread`(최대 확대)면 묶지 않고 모인 무리를 고리로 편다. 고른 곳도 고리에 든다.
 */
export function mapPageMarkerLayout(
  points: readonly TMarkerPoint[],
  { pinnedId = null, spread = false }: { pinnedId?: string | null; spread?: boolean } = {},
): TMarkerLayout {
  const layout: TMarkerLayout = { clusters: [], singles: [] };
  for (const group of agglomerate(points)) {
    if (group.members.length === 1) {
      layout.singles.push({ id: group.members[0].id, dx: 0, dy: 0 });
      continue;
    }
    if (spread) {
      layout.singles.push(...ring(group.members));
      continue;
    }
    const rest = group.members.filter((point) => point.id !== pinnedId);
    if (rest.length < group.members.length) layout.singles.push({ id: pinnedId as string, dx: 0, dy: 0 });
    if (rest.length === 1) layout.singles.push({ id: rest[0].id, dx: 0, dy: 0 });
    else layout.clusters.push({ ids: rest.map((point) => point.id), ...centroid(rest) });
  }
  return layout;
}

/**
 * 지도 안 **Tab 순서** — 읽는 순서(위 → 아래, 한 줄 안에서는 왼쪽 → 오른쪽)로 id 를 늘어놓는다. 순수(14 W261006.11a).
 *
 * Tab 은 DOM 순서를 따르고 SDK 는 마커를 **만든 순서**로 꽂는다 — 혼자 선 원은 장소 목록 순, 묶음 원은 셀 때마다 새로 만들어 맨 뒤라
 * 키보드는 섬을 이리저리 뛰다가 묶음을 마지막에 몰아 들렀다. 화면은 이 순서로 요소를 다시 꽂는다(`mapPageCanvas`).
 * 줄은 위에서부터 그 줄 첫 점의 y 에서 `rowHeight`(히트 영역 높이) 안에 드는 것끼리다 — 고정 칸으로 자르면 칸 경계 양쪽의 2px 차이 두 점이 다른 줄이 된다.
 */
export function mapPageMarkerTabOrder(points: readonly TMarkerPoint[], rowHeight: number = MARKER_HIT): string[] {
  const byY = [...points].sort((a, b) => a.y - b.y || a.x - b.x);
  const order: string[] = [];
  for (let start = 0; start < byY.length; ) {
    const top = byY[start].y;
    let end = start;
    while (end < byY.length && byY[end].y - top < rowHeight) end++;
    order.push(...byY.slice(start, end).sort((a, b) => a.x - b.x).map((point) => point.id));
    start = end;
  }
  return order;
}

/**
 * 묶음을 누르면 갈 줌. 둘 중 **낮은 쪽**:
 *
 * - `fitZoom` — 무리가 다 들어오는 줌(SDK 의 `getFitZoomAndCenter`, 칩 줄 여백 포함).
 * - 무리가 다 갈라지는 줌 — 가장 가까운 두 곳이 `MARKER_GAP` 이상 벌어지는 첫 단계(한 단계마다 거리가 두 배).
 *   두 곳이 18m 떨어진 묶음에 fit 만 쓰면 21(골목 하나)까지 날아간다 — 갈라지는 18 에서 멈춘다.
 *
 * 적어도 한 단계는 들어간다(눌렀는데 그대로면 고장으로 보인다), 상한은 `maxZoom`. 같은 좌표 둘(거리 0)은 갈라지는 줌이
 * 없으니 fit 을 따른다 — 거기서 최대 확대면 배치가 고리로 편다.
 */
export function mapPageMarkerClusterZoom({
  points,
  zoom,
  maxZoom,
  fitZoom,
}: {
  points: readonly TMarkerPoint[];
  zoom: number;
  maxZoom: number;
  fitZoom: number;
}): number {
  let nearest = Infinity;
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      nearest = Math.min(nearest, Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y));
    }
  }
  const splitZoom = nearest > 0 ? zoom + Math.ceil(Math.log2(MARKER_GAP / nearest)) : Infinity;
  const fit = Number.isFinite(fitZoom) ? fitZoom : maxZoom;
  return Math.min(maxZoom, Math.max(Math.floor(zoom) + 1, Math.min(fit, splitZoom)));
}

export type TClusterMember = { type: TPlaceType; saved: boolean; hard: boolean };

export type TClusterSummary = {
  count: number;
  /** 종류별 수 — `PLACE_TYPES` 순서, 0 인 종류는 뺀다. */
  types: { type: TPlaceType; count: number }[];
  saved: number;
  /** 모두 '어려움' 이면 원도 흐린다 — 하나라도 갈 수 있으면 흐리지 않는다(흐림은 "이 안엔 갈 곳이 없다" 는 뜻이 된다). */
  allHard: boolean;
};

export function mapPageMarkerClusterSummary(members: readonly TClusterMember[]): TClusterSummary {
  return {
    count: members.length,
    types: PLACE_TYPES.map((type) => ({ type, count: members.filter((member) => member.type === type).length })).filter(
      (entry) => entry.count > 0,
    ),
    saved: members.filter((member) => member.saved).length,
    allHard: members.length > 0 && members.every((member) => member.hard),
  };
}

/**
 * 묶음 원의 접근성 이름 — "12곳 묶음: 숙소 5곳, 식당 4곳, 카페 3곳. 저장한 곳 1곳. 눌러서 확대".
 * 원은 종류 비율을 테두리 색으로만 말하므로(`mapPageMarkerIcon`) 이름이 같은 말을 글로 한다.
 */
export function mapPageMarkerClusterLabel(summary: TClusterSummary): string {
  const parts = [
    `${summary.count}곳 묶음: ${summary.types.map(({ type, count }) => `${TYPE_META[type].label} ${count}곳`).join(', ')}`,
    summary.saved > 0 && `저장한 곳 ${summary.saved}곳`,
    summary.allHard && '모두 어려운 곳',
    '눌러서 확대',
  ];
  return parts.filter(Boolean).join('. ');
}
