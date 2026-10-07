/**
 * 하루 동선을 네이버 지도 **경유지 길찾기** 주소로(docs/todo/16 T1.3). 순수.
 *
 * 순서는 우리가 정하고(`tripRoute.ts`) 운전 안내는 네이버가 한다(16 §1). 여기는 그 순서를 주소 몇 줄로 바꾸기만 한다.
 * 한 곳짜리(`naverDirectionsUrl`)와 같은 이유로 앱 스킴(`nmap://route/car`)이 아니라 **웹 주소**다 — 스킴은 앱 없는 기기에서
 * 아무 반응이 없고 iOS 는 열렸는지도 알 수 없어 타임아웃 폴백이 필요하다. 그래서 스킴의 `appname` 도 받지 않는다.
 *
 * ⚠️ 경유지 칸의 꼴(`WAYPOINT_SEPARATOR`)과 상한(`MAX_WAYPOINTS`)은 **폰에서 확인 전**이다(16 H.1). 테스트는 우리가 정한
 * 모양을 고정할 뿐 네이버가 그 모양을 받는다는 증거가 아니다 — 실측에서 다르면 이 두 상수만 고친다.
 */

import { naverDirectionsPoint } from './naverPlaceLink';
import type { TGeo } from '../types';

/** 한 주소에 싣는 경유지 수. 도착까지 한 주소에 새 지점 6곳(16 §3-4 "앞 6곳 / 다음 묶음"). */
export const MAX_WAYPOINTS = 5;
/** 경유 칸 안에서 지점을 가르는 글자 — 실측 전(위 ⚠️). */
export const WAYPOINT_SEPARATOR = ':';

export type TRouteStop = { name: string; geo?: TGeo };
type TGeoStop = { name: string; geo: TGeo };

/** 주소 한 줄의 재료. `start` 가 `null` 이면 출발을 비운다 — 네이버가 현재 위치로 채운다. */
export type TRouteLeg<T extends TRouteStop> = { start: TGeoStop | null; via: (T & TGeoStop)[]; goal: T & TGeoStop };

const hasGeo = <T extends TRouteStop>(stop: T): stop is T & TGeoStop => stop.geo !== undefined;

/**
 * 순서대로 놓인 곳들 → 주소 한 줄씩의 묶음. 좌표 없는 곳은 빼고 `missing` 으로 따로 돌려준다("지도에 없는 N곳") —
 * `suggestOrder` 가 그런 곳을 뒤로 보내도 사용자가 끌어 바꾼 순서에서는 중간에 낄 수 있어서 순서에 기대지 않는다.
 *
 * 두 번째 묶음부터는 **출발을 앞 묶음의 도착**으로 채운다 — 비워 두면 다음 링크를 미리 열었을 때 현재 위치에서
 * 출발한다. 출발은 경유 칸을 먹지 않으므로 묶음마다 새 지점이 그대로 6곳이다.
 * 첫 묶음의 출발은 부르는 쪽이 정한다(전날 숙소·공항이면 그 지점, 현재 위치면 `null`).
 */
export function splitStops<T extends TRouteStop>(
  stops: readonly T[],
  { start = null }: { start?: TGeoStop | null } = {},
): { legs: TRouteLeg<T>[]; missing: T[] } {
  const routable = stops.filter(hasGeo);
  const missing = stops.filter((stop) => !hasGeo(stop));
  const legs: TRouteLeg<T>[] = [];
  let from = start;
  for (let index = 0; index < routable.length; index += MAX_WAYPOINTS + 1) {
    const chunk = routable.slice(index, index + MAX_WAYPOINTS + 1);
    const goal = chunk[chunk.length - 1];
    legs.push({ start: from, via: chunk.slice(0, -1), goal });
    from = goal;
  }
  return { legs, missing };
}

/**
 * 묶음 하나 → 웹 길찾기 주소. 칸 순서는 `{출발}/{도착}/{경유}/car` 로 **경유가 도착 뒤**다(한 곳짜리 `naverDirectionsUrl` 과 같은 꼴).
 * 경유가 없고 출발을 비우면 그 주소와 같은 문자열이다 — 테스트가 둘을 묶는다.
 */
export function routeUrl<T extends TRouteStop>({ start, via, goal }: TRouteLeg<T>): string {
  const point = (stop: TGeoStop) => naverDirectionsPoint(stop.name, stop.geo);
  const from = start ? point(start) : '-';
  const waypoints = via.length ? via.map(point).join(WAYPOINT_SEPARATOR) : '-';
  return `https://map.naver.com/p/directions/${from}/${point(goal)}/${waypoints}/car`;
}
