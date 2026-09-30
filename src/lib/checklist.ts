import { itemsNeededForTrip, tripProvidedItemIds } from './itemNeeds';
import { visibleItems } from './seasonItems';
import type { TPlaceEntry } from './places';
import type { TSeasonFilter } from '../store/useAppStore';
import type { TDogProfile, TItem } from '../types';

export { visibleItems };

export type TChecklistView = {
  /** 저장한 곳에 가려면 필요한 준비물. 저장한 곳이 없으면 빈 배열이다. */
  tripItems: TItem[];
  /** 그 밖의 준비물. tripItems 와 겹치지 않는다. */
  restItems: TItem[];
  /** 저장한 숙소가 대신 갖고 있는 준비물. */
  providedItemIds: Set<string>;
  /** 진행률의 분모가 된 항목(= 저장한 곳이 있으면 tripItems, 없으면 계절 전체). */
  total: number;
  /** 이미 준비된 것 — 직접 체크했거나, 저장한 숙소가 갖고 있거나. */
  ready: number;
  /** 진행률이 '이번 여행' 기준인지. 화면 문구가 이 값으로 갈린다. */
  scopedToTrip: boolean;
};

/**
 * 준비물을 "이번 여행(저장한 곳) × 계절" 로 좁힌 결과.
 *
 * 홈·준비물 화면·장소 카드가 전부 여기서 나온 숫자를 쓴다. 세 곳이 각자 세면
 * 같은 화면 안에서 서로 다른 숫자가 나온다 — 예전 `checklistProgress` 가 계절만 보던 것을
 * 저장한 곳까지 보도록 넓힌 것이고, 저장한 곳이 없으면 그때와 똑같이 동작한다.
 */
export const checklistView = (
  season: TSeasonFilter,
  checkedItemIds: string[],
  savedPlaces: TPlaceEntry[],
): TChecklistView => {
  const items = visibleItems(season);
  const tripItems = itemsNeededForTrip(savedPlaces, season);
  const tripIds = new Set(tripItems.map((item) => item.id));
  const provided = tripProvidedItemIds(savedPlaces, items);

  const scope = tripItems.length > 0 ? tripItems : items;
  return {
    tripItems,
    restItems: items.filter((item) => !tripIds.has(item.id)),
    providedItemIds: provided,
    total: scope.length,
    // 숙소가 갖고 있는 물건도 준비된 것으로 센다. 목록에서는 '숙소에 있어요' 로 흐리게
    // 표시해 놓고 숫자에서만 빼면, 같은 화면의 줄과 숫자가 서로 다른 말을 한다.
    ready: scope.filter((item) => checkedItemIds.includes(item.id) || provided.has(item.id)).length,
    scopedToTrip: tripItems.length > 0,
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
