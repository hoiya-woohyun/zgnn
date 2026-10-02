/**
 * 둘러보기 검색어가 장소에 맞는가(docs/todo/12 U1.1). 순수.
 *
 * 예전에는 질의 전체를 한 덩어리로 `includes` 했다 — "애월 카페" 는 0곳, 이름에 띄어쓰기가 있는 17곳("그리너리빌리지 펜션")은
 * "그리너리 빌리지" 로 안 걸렸고, 업종(`category` — 카레·돈가스·햄버거)은 아예 찾을 수 없었다.
 *
 * 규칙: 공백으로 나눈 **모든 단어**가 (이름·특징·읍면·업종 중 어디든) 들어 있으면 참. 비교는 양쪽 다 공백을 뺀 소문자라
 * 띄어쓰기를 어떻게 하든 같다. 종류 이름(카페·식당·숙소)은 단어에서 뺀다 — 탭이 이미 고르고 있고, 남겨 두면 숙소 탭의 "애월 숙소" 가
 * 특징에 '숙소' 라는 말이 없는 곳을 전부 떨어뜨린다.
 */

import type { TPlaceEntry } from './places';

const TYPE_WORDS = new Set(['카페', '식당', '숙소']);

const squash = (text: string) => text.toLowerCase().replace(/\s+/g, '');

export function matchesQuery(
  place: Pick<TPlaceEntry, 'name' | 'features' | 'region' | 'category'>,
  query: string,
): boolean {
  const words = query
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word && !TYPE_WORDS.has(word));
  if (words.length === 0) return true;
  const haystack = squash([place.name, place.features, place.region.town, place.category ?? ''].join(' '));
  return words.every((word) => haystack.includes(word));
}
