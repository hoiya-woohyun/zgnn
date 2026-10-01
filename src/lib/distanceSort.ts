/**
 * 목록 "가까운 순"(docs/todo/10 F7 — 뚜벅이 민지 "지금 여기서 가까운 곳"). 순수.
 *
 * 지도에는 내 위치가 있는데 목록 정렬에는 없어, 지도로 넘어가 마커를 하나씩 눌러야 했다.
 * 위치는 누를 때 한 번 받고(`myLocation.locateMe`) **저장하지도 보내지도 않는다** — 정렬에 쓰고 사라진다(ADR-012 대상 아님).
 */

import { distanceKm } from './places';

type TGeoLike = { geo?: { lat: number; lng: number } };

/** 가까운 순. 좌표가 없는 곳은 **뒤로**(가격 정렬이 요금 모르는 곳을 뒤로 보내는 것과 같은 규칙), 그 안에서는 원래 순서. */
export function sortByDistance<T extends TGeoLike>(list: readonly T[], origin: { lat: number; lng: number }): T[] {
  return list
    .map((item, index) => ({ item, index, km: item.geo ? distanceKm(origin, item.geo) : Number.POSITIVE_INFINITY }))
    .sort((a, b) => a.km - b.km || a.index - b.index)
    .map(({ item }) => item);
}

/** 장소 id → 거리(km). 좌표가 없는 곳은 빠진다. */
export function distancesFrom<T extends TGeoLike & { id: string }>(list: readonly T[], origin: { lat: number; lng: number }): Map<string, number> {
  const map = new Map<string, number>();
  for (const item of list) if (item.geo) map.set(item.id, distanceKm(origin, item.geo));
  return map;
}

/** 카드에 붙는 거리 — 1km 아래는 50m 단위, 그 위는 소수 한 자리(10km 부터는 정수). */
export function distanceLabel(km: number): string {
  if (km < 1) return `${Math.max(50, Math.round((km * 1000) / 50) * 50)}m`;
  if (km < 10) return `${km.toFixed(1)}km`;
  return `${Math.round(km)}km`;
}
