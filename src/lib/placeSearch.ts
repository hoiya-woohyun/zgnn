/**
 * 둘러보기 검색어가 장소에 맞는가(docs/todo/12 U1.1). 순수.
 *
 * 예전에는 질의 전체를 한 덩어리로 `includes` 했다 — "애월 카페" 는 0곳, 이름에 띄어쓰기가 있는 17곳("그리너리빌리지 펜션")은
 * "그리너리 빌리지" 로 안 걸렸고, 업종(`category` — 카레·돈가스·햄버거)은 아예 찾을 수 없었다.
 *
 * 규칙: 공백으로 나눈 **모든 단어**가 (이름·특징·읍면·업종·조건 칩 중 어디든) 들어 있으면 참. 비교는 양쪽 다 공백을 뺀 소문자라
 * 띄어쓰기를 어떻게 하든 같다.
 *
 * 조건 칩('대형견 OK'·'유모차 필요')도 찾는다(14 W261007.11) — 카드에 보이는 글자로 쳤는데 0곳이면 사용자는 그런 곳이 없다고 읽는다.
 * 칩은 카드와 같은 함수(`toPetBadges`)에서 뽑되 `warn` 칩(동반 불가·대형견 불가·정보 없음·전화 확인)은 뺀다: 검색어는 원하는 것이라
 * '대형견' 을 친 사람에게 '대형견 불가' 곳을 내면 답이 거꾸로다. 크기 칩은 큰 쪽 하나만 서므로 '중형견' 은 '대형견 OK' 곳을 못 찾는다.
 *
 * 종류 이름(카페·식당·숙소)은 글자가 아니라 **종류를 고르는 말**이다. 지금 탭과 같으면 전부 맞고(글자로 보면 숙소 탭의 "애월 숙소" 가
 * 특징에 '숙소' 라는 말이 없는 곳을 전부 떨어뜨린다), 다른 종류면 이 탭은 0곳이 되어 빈 상태가 그 탭으로 안내한다(`otherTypeMatches`).
 * 예전에는 둘 다 버려서 숙소 탭의 "서귀포 카페" 가 서귀포 펜션 7곳을 냈다.
 *
 * 관광지 이름("중문")은 글자 **또는** 좌표로 맞는다 — 단어가 랜드마크면 그 반경 안의 장소도 참이다(`landmarks.ts`).
 * 읍·면이 아닌 관광지는 지역 태그에 없어 글자로는 거의 안 걸리기 때문이다.
 *
 * 시 이름("서귀포"·"제주시")은 그 시에 속한 읍·면까지 맞는다(14 W261006.9). 지역 태그는 읍·면 하나라 시 이름은 **동 지역**
 * 태그(`서귀포시`·`제주시`)에만 글자로 걸렸다 — 성산·표선·대정이 '서귀포' 검색에서 빠졌다. 맨 '제주' 는 넣지 않는다:
 * 섬 전체라 그 단어로 시를 고르는 사람은 없고, 이름·특징의 '제주' 를 찾는 검색이 시 하나로 좁아진다.
 */

import { isNearLandmark, landmarkOfWord } from './landmarks';
import { toPetBadges, type TPetPolicy } from './petPolicy';
import { PLACE_TYPES, placesOfType, TYPE_META, type TPlaceEntry } from './places';
import type { TPlaceType } from '../types';

/** 종류 이름 → 종류. 탭 이름과 같은 말이어야 하므로 `TYPE_META` 에서 만든다. */
const TYPE_OF_WORD: ReadonlyMap<string, TPlaceType> = new Map(PLACE_TYPES.map((type) => [TYPE_META[type].label, type]));

/** 정책 객체는 장소마다 한 번 만들어지고 검색은 글자마다 돈다 — 칩 글자는 정책마다 한 번만 만든다. */
const chipTextCache = new WeakMap<TPetPolicy, string>();
const chipTextOf = (policy: TPetPolicy): string => {
  let text = chipTextCache.get(policy);
  if (text === undefined) {
    text = toPetBadges(policy)
      .filter((badge) => badge.tone !== 'warn')
      .map((badge) => badge.label)
      .join(' ');
    chipTextCache.set(policy, text);
  }
  return text;
};

/** 행정시 → 소속 읍·면(+ 동 지역 태그 자신). 행정구역은 고정이라 데이터에서 만들지 않는다 — 아직 장소가 없는 읍·면(추자면)도 넣는다. */
const JEJU_CITY = new Set(['제주시', '애월읍', '한림읍', '한경면', '조천읍', '구좌읍', '우도면', '추자면']);
const SEOGWIPO_CITY = new Set(['서귀포시', '대정읍', '안덕면', '남원읍', '표선면', '성산읍']);
const CITY_TOWNS: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ['제주시', JEJU_CITY],
  ['서귀포', SEOGWIPO_CITY],
  ['서귀포시', SEOGWIPO_CITY],
]);

const squash = (text: string) => text.toLowerCase().replace(/\s+/g, '');

export function matchesQuery(
  place: Pick<TPlaceEntry, 'type' | 'name' | 'features' | 'region' | 'category' | 'geo' | 'policy'>,
  query: string,
): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = squash(
    [place.name, place.features, place.region.town, place.category ?? '', chipTextOf(place.policy)].join(' '),
  );
  return words.every((word) => {
    const type = TYPE_OF_WORD.get(word);
    if (type) return place.type === type;
    if (haystack.includes(word)) return true;
    if (CITY_TOWNS.get(word)?.has(place.region.town)) return true;
    const landmark = landmarkOfWord(word);
    return landmark !== null && isNearLandmark(place, landmark);
  });
}

/**
 * 이 종류에서 검색이 0곳일 때, 같은 검색어가 **다른 종류**에 몇 곳 맞는가(14 W261006.6). 0곳인 종류는 뺀다.
 *
 * 검색은 종류 탭 안에서만 돈다 — 숙소 탭에서 "부부키친"(식당)을 치면 0곳이고, 사용자는 그 가게가 없는 줄 안다.
 * 세는 조건은 검색어와 읍면뿐이다: 읍면은 스토어 값이라 탭을 넘어가도 따라오지만, 방향·이용 조건·정렬은 종류마다
 * 다시 고르는 값이라 넘어간 화면에 없다. 여기서 그것까지 걸면 "식당에 1곳" 을 누르고 3곳을 보게 된다.
 */
export function otherTypeMatches(
  type: TPlaceType,
  query: string,
  town: string | null,
  placesOf: (type: TPlaceType) => readonly TPlaceEntry[] = placesOfType,
): { type: TPlaceType; count: number }[] {
  if (!query.trim()) return [];
  return PLACE_TYPES.filter((other) => other !== type)
    .map((other) => ({
      type: other,
      count: placesOf(other).filter((place) => (town === null || place.region.town === town) && matchesQuery(place, query))
        .length,
    }))
    .filter((match) => match.count > 0);
}
