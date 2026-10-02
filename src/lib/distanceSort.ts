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

/** 같은 읍면이 이기는 거리 차의 상한(km) — 그보다 멀면 같은 읍면이라도 가까운 쪽이 먼저다(12 U1.4). */
export const SAME_TOWN_EDGE_KM = 1;

/**
 * 상세의 「근처 장소」 순서(docs/todo/12 U1.4). 순수.
 *
 * 예전에는 같은 읍면을 거리보다 **먼저** 세워 살롱드라방에서 12.9km → 16.9km → 1.9km 순이 됐고, 판정을 안 봐
 * 대형견 프로필로 열면 근처 둘이 모두 "이용하기 어려워요" 였다. 이제 순서는 셋이다.
 *  1. 판정이 어려움(`hard`)인 곳은 뒤로 — 강아지가 없으면(`isHard` 가 늘 false) 이 단계는 없다.
 *  2. 거리순. 다만 같은 읍면은 `SAME_TOWN_EDGE_KM` 만큼 당겨 본다 — 1km 안의 차이면 같은 동네가 먼저.
 *     비교 함수에 "차이가 1km 안이면" 을 직접 쓰지 않는 이유: 그 비교는 추이적이지 않아 정렬 결과가 입력 순서에 따라 흔들린다.
 *  3. 그래도 같으면 실제 거리, 그다음 원래 순서.
 */
export function sortNearby<T extends { km: number }>(
  list: readonly T[],
  { isSameTown, isHard }: { isSameTown: (item: T) => boolean; isHard: (item: T) => boolean },
): T[] {
  return list
    .map((item, index) => ({ item, index, hard: isHard(item) ? 1 : 0, key: item.km - (isSameTown(item) ? SAME_TOWN_EDGE_KM : 0) }))
    .sort((a, b) => a.hard - b.hard || a.key - b.key || a.item.km - b.item.km || a.index - b.index)
    .map(({ item }) => item);
}
