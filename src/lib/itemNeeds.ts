/**
 * "이 장소에 가려면 무엇을 챙겨야 하는가" — 준비물을 여행에서 파생되는 값으로 만든다.
 *
 * ✅ 규칙은 여기서 조정한다. 아래 `ITEM_NEEDS` 한 줄이 규칙 하나다.
 *    itemName 은 src/data/items.json 의 name 과 정확히 일치해야 한다(`amenities.ts` 와 같은 어법).
 *
 * 두 가지를 일부러 하지 않는다.
 *
 * 1. **이동가방·케이지·유모차는 다루지 않는다.** 그건 `TCarrier` 와 `eligibility.ts`(H4·H5·C2·C3)
 *    의 영역이다. 여기서 같은 말을 또 하면 프로필에 케이지가 있어 "갈 수 있어요" 인 곳에서
 *    "기내용 가방을 안 챙겼어요" 가 함께 떠서, 한 화면의 두 줄이 서로 반대를 말하게 된다.
 * 2. **없는 정보를 지어내지 않는다.** 표에 없는 준비물은 어느 장소에도 걸리지 않는다 —
 *    "혹시 필요할지도" 로 경고를 만들면 경고 전체가 무시된다.
 */
import { resolveProvidedItemIds } from './amenities';
import { ITEMS } from './places';
import { visibleItems } from './seasonItems';
import type { TPlaceEntry } from './places';
import type { TSeasonFilter } from '../store/useAppStore';
import type { TItem, TPlaceType } from '../types';

const EVERYWHERE: TPlaceType[] = ['stay', 'restaurant', 'cafe'];
/** 남의 가게 안에서 강아지를 데리고 앉아 있어야 하는 곳. */
const EATING_OUT: TPlaceType[] = ['restaurant', 'cafe'];

type TItemNeed = {
  itemName: string;
  types: TPlaceType[];
  /** 종류만으로는 안 갈리는 조건. 없으면 그 종류 전부에 걸린다. */
  when?: (place: TPlaceEntry) => boolean;
};

export const ITEM_NEEDS: TItemNeed[] = [
  // ── 어디를 가든 ──────────────────────────────────────────────────────────
  { itemName: '배변봉투', types: EVERYWHERE },
  { itemName: '인식표 목걸이', types: EVERYWHERE },
  { itemName: '비상약/연고', types: EVERYWHERE },
  // TODO(확인): 원문 이유는 "오름이나 숲" 이야기다. 숙소에만 걸어야 할지, 지금처럼 전부일지.
  { itemName: '진드기 퇴치제', types: EVERYWHERE },
  // 겨울 항목이라 계절을 고르지 않으면 애초에 안 보인다. "해안가는 바람이 세서" → 장소를 안 가린다.
  { itemName: '강아지 방한용품', types: EVERYWHERE },

  // ── 식당·카페 ────────────────────────────────────────────────────────────
  // "같이 식당이나 카페에 들어가서도 필요한 경우가 있더라구요"
  { itemName: '휴대용 물병/밥그릇', types: EATING_OUT },
  // "주인들이 밥 먹는 걸 기다려야 할 때"
  { itemName: '오래 씹을 수 있는 간식', types: EATING_OUT },
  // "자유롭게 내려놓고 풀어놓을 수 있는 곳이라면" — 가방에 넣어야 하는 곳에는 필요 없다.
  {
    itemName: '기저귀',
    types: EATING_OUT,
    when: (place) => place.policy.indoor === 'free' || place.policy.outdoorFree,
  },

  // ── 숙소 ────────────────────────────────────────────────────────────────
  // "밤에 잘 때 강아지 자리에 깔아주시면 좋아요"
  { itemName: '얇은 이불/담요', types: ['stay'] },
  // TODO(확인): 여름 물놀이 3종. 데이터에 "수영장·바다 근처" 표시가 없어 숙소 전체에 건다.
  // 바다·수영장이 아닌 숙소에서도 뜨는 게 거슬리면 여기서 빼는 편이 낫다.
  { itemName: '강아지 튜브', types: ['stay'] },
  { itemName: '강아지 구명조끼', types: ['stay'] },
  { itemName: '강아지 수건', types: ['stay'] },
];

/** itemName → 규칙. 이름이 데이터와 어긋난 규칙은 조용히 빠진다(없는 준비물을 만들지 않는다). */
const needsByItemId = new Map<string, TItemNeed>(
  ITEM_NEEDS.flatMap((need) => {
    const item = ITEMS.find((candidate) => candidate.name === need.itemName);
    return item ? [[item.id, need] as const] : [];
  }),
);

/**
 * 이 준비물이 필요한 장소 종류. 규칙이 없으면 `null` — 장소를 안 가리는 준비물이라는 뜻이다
 * (기내용 가방·유모차처럼 오가는 길의 물건). 준비물 화면의 묶음(`itemGroups.ts`)이 이 값으로
 * 갈리므로, 규칙 표 한 곳만 고치면 묶음도 따라온다.
 */
export const placeTypesNeeding = (item: TItem): TPlaceType[] | null =>
  needsByItemId.get(item.id)?.types ?? null;

const isNeededAt = (item: TItem, place: TPlaceEntry): boolean => {
  const need = needsByItemId.get(item.id);
  if (!need) return false;
  if (!need.types.includes(place.type)) return false;
  return need.when ? need.when(place) : true;
};

/**
 * 이 장소 하나에 필요한 준비물. 계절 필터를 먼저 통과시킨다 —
 * 홈·준비물 화면과 같은 기준이어야 세 화면이 다른 숫자를 보여주지 않는다.
 */
export const itemsNeededAt = (place: TPlaceEntry, season: TSeasonFilter): TItem[] =>
  visibleItems(season).filter((item) => isNeededAt(item, place));

/** 여러 곳(= 저장한 곳)에 가려면 필요한 준비물의 합집합. 순서는 언제나 ITEMS 순서다. */
export const itemsNeededForTrip = (places: TPlaceEntry[], season: TSeasonFilter): TItem[] =>
  visibleItems(season).filter((item) => places.some((place) => isNeededAt(item, place)));

/**
 * 이 장소에 필요한데 아직 없는 준비물.
 *
 * 숙소는 **자기 자신의** 구비 용품을 본다. 준비물 화면의 전역 선택을 보면, 지금 보고 있는
 * 숙소와 상관없는 다른 숙소의 용품 때문에 경고가 사라지거나 생긴다.
 */
export const missingItemsAt = (
  place: TPlaceEntry,
  season: TSeasonFilter,
  checkedItemIds: string[],
): TItem[] => {
  const needed = itemsNeededAt(place, season);
  const provided = resolveProvidedItemIds(place.stay?.amenitiesText, needed);
  return needed.filter((item) => !checkedItemIds.includes(item.id) && !provided.has(item.id));
};

/** 저장한 숙소들이 대신 갖고 있는 준비물. 한 곳이라도 갖고 있으면 챙긴 것으로 본다. */
export const tripProvidedItemIds = (places: TPlaceEntry[], items: TItem[]): Set<string> => {
  const provided = new Set<string>();
  for (const place of places) {
    for (const id of resolveProvidedItemIds(place.stay?.amenitiesText, items)) provided.add(id);
  }
  return provided;
};
