/**
 * 목록 "가까운 순"(docs/todo/10 F7 — 뚜벅이 민지 "지금 여기서 가까운 곳"). 순수.
 *
 * 지도에는 내 위치가 있는데 목록 정렬에는 없어, 지도로 넘어가 마커를 하나씩 눌러야 했다.
 * 위치는 누를 때 한 번 받고(`myLocation.locateMe`) **저장하지도 보내지도 않는다** — 정렬에 쓰고 사라진다(ADR-012 대상 아님).
 */

import { distanceKm, PLACES_BY_ID, type TPlaceEntry } from './places';
import type { TPlaceType } from '../types';

type TGeoLike = { geo?: { lat: number; lng: number } };

/**
 * 가까운 순. 좌표가 없는 곳은 **뒤로**(가격 정렬이 요금 모르는 곳을 뒤로 보내는 것과 같은 규칙), 그 안에서는 원래 순서.
 * `within` 에 안 드는 곳도 좌표 없는 곳처럼 뒤로 간다 — 기준이 장소일 때 배를 타야 닿는 다른 섬(`sameIsland`). 직선 5km 여도 다른 하루다.
 */
export function sortByDistance<T extends TGeoLike>(
  list: readonly T[],
  origin: { lat: number; lng: number },
  within?: (item: T) => boolean,
): T[] {
  return list
    .map((item, index) => ({
      item,
      index,
      km: item.geo && (within?.(item) ?? true) ? distanceKm(origin, item.geo) : Number.POSITIVE_INFINITY,
    }))
    .sort((a, b) => a.km - b.km || a.index - b.index)
    .map(({ item }) => item);
}

/** 장소 id → 거리(km). 좌표가 없는 곳·`within` 에 안 드는 곳은 빠진다(카드에 km 가 안 붙는다 — 뒤로 간 까닭과 같다). */
export function distancesFrom<T extends TGeoLike & { id: string }>(
  list: readonly T[],
  origin: { lat: number; lng: number },
  within?: (item: T) => boolean,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const item of list) if (item.geo && (within?.(item) ?? true)) map.set(item.id, distanceKm(origin, item.geo));
  return map;
}

/**
 * 상세 「근처 장소」 → 둘러보기 '○○에서 가까운 순'(14 W261013.14o). 숙소 근처 식당을 보려던 사람이 목록의 '가까운 순' 을 골랐다가
 * "위치 권한이 꺼져 있어요" 에서 막혔다(seongho-28) — 기준이 내 위치뿐인데, 여행을 짜는 사람은 아직 제주에 없다.
 *
 * 기준 장소는 **주소(`?near=<id>`)에만** 산다. 정렬은 화면 state 라 식당 하나를 보고 돌아오면(목록이 새로 마운트된다) 풀리고,
 * 스토어에 두면 다른 종류 탭·다음 방문까지 샌다 — 주소는 뒤로가기에 그대로 남고 다른 종류로 넘기면 저절로 빠진다.
 */
export const NEAR_PARAM = 'near';

export const placesNearHref = (type: TPlaceType, placeId: string): string =>
  `/places/${type}/?${NEAR_PARAM}=${encodeURIComponent(placeId)}`;

/** 주소의 쿼리 → 기준 장소. 모르는 id·좌표 없는 곳이면 null — 그때는 평소 목록이다. */
export function nearPlaceOf(search: string): TPlaceEntry | null {
  const place = PLACES_BY_ID.get(new URLSearchParams(search).get(NEAR_PARAM) ?? '');
  return place?.geo ? place : null;
}

/**
 * 화면에 찍히는 거리는 전부 이것 하나 — 1km 아래는 50m 단위, 그 위는 소수 한 자리(10km 부터는 정수).
 * 기준이 내 위치든 장소든 같은 반올림이다: 장소 좌표도 주소→좌표·건물 폭만큼 흔들리는 직선거리라 "243m" 는 정밀해 보일 뿐이고,
 * 상세 「근처 장소」 만 따로 적던 시절엔 그 줄의 '더 보기' 로 연 목록이 같은 곳을 "250m" 로 말했다(14 W261013.14r).
 */
export function distanceLabel(km: number): string {
  if (km < 1) return `${Math.max(50, Math.round((km * 1000) / 50) * 50)}m`;
  if (km < 10) return `${km.toFixed(1)}km`;
  return `${Math.round(km)}km`;
}

/**
 * 상세의 「근처 장소」 카드(docs/todo/12 U1.4 → 14 재점검). 순수.
 *
 * **카드에 km 가 찍히므로 순서는 거리 하나다.** 예전 규칙 둘이 숫자를 뒤집어 "거리순이 아니다" 로 읽혔다:
 *  - 같은 읍면을 1km 당겨 보기 — 달중이네에서 2.2km(같은 읍면) → 1.9km.
 *  - 어려움을 뒤로 — 호텔 핀코 식당에서 5.4km → 2.5km(어려움) → 3.4km(어려움).
 * 그래서 어려움은 뒤로 보내지 않고 **빼고 센다**(`hiddenHard`) — 대형견 프로필로 열었을 때 셋이 다 "어려워요" 인 것(12 U1.4 ②)은
 * 그대로 막으면서, 더 가까운 곳이 말없이 사라지지 않게 화면이 "더 가까운 n곳은 어려워요" 라고 말한다.
 * `withHard` 면 거르지 않는다(사용자가 '함께 보기' 를 눌렀다).
 *
 * `hiddenHard` 는 보인 마지막 카드보다 앞에 있던 어려움 수다 — 더 먼 어려움은 어차피 안 보였을 곳이라 세지 않는다.
 * 카드가 `limit` 보다 적게 남으면 끝까지 본 것이라 어려움 전부다.
 */
export function pickNearby<T extends { km: number }>(
  list: readonly T[],
  { isHard, withHard = false, limit = 3 }: { isHard: (item: T) => boolean; withHard?: boolean; limit?: number },
): { shown: T[]; hiddenHard: number } {
  const sorted = list
    .map((item, index) => ({ item, index }))
    .sort((a, b) => a.item.km - b.item.km || a.index - b.index)
    .map(({ item }) => item);
  if (withHard) return { shown: sorted.slice(0, limit), hiddenHard: 0 };
  const shown: T[] = [];
  let hardBefore = 0;
  let hiddenHard = 0;
  for (const item of sorted) {
    if (isHard(item)) {
      hardBefore += 1;
      continue;
    }
    shown.push(item);
    hiddenHard = hardBefore;
    if (shown.length === limit) break;
  }
  if (shown.length < limit) hiddenHard = hardBefore;
  return { shown, hiddenHard };
}
