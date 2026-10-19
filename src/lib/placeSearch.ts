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
 * 특징에 '숙소' 라는 말이 없는 곳을 전부 떨어뜨린다), 다른 종류면 이 탭은 0곳이 되어 빈 상태가 그 탭으로 안내한다(`placesPageFilter` 의 `otherTypeMatches`).
 * 예전에는 둘 다 버려서 숙소 탭의 "서귀포 카페" 가 서귀포 펜션 7곳을 냈다.
 *
 * 관광지 이름("중문")은 글자 **또는** 좌표로 맞는다 — 단어가 랜드마크면 그 반경 안의 장소도 참이다(`landmarks.ts`).
 * 읍·면이 아닌 관광지는 지역 태그에 없어 글자로는 거의 안 걸리기 때문이다.
 *
 * 시 이름("서귀포"·"제주시")은 그 시에 속한 읍·면까지 맞는다(14 W261006.9). 지역 태그는 읍·면 하나라 시 이름은 **동 지역**
 * 태그(`서귀포시`·`제주시`)에만 글자로 걸렸다 — 성산·표선·대정이 '서귀포' 검색에서 빠졌다. 맨 '제주' 는 넣지 않는다:
 * 섬 전체라 그 단어로 시를 고르는 사람은 없고, 이름·특징의 '제주' 를 찾는 검색이 시 하나로 좁아진다.
 * 시 이름 뒤에 '시내' 를 붙이면('서귀포 시내'·'제주 시내') 시내 태그 하나만이다(14 W261019.11, `DOWNTOWN_OF_WORD`).
 */

import { isNearLandmark, landmarkOfWord, type TLandmark } from './landmarks';
import { toPetBadges, type TPetPolicy } from './petPolicy';
import { PLACE_TYPES, TYPE_META, type TPlaceEntry } from './places';
import type { TPlaceType } from '../types';

/** 종류 이름 → 종류. 탭 이름과 같은 말이어야 하므로 `TYPE_META` 에서 만든다. */
const TYPE_OF_WORD: ReadonlyMap<string, TPlaceType> = new Map(PLACE_TYPES.map((type) => [TYPE_META[type].label, type]));

/** 낱말이 종류 이름(카페·식당·숙소)인가 — 그 낱말은 글자가 아니라 탭을 고르는 말이다. */
export const isTypeWord = (word: string): boolean => TYPE_OF_WORD.has(word);

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

/** 시 이름 → 그 시의 **시내**(동 지역) 태그. 지역 태그가 읍·면 하나라 시내는 시 이름 그대로 붙어 있다(`서귀포시`·`제주시`). */
const CITY_DOWNTOWN: ReadonlyMap<string, string> = new Map([
  ['제주시', '제주시'],
  ['서귀포', '서귀포시'],
  ['서귀포시', '서귀포시'],
]);

/**
 * '서귀포 시내'·'제주 시내' — 시내 태그 하나를 고르는 구절(14 W261019.11). 홈 동네 카드가 "남부(서귀포 시내·남원)" 라 쓰고(`areaTownNames`)
 * 좁힌 읍면 칩이 '제주시 시내' 라 부르는데(`townFilterLabel`), 낱말로 나누면 '서귀포'(시 전체)와 '시내'(어디에도 없는 글자)라 0곳이었다.
 * 시 이름 뒤의 '시내' 를 붙여 한 낱말로 읽고(`queryWords`), 그 낱말은 **태그로만** 맞는다 — '시내만 보기' 와 같은 집합이다.
 * 맨 '제주' 는 시가 아니지만(위 `CITY_TOWNS`) '제주 시내' 는 앱이 쓰는 말이라 받는다. 키는 붙여 쓴 꼴이다.
 */
const DOWNTOWN_OF_WORD: ReadonlyMap<string, string> = new Map([
  ['서귀포시내', '서귀포시'],
  ['서귀포시시내', '서귀포시'],
  ['제주시내', '제주시'],
  ['제주시시내', '제주시'],
]);

/** 검색어 → 낱말(소문자). 시 이름 다음의 '시내' 는 앞 낱말에 붙인다(`DOWNTOWN_OF_WORD`). */
export function queryWords(query: string): string[] {
  const words: string[] = [];
  for (const word of query.toLowerCase().split(/\s+/).filter(Boolean)) {
    const joined = `${words.at(-1) ?? ''}${word}`;
    if (word === '시내' && DOWNTOWN_OF_WORD.has(joined)) words[words.length - 1] = joined;
    else words.push(word);
  }
  return words;
}

/**
 * 검색어의 관광지 낱말 — 앞의 것 하나. 둘러보기 '가까운 순' 의 기준점이 되고(위치 권한을 묻지 않는다) 검색어 칩이 반경을 말한다(14 W261019.11).
 * '중문' 결과의 서울앵무새는 설명에 중문이 없어 왜 나왔는지 몰랐다 — 반경으로 걸린 곳이다.
 */
export function landmarkOfQuery(query: string): { word: string; landmark: TLandmark } | null {
  for (const word of queryWords(query)) {
    const landmark = landmarkOfWord(word);
    if (landmark) return { word, landmark };
  }
  return null;
}

export type TCityScope = {
  /** 검색어에 있던 시 이름 그대로('서귀포'). */
  word: string;
  /** 시내의 지역 태그('서귀포시') — 읍면 필터에 그대로 건다. */
  downtown: string;
  downtownCount: number;
  /** 시내가 아닌 소속 읍·면(성산읍·구좌읍…)의 곳 수. */
  townCount: number;
};

/**
 * 검색어의 시 이름이 결과에서 무엇을 덮었나(14 W261010.30) — 시내와 소속 읍·면을 따로 센다.
 *
 * 시 이름은 소속 읍·면까지 맞는다(위 `CITY_TOWNS`, W261006.9 — 서귀포 현지인은 성산·표선도 서귀포다). 그런데 여행자는 '서귀포'·'제주시' 를
 * **시내**로 읽어서, 판정순 맨 위에 성산·구좌·우도가 오면 검색이 틀렸다고 본다(business-11 · backpacker-06). 둘 다 맞는 독해라 범위는 그대로 두고
 * 화면이 무엇을 덮었는지 말한다 — 시내만 원하면 읍면 필터로 한 번에 좁힌다. 범위를 시내로 줄이면 현지인의 불만(카페 3곳)이 그대로 돌아온다.
 * 정렬을 시내 먼저로 가르지 않는다: 판정순이 이 앱의 첫 번째 순서다.
 *
 * 결과에 소속 읍·면이 하나도 없으면 null — 시 이름이 시내 밖을 덮지 않았으니 말할 것이 없다. 시 이름이 둘이면 앞의 것.
 */
export function cityScopeOf(query: string, places: readonly Pick<TPlaceEntry, 'region'>[]): TCityScope | null {
  // '서귀포 시내' 는 한 낱말(`서귀포시내`)이라 여기 안 걸린다 — 시내만 덮었으니 말할 것이 없다.
  const word = queryWords(query).find((candidate) => CITY_DOWNTOWN.has(candidate));
  if (word === undefined) return null;
  const downtown = CITY_DOWNTOWN.get(word)!;
  const towns = CITY_TOWNS.get(word)!;
  let downtownCount = 0;
  let townCount = 0;
  for (const place of places) {
    if (place.region.town === downtown) downtownCount += 1;
    else if (towns.has(place.region.town)) townCount += 1;
  }
  return townCount > 0 ? { word, downtown, downtownCount, townCount } : null;
}

const squash = (text: string) => text.toLowerCase().replace(/\s+/g, '');

export function matchesQuery(
  place: Pick<TPlaceEntry, 'type' | 'name' | 'features' | 'region' | 'category' | 'geo' | 'policy'>,
  query: string,
): boolean {
  const words = queryWords(query);
  if (words.length === 0) return true;
  const haystack = squash(
    [place.name, place.features, place.region.town, place.category ?? '', chipTextOf(place.policy)].join(' '),
  );
  return words.every((word) => {
    const type = TYPE_OF_WORD.get(word);
    if (type) return place.type === type;
    const downtown = DOWNTOWN_OF_WORD.get(word);
    if (downtown) return place.region.town === downtown;
    if (haystack.includes(word)) return true;
    if (CITY_TOWNS.get(word)?.has(place.region.town)) return true;
    const landmark = landmarkOfWord(word);
    return landmark !== null && isNearLandmark(place, landmark);
  });
}
