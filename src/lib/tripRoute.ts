/**
 * 하루 동선의 순서 제안(docs/todo/16 T1.2). 순수.
 *
 * 운전 경로·소요 시간은 네이버 지도 앱에 넘기므로(16 §1) 여기서는 **직선거리로 순서만** 정한다 — 제주는 섬 하나라
 * 직선거리가 차로 거리의 어림으로 충분하다. 방법은 가까운 순 그리디(지금 자리에서 가장 가까운 곳 → 거기서 다시 가장 가까운 곳).
 * 최적 경로(TSP)는 풀지 않는다 — 하루 5~6곳이면 그리디와 차이가 작고, 사용자가 끌어서 바꾸는 것이 정본이다(16 P2).
 *
 * 숙소는 그날의 **마지막** 자리다(16 §3-1). 시작점은 셋 — 현재 위치(누를 때 한 번, 저장하지 않는다 · ADR-012) · 전날 숙소 · 공항.
 */

import { distanceKm } from './places';
import type { TGeo, TPlaceType } from '../types';

/** 제주국제공항. `landmarks.ts` 의 「제주공항」 중심과 같은 값이다. */
export const JEJU_AIRPORT: TGeo = { lat: 33.5071, lng: 126.4916 };

/** 하루의 시작점. `here` 의 좌표는 정렬에 쓰고 버린다 — 일정에 남기지 않는다(16 P3). */
export type TRouteStart = { kind: 'airport' } | { kind: 'here'; geo: TGeo } | { kind: 'prevStay'; geo?: TGeo };

/** 시작점 → 좌표. 전날 숙소에 좌표가 없으면 `null`(순서는 첫 장소부터 이어 간다). */
export function routeStartGeo(start: TRouteStart): TGeo | null {
  if (start.kind === 'airport') return JEJU_AIRPORT;
  return start.geo ?? null;
}

type TRoutable = { id: string; type: TPlaceType; geo?: TGeo };

/**
 * 순서 제안. 입력 순서는 동점일 때만 쓴다 — 같은 입력이면 늘 같은 답(결정적).
 *  - 좌표가 있는 곳은 시작점에서부터 가까운 순 그리디로 잇는다. 시작점이 `null` 이면 입력의 첫 좌표 있는 곳에서 시작한다.
 *  - 좌표가 없는 곳은 그 뒤에 원래 순서대로 — 어디에 끼울지 모르므로 맨 뒤(`sortByDistance` 와 같은 규칙). 길찾기 링크에서는 빠진다(T1.3).
 *  - `stayLast` 면 숙소는 맨 끝에 선다. 숙소가 둘 이상이면(드물다) 앞 체인의 끝에서부터 같은 그리디로 잇는다.
 */
export function suggestOrder<T extends TRoutable>(
  places: readonly T[],
  start: TGeo | null,
  { stayLast = true }: { stayLast?: boolean } = {},
): T[] {
  const isTail = (place: T) => stayLast && place.type === 'stay';
  const head = places.filter((place) => !isTail(place));
  const tail = places.filter(isTail);

  const headChain = greedyChain(head, start);
  const lastGeo = [...headChain].reverse().find((place) => place.geo)?.geo ?? start;
  return [...headChain, ...greedyChain(tail, lastGeo)];
}

/** 좌표 있는 곳을 그리디로 잇고, 좌표 없는 곳을 원래 순서대로 뒤에 붙인다. */
function greedyChain<T extends TRoutable>(places: readonly T[], start: TGeo | null): T[] {
  const left = places.filter((place) => place.geo);
  const unplaced = places.filter((place) => !place.geo);
  const chain: T[] = [];
  let at = start;
  while (left.length > 0) {
    let pick = 0;
    if (at) {
      let best = Number.POSITIVE_INFINITY;
      left.forEach((place, index) => {
        const km = distanceKm(at!, place.geo!);
        if (km < best) [best, pick] = [km, index];
      });
    }
    const [next] = left.splice(pick, 1);
    chain.push(next);
    at = next.geo!;
  }
  return [...chain, ...unplaced];
}
