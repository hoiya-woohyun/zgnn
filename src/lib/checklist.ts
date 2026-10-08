import { tripProvidedItemIds } from './itemNeeds';
import { visibleItems } from './seasonItems';
import type { TPlaceEntry } from './places';
import type { TSeasonFilter } from '../store/useAppStore';
import type { TDogProfile, TItem } from '../types';

export { visibleItems };

export type TChecklistView = {
  /** 이번 계절의 준비물 전부. 저장한 곳에 따라 늘거나 줄지 않는다. */
  items: TItem[];
  /** 저장한 숙소가 대신 갖고 있는 준비물. */
  providedItemIds: Set<string>;
  /** 진행률의 분모 = `items.length`. */
  total: number;
  /** 내가 직접 챙긴 것(체크). 숙소에도 있는 물건이라도 체크했으면 여기로 센다. */
  packed: number;
  /** 체크하지 않았지만 저장한 숙소가 갖고 있는 것. `packed` 와 겹치지 않는다. */
  atStay: number;
  /** 더 챙길 필요가 없는 것 = `packed + atStay`. 진행 막대와 묶음 머리의 "2/3" 이 이것으로 찬다. */
  ready: number;
};

/**
 * 준비물 목록 — 계절로만 거른 **고정된 원본**.
 *
 * v2 까지는 저장한 곳에 필요한 것만 추려 분모로 삼았다. 그런데 짐 목록이 하트를 누를 때마다
 * 늘고 줄었고, 무엇보다 "저장한 곳에 필요 없음" 을 "여행에 필요 없음" 으로 말했다 — 숙소를 아직
 * 안 골랐을 뿐인 사람에게 이불이 '그 밖에' 로 접혀 들어갔다. 이제 목록은 늘 같고, 장소 쪽이
 * 이 목록을 읽어 "여기 필요한 것" 을 보여준다(`itemNeedsAt`, ADR-009 v3).
 *
 * 저장한 곳이 여기서 하는 일은 하나 남았다 — 저장한 숙소가 갖고 있는 물건을 '숙소에 있어요' 로
 * 표시하고 준비된 것으로 센다. 이건 목록을 줄이는 게 아니라 "안 챙겨도 된다" 는 사실을 알려 주는 것이다.
 *
 * 다만 **내가 챙긴 것과는 따로 센다**(07 U6). 합쳐 세면 아무것도 체크하지 않은 사람에게 "1가지
 * 준비됐어요" 가 떠서, 숙소가 가진 물건을 내가 챙긴 것처럼 말했다.
 *
 * 홈·준비물 화면이 전부 여기서 나온 숫자를 쓴다. 두 곳이 각자 세면 서로 다른 숫자가 나온다.
 */
export const checklistView = (
  season: TSeasonFilter,
  checkedItemIds: string[],
  savedPlaces: TPlaceEntry[],
): TChecklistView => {
  const items = visibleItems(season);
  const provided = tripProvidedItemIds(savedPlaces, items);
  const packed = items.filter((item) => checkedItemIds.includes(item.id)).length;
  const atStay = items.filter((item) => provided.has(item.id) && !checkedItemIds.includes(item.id)).length;
  return {
    items,
    providedItemIds: provided,
    total: items.length,
    packed,
    atStay,
    // 숙소가 갖고 있는 물건도 준비된 것으로 센다. 목록에서는 '숙소에 있어요' 로 흐리게
    // 표시해 놓고 막대에서만 빼면, 같은 화면의 줄과 막대가 서로 다른 말을 한다.
    ready: packed + atStay,
  };
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
