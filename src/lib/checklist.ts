import { ITEMS } from './places';
import { visibleItems } from './seasonItems';
import type { TDogProfile, TItem } from '../types';

export { visibleItems };

export type TChecklistProgress = {
  /** 준비물 전부 — 계절·저장한 곳과 무관하게 늘 같다(ADR-009 v4). */
  items: TItem[];
  /** 진행률의 분모 = `items.length`. */
  total: number;
  /** 내가 체크한 것. */
  packed: number;
};

/**
 * 준비물 탭의 숫자 — **내 짐만 센다**(ADR-009 v4).
 *
 * v3 까지는 저장한 숙소가 갖고 있는 물건을 '숙소에 있어요' 로 따로 셌고, 목록은 계절 칩으로 걸렀다.
 * 탭이 "내 물건을 찾아 챙겼는지 표시하는 곳" 이 되면서 둘 다 뺐다 — 숙소 몫은 장소 쪽(`PlaceItemsNote`)이
 * 말하고, 계절로 거르면 검색한 물건이 안 나온다. 홈 「내 여행」 과 탭 머리가 이 함수 하나로 센다.
 */
export const checklistProgress = (checkedItemIds: string[]): TChecklistProgress => ({
  items: ITEMS,
  total: ITEMS.length,
  packed: ITEMS.filter((item) => checkedItemIds.includes(item.id)).length,
});

/** 준비물 탭의 보기 칩. */
export type TChecklistFilter = 'all' | 'unpacked' | 'packed';

export const CHECKLIST_FILTER_LABEL: Record<TChecklistFilter, string> = {
  all: '전체',
  unpacked: '안 챙긴 것',
  packed: '챙긴 것',
};

/**
 * 검색어가 이 준비물에 맞는가. 빈 검색어는 `filterChecklistItems` 가 먼저 걸러 여기 오지 않는다.
 */
export const matchesItemQuery = (item: TItem, query: string): boolean => {
  // TODO(사용자): 어디까지 찾을지 정한다. 지금은 이름에 적은 그대로 들어 있는지만 본다 — 그래서
  //  - 띄어쓰기: "배변 봉투" 는 '배변봉투' 를, "이불담요" 는 '얇은 이불/담요' 를 못 찾는다(가장 먼저 부딪힐 곳)
  //  - 대소문자: 지금 이름엔 영문이 없지만 데이터가 늘면
  //  - 이유(`item.reason`)까지 볼지: 더 잡히지만 "물" 하나로 거의 전부가 걸린다
  //  - 초성("ㅂㅂ")까지 받을지
  // 같은 결의 선례: `adminPlaces.ts` 의 `matchesPlaceQuery`(공백·대소문자 무시).
  return item.name.includes(query);
};

/** 검색어 + 보기 칩으로 목록을 거른다. 순서는 원본 그대로다(체크한 것을 아래로 내리면 누른 줄이 손 밑에서 사라진다). */
export const filterChecklistItems = (
  items: TItem[],
  query: string,
  filter: TChecklistFilter,
  checkedItemIds: string[],
): TItem[] => {
  const trimmed = query.trim();
  return items.filter((item) => {
    const checked = checkedItemIds.includes(item.id);
    if (filter === 'packed' && !checked) return false;
    if (filter === 'unpacked' && checked) return false;
    return trimmed === '' || matchesItemQuery(item, trimmed);
  });
};

/**
 * 준비물의 기내용 가방 — 갈래 둘(5kg 이하/이상)을 합친 이름(`places.ts` 의 ITEM_VARIANTS).
 * id 가 아니라 이름으로 찾는다: 합친 항목의 id 는 첫 갈래의 것을 물려받아 데이터가 바뀌면 따라 바뀐다.
 */
export const CARRY_BAG_ITEM_NAME = '강아지 기내용 가방';

/**
 * 준비물에서 기내용 가방을 **막 체크했는데** 프로필 이동 수단이 '없어요' 인가 — 그러면 프로필도
 * 바꿀지 한 번 묻는다(08 T4.8, 지수 N5). 가방을 챙겼다고 해 놓고 식당 판정은 "가방 없음" 그대로라
 * 두 화면이 다른 사람을 말하고 있었다.
 *
 * **묻기만 한다.** 체크가 프로필을 조용히 바꾸면 판정이 사용자 모르게 뒤집힌다 — 그 방향이
 * ADR-009 가 막는 것(준비물 ↔ 판정이 서로 반대로 말하기)의 뒷면이다. 반대 방향(프로필 → 준비물
 * 자동 체크, `ITEM_NEEDS` 에 가방 넣기)은 여전히 금지다. 체크를 풀 때·프로필이 없을 때·이미 가방·
 * 케이지·유모차일 때는 묻지 않는다.
 */
export const shouldAskCarrierBag = (
  itemName: string,
  becameChecked: boolean,
  dog: TDogProfile | null,
): boolean => becameChecked && itemName === CARRY_BAG_ITEM_NAME && dog?.carrier === 'none';

/**
 * 갈래 있는 준비물(기내용 가방)에서 **우리 강아지 몸무게에 맞는 갈래만**(14 W261007.13). 두부 3kg 에게 "5kg 이상" 링크까지
 * 나란히 보이면 어느 쪽인지 사용자가 다시 따져야 했다. 여러 마리면 맞는 갈래의 합(콩 2.5 + 해피 12 → 둘 다),
 * 경계(정확히 5kg)는 두 라벨이 다 5 를 품으니 둘 다. 강아지가 없거나 하나도 안 맞으면 전부 — 링크를 숨기지 않는다.
 *
 * 화면에서만 거른다. `ITEMS`(분모·id)는 그대로다 — 갈래는 링크만 가르고 세는 일에 끼지 않는다(ADR-009 「갈래」 · features/checklist.md v10).
 */
export const variantsForDog = <T extends { kg?: { min?: number; max?: number } }>(
  variants: readonly T[],
  dog: TDogProfile | null,
): readonly T[] => {
  if (!dog || dog.dogs.length === 0) return variants;
  const fits = variants.filter(({ kg }) =>
    dog.dogs.some(({ weightKg }) => !kg || ((kg.min ?? -Infinity) <= weightKg && weightKg <= (kg.max ?? Infinity))),
  );
  return fits.length > 0 ? fits : variants;
};

/** 준비물의 유모차 — 이름으로 찾는다(`CARRY_BAG_ITEM_NAME` 과 같은 이유). */
export const STROLLER_ITEM_NAME = '강아지 유모차';

/**
 * 프로필 이동 수단이 유모차인데 준비물의 유모차가 아직 안 챙김이면, 그 줄에서 **한 번에 챙기게 묻는다**(14 W261007.13).
 * 조용히 챙김으로 바꾸지 않는다 — 유모차로 다닌다는 것이 짐을 쌌다는 뜻은 아니고(이 항목 이유가 '공항 근처 대여' 다),
 * 안 챙긴 것을 챙긴 것처럼 세는 것은 07 U6 이 고친 거짓말이다. `shouldAskCarrierBag` 의 거울: 체크는 사용자의 한 번 누름뿐.
 */
export const shouldOfferStroller = (itemName: string, checked: boolean, dog: TDogProfile | null): boolean =>
  !checked && itemName === STROLLER_ITEM_NAME && dog?.carrier === 'stroller';
