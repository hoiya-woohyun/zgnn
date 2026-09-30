import placesJson from '../data/places.json';
import itemsJson from '../data/items.json';
import metaJson from '../data/meta.json';
import type { TDirection, TItem, TMeta, TPlace, TPlaceType } from '../types';
import { parsePetPolicy, withPolicyFacts, type TPetPolicy } from './petPolicy';

/** 장소 한 건 + 미리 파싱해 둔 반려동물 이용 조건. */
export type TPlaceEntry = TPlace & { policy: TPetPolicy };

// JSON 은 구조만 맞고 타입 리터럴(예: direction)까지는 좁혀지지 않아 한 번만 단언한다.
const rawPlaces = placesJson as unknown as TPlace[];

export const PLACES: TPlaceEntry[] = rawPlaces.map((place) => ({
  ...place,
  // 블로그 경로의 장소는 AI 판단(petPolicy)이 정규식 결과를 덮는다. 시드는 petPolicy 가 없어 정규식 그대로(ADR-017).
  policy: withPolicyFacts(parsePetPolicy(place.petPolicyText), place.petPolicy, place.petPolicyText),
}));

export const PLACES_BY_ID = new Map(PLACES.map((place) => [place.id, place]));

/**
 * 한 줄로 합칠 준비물 갈래.
 *
 * 원본(Notion)에는 "강아지 기내용 가방(5kg 이하)" 와 "(5kg 이상)" 이 **별개의 준비물**로
 * 들어 있다. 하지만 우리 강아지는 둘 중 하나에만 해당하므로, 목록에 두 줄로 두면 반드시
 * 한 줄은 영영 체크되지 않은 채 남고 "N가지 중 M가지" 가 끝내 안 채워진다.
 *
 * 그래서 화면에 닿기 전에 한 항목으로 합치고, 몸무게 구간은 그 안의 갈래(`variants`)로
 * 내린다. 합치는 일을 여기서 하는 이유는 `ITEMS` 가 준비물의 유일한 출처이기 때문이다 —
 * 계절 필터·진행률·장소별 안 챙긴 것이 전부 여기서 갈라져 나가므로, 여기서 한 번 합치면
 * 세는 곳과 보여주는 곳이 어긋날 수 없다.
 *
 * `members` 의 이름은 `src/data/items.json` 의 name 과 정확히 일치해야 한다(itemNeeds.ts 와
 * 같은 어법). 어긋나면 합치지 않고 원본 두 줄이 그대로 남는다 — 테스트가 그것을 잡는다.
 */
const ITEM_VARIANTS: { name: string; members: { itemName: string; label: string }[] }[] = [
  {
    name: '강아지 기내용 가방',
    members: [
      { itemName: '강아지 기내용 가방(5kg 이하)', label: '5kg 이하' },
      { itemName: '강아지 기내용 가방(5kg 이상)', label: '5kg 이상' },
    ],
  },
];

/**
 * 갈래를 합친 준비물 목록. 합쳐진 항목은 **첫 갈래의 id·이모지**를 그대로 물려받는다 —
 * id 가 유지돼야 이미 체크해 둔 사람의 기록(`checkedItemIds`)이 살아남는다.
 */
const mergeItemVariants = (items: TItem[]): TItem[] => {
  const merged: TItem[] = [];
  const consumed = new Set<string>();

  for (const group of ITEM_VARIANTS) {
    const members = group.members.map((member) => ({
      member,
      item: items.find((candidate) => candidate.name === member.itemName),
    }));
    if (members.some(({ item }) => !item)) continue;

    const [head] = members;
    const variants = members.flatMap(({ member, item }) =>
      item?.linkUrl ? [{ label: member.label, linkUrl: item.linkUrl }] : [],
    );
    merged.push({ ...head.item!, name: group.name, linkUrl: undefined, variants });
    for (const { item } of members) consumed.add(item!.id);
  }

  // 원본 순서를 지키되, 합쳐진 항목은 첫 갈래가 있던 자리에 들어간다.
  return items.flatMap((item) => {
    const replacement = merged.find((candidate) => candidate.id === item.id);
    if (replacement) return [replacement];
    return consumed.has(item.id) ? [] : [item];
  });
};

export const ITEMS = mergeItemVariants(itemsJson as TItem[]);
export const META = metaJson as TMeta;

export const getPlace = (id: string | undefined) => (id ? PLACES_BY_ID.get(id) : undefined);

export const placesOfType = (type: TPlaceType) => PLACES.filter((place) => place.type === type);

/**
 * 저장한 id 중 실제로 존재하는 장소만 골라 PLACES 순서로 돌려준다.
 *
 * 탭바 배지·저장 화면·홈의 '저장한 곳 N' 은 반드시 이 함수 하나만 쓴다.
 * 예전 데이터의 id 가 localStorage 에 남아 있으면 id 를 그냥 세는 쪽과 장소를 찾아 세는 쪽이
 * 서로 다른 숫자를 보여주기 때문이다.
 */
export const selectSavedPlaces = (savedIds: string[]): TPlaceEntry[] =>
  PLACES.filter((place) => savedIds.includes(place.id));

export const countByType: Record<TPlaceType, number> = {
  stay: placesOfType('stay').length,
  restaurant: placesOfType('restaurant').length,
  cafe: placesOfType('cafe').length,
};

// ─────────────────────────────────────────────────────────────────────────────
// 분류 라벨과 색
// ─────────────────────────────────────────────────────────────────────────────

export const PLACE_TYPES: TPlaceType[] = ['stay', 'restaurant', 'cafe'];

export const TYPE_META: Record<TPlaceType, { label: string; blurb: string }> = {
  stay: { label: '숙소', blurb: '반려견과 함께 묵을 수 있는 곳' },
  restaurant: { label: '식당', blurb: '동반 입장이 되는 밥집' },
  cafe: { label: '카페', blurb: '커피 마시며 쉬어 갈 곳' },
};

/**
 * 숙소=파랑(바다) · 식당=빨강 · 카페=초록. 저장 하트는 브랜드 핑크를 그대로 쓴다.
 * 장소 사진이 없는 것이 기본이라(ADR-002) 이 색이 화면에서 종류를 구분하는 주된 신호다.
 *
 * 종류가 셋뿐이라 **삼원색에 가깝게** 벌려 둔다(2026-09-17 재조정, → ADR-003).
 * oklch 색상으로 H258 / H42 / H148 — 서로 106~110° 씩 떨어져 있어 나란히 놓이지 않아도
 * 어느 종류인지 바로 읽힌다. 지도 핀이 파랑·빨강·초록인 것은 지도의 오랜 관습이기도 하다.
 *
 * 지켜야 하는 두 가지:
 * 1. **중립축을 피한다.** 이 앱의 크림·회색은 oklch H≈70~78 이다. 옛 식당(H64)·카페(H55)가
 *    그 위에 앉아 있어서, 채도를 올려도 "살짝 물든 종이"로 읽혔다(22% 워시가 크림과 ΔE 3.4).
 *    노랑(H95)도 같은 이유로 못 쓴다 — 후보로 재 봤더니 ΔE 3.0 으로 더 나빴다.
 * 2. **브랜드보다 조용하다.** 핑크는 C≈0.205 이고 여기는 0.130~0.159 다. 종류 색은 분류 표지지
 *    행동 유도색이 아니다 — 여기서 채도를 더 올리면 화면마다 CTA 와 경쟁한다.
 *    식당의 빨강을 H42(주황 쪽)로 둔 것도 브랜드 핑크(H358)와 44° 를 벌리기 위해서다 —
 *    H32 로 두면 옅은 워시가 분홍으로 읽혀 상세 헤더가 브랜드 면처럼 보였다.
 *
 * styles/theme.css 의 --color-stay 등과 **반드시 같은 값**이어야 한다.
 */
export const TYPE_COLOR: Record<TPlaceType, string> = {
  stay: '#3670c4',
  restaurant: '#c14f18',
  cafe: '#338946',
};

/**
 * 지도 마커의 "저장함" 배지 색. 하트 버튼의 `camellia`(= `theme.css` 의 `--color-brand-600`)와
 * **같은 값**이다 — 마커는 SVG data URI 라 CSS 변수를 못 읽어 여기 한 번 더 적는다.
 * 팔레트를 바꾸면 종류 색처럼 이쪽도 함께 맞춘다.
 */
export const SAVED_MARKER_COLOR = '#cd2a77';

/**
 * 지도의 내 위치 점. 핀이 아니라 **점**이라 모양으로 먼저 갈리지만, 숙소 핀(`#3670c4`)과 같은
 * 파랑 계열이라 색만으로는 가깝다 — 흰 테두리와 옅은 후광이 "지도 앱의 내 위치" 로 읽히게 한다.
 */
export const MY_LOCATION_COLOR = '#1a73e8';

/**
 * 흰 글씨를 얹는 면에 쓰는 진한 쪽. 두 가지를 **동시에** 만족해야 한다 —
 * 흰색 대비 5:1 이상(6.1 / 6.1 / 6.0), 그리고 자기 22% 워시 위에서 4.5:1 이상(4.50 / 4.53 / 4.57).
 *
 * 뒤엣것을 빼먹으면 워시 위(홈 종류 카드 등)에서 글씨가 바탕에 묻는다 — 바탕이 같은 색의
 * 옅은 면이라 흰 바탕 기준만 맞춰서는 부족하다. (상세 제목 판은 ADR-010 v4 에서 워시를 버렸다.)
 * 실제로 이 값을 다시 고르며 흰 바탕만 보고 잡았다가 3.8:1 까지 떨어뜨린 적이 있다.
 */
export const TYPE_COLOR_DEEP: Record<TPlaceType, string> = {
  stay: '#2f62ac',
  restaurant: '#a14820',
  cafe: '#177231',
};

/** 타입 색을 흰색에 섞어 만든 옅은 바탕. 글씨는 ink 계열이나 TYPE_COLOR_DEEP 만 올린다. */
export const typeTint = (type: TPlaceType, percent: number) =>
  `color-mix(in oklab, ${TYPE_COLOR[type]} ${percent}%, #fff)`;

/** 해당 타입에서 장소가 가장 많은 읍면 몇 곳. 홈 섹션 카드의 칩으로 쓴다. */
export const topTowns = (type: TPlaceType, limit = 3): { town: string; count: number }[] => {
  const counts = new Map<string, number>();
  for (const place of placesOfType(type)) {
    counts.set(place.region.town, (counts.get(place.region.town) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([town, count]) => ({ town, count }))
    .sort((a, b) => b.count - a.count || a.town.localeCompare(b.town, 'ko'))
    .slice(0, limit);
};

/** 데이터에 실제로 존재하는 읍면 전체(타입 무관). 스토어가 유지하는 `town` 값의 유효성 검사에 쓴다. */
export const ALL_TOWNS: Set<string> = new Set(PLACES.map((place) => place.region.town));

/**
 * 지도 필터용 읍면 목록(타입 무관, 가나다순). `topTowns` 는 타입별 상위 N 곳만 주지만
 * 지도는 종류를 따로 고르므로 전체 읍면이 있어야 한다.
 */
export const TOWN_OPTIONS: string[] = [...ALL_TOWNS].sort((a, b) => a.localeCompare(b, 'ko'));

export const isPlaceType = (value: string | undefined): value is TPlaceType =>
  value === 'stay' || value === 'restaurant' || value === 'cafe';

export const DIRECTION_LABEL: Record<TDirection, string> = {
  east: '동쪽',
  west: '서쪽',
  south: '남쪽',
  north: '북쪽',
  udo: '우도',
  unknown: '기타',
};

/** 필터에 노출할 방향. 데이터에 실제로 존재하는 것만 쓴다. */
export const DIRECTIONS: TDirection[] = ['east', 'west', 'south', 'north', 'udo'];

// ─────────────────────────────────────────────────────────────────────────────
// 거리
// ─────────────────────────────────────────────────────────────────────────────

const EARTH_RADIUS_KM = 6371;
const toRad = (deg: number) => (deg * Math.PI) / 180;

export const distanceKm = (
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number => {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
};

/** 좌표가 있는 장소 중 가까운 순으로. 좌표가 없는 장소는 빈 배열을 돌려준다. */
export const nearbyPlaces = (place: TPlaceEntry, limit = 3): { place: TPlaceEntry; km: number }[] => {
  const origin = place.geo;
  if (!origin) return [];
  return PLACES.filter((other) => other.id !== place.id && other.geo)
    .map((other) => ({ place: other, km: distanceKm(origin, other.geo!) }))
    .sort((a, b) => a.km - b.km)
    .slice(0, limit);
};

export const JEJU_CENTER: [number, number] = [33.38, 126.55];

/**
 * 폭을 못 잴 때 쓰는 첫 화면 확대 수준(모바일 390px 에서 `jejuZoomFor` 가 내는 값과 같다).
 *
 * **이 값의 방향은 두 번 뒤집혔다.** leaflet 의 `zoom`(클수록 확대) → Kakao 의 `level`(작을수록
 * 확대) → 네이버의 `zoom`(다시 **클수록 확대**, 기본 11). 그래서 직전의 `JEJU_LEVEL = 10` 에서
 * 숫자를 물려받을 수 없다. 부호를 뒤집어 써도 빌드와 테스트는 그대로 통과한다 —
 * 틀리면 화면에서만 드러난다.
 *
 * 한 단계 차이가 "섬이 꽉 찬다" 와 "절반만 잘린다" 다. 그래서 상수 하나로 박지 않고
 * 지도 컨테이너 폭에서 계산한다 — `jejuZoomFor` 를 볼 것.
 *
 * 지도가 시야를 코드로 옮기는 것은 이 첫 한 번뿐이다 — 그 뒤는 사용자가 끌고 확대한다.
 */
export const JEJU_ZOOM = 10;

/**
 * 장소 한 곳을 가리킬 때의 확대 수준 — 상세 화면의 미니 지도와 `/map/?place=<id>` 로 들어온 첫 화면.
 * 동네 하나(390px 폭에서 경도 약 0.03°)가 드는 단계라 그 장소와 바로 옆 핀 몇 개가 함께 보인다.
 * 방향은 네이버 `zoom` 그대로 **클수록 확대**다(위 `JEJU_ZOOM` 주석).
 */
export const PLACE_FOCUS_ZOOM = 14;

/** 제주 본섬의 경도 폭(126.15~126.98). 추자도·우도까지는 아니고 "섬이 화면에 든다" 의 기준. */
const JEJU_LON_SPAN = 0.83;

/**
 * 섬 전체가 드는 줌에서 **한 단계 더 당긴다**(2026-09-28, 사용자 요청 — "지도가 너무 멀리 있다").
 *
 * 제주는 가로로 길어서(경도 0.83° × 위도 약 0.35°) 가로를 맞추면 세로 폰 화면의 위아래 절반 이상이
 * 바다다. 한 단계 당기면 보이는 경도가 섬 폭의 약 65%(390px 기준 0.54°)라 **동서 끝(한림·성산)은
 * 첫 화면에서 잘린다** — 알고 고른 것이다. 가운데(제주시~중문)가 읽히는 쪽이 첫 화면으로 낫고,
 * 끝은 끌면 나온다.
 */
const FIRST_VIEW_STEP_IN = 1;

/**
 * 지도를 처음 열 때의 확대 수준 — 섬 전체가 드는 줌 + `FIRST_VIEW_STEP_IN`.
 *
 * "섬 전체가 드는 줌" 은 이렇게 구한다. 타일 한 장(256px)이 경도 `360/2^zoom` 을 덮으므로
 * 폭 W px 에 보이는 경도는 `360/2^zoom × W/256` 이고, 그것이 `JEJU_LON_SPAN` 이상이어야 섬이 안
 * 잘린다 → `zoom ≤ log2(360 × W / (256 × span))`. 여기에 한 단계를 더해 모바일 390px → 10,
 * 데스크톱(좌측 패널을 뺀 830px) → 11 이 된다.
 *
 * 상수 하나를 쓰지 않는 이유: 모바일에 맞춘 값은 데스크톱에서 한 단계 멀고, 데스크톱 값은
 * 모바일에서 한 단계 가깝다 — 폭이 두 배면 맞는 줌이 한 단계 다르다.
 * 이 계산은 지도를 만들 때 **한 번만** 돈다 — 창 크기를 따라다니지 않는다.
 */
export function jejuZoomFor(widthPx: number): number {
  if (!Number.isFinite(widthPx) || widthPx <= 0) return JEJU_ZOOM;
  const fitIsland = Math.floor(Math.log2((360 * widthPx) / (256 * JEJU_LON_SPAN)));
  // 네이버 zoom 범위(6~21) 안으로. 아주 좁거나 넓은 컨테이너에서 벗어나지 않게.
  return Math.min(21, Math.max(6, fitIsland + FIRST_VIEW_STEP_IN));
}
