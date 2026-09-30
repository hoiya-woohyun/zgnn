import { placeTypesNeeding } from './itemNeeds';
import type { TItem } from '../types';

/**
 * 준비물을 "어디서 쓰는가" 로 묶는다.
 *
 * 준비물 화면의 **유일한** 가름이다. v2 까지는 "저장한 곳에 필요해요 / 그 밖에" 라는 급한 순서가
 * 겉에 있고 이 묶음이 그 안의 가름이었는데, 목록이 저장한 곳에 따라 좁혀지지 않게 되면서
 * (ADR-009 v3) 이 묶음만 남았다. 짐 싸는 사람에게는 "숙소 것은 다 챙겼나" 가 더 쓸모 있는 질문이다.
 *
 * 묶음은 규칙 표(`ITEM_NEEDS`)에서 **파생**된다. 준비물마다 묶음을 따로 적어 두면 규칙과
 * 묶음이 서로 다른 말을 하기 시작한다 — 식당 규칙을 지웠는데 여전히 '식당·카페에서' 아래
 * 남아 있는 식이다. 규칙이 곧 묶음이면 그런 일이 없다.
 */
export type TItemGroupId = 'travel' | 'everywhere' | 'eatingOut' | 'stay';

export const ITEM_GROUP_LABEL: Record<TItemGroupId, string> = {
  travel: '오가는 길에',
  everywhere: '어디를 가든',
  eatingOut: '식당·카페에서',
  stay: '숙소에서',
};

/**
 * 묶음 머리글 아래 한 줄 — "언제 꺼내 쓰는 물건인가".
 *
 * 준비물 화면의 유일한 가름이 이 묶음이라(ADR-009 v3) 이름표만으로는 부족하다. 특히 '오가는 길에' 는
 * 규칙이 없어 떨어진 묶음이라, 왜 어느 장소에도 안 걸리는지를 여기서 말해 준다.
 */
export const ITEM_GROUP_HINT: Record<TItemGroupId, string> = {
  travel: '비행기·배·차에서 쓰는 것이라, 어느 장소에도 따로 표시되지 않아요.',
  everywhere: '숙소·식당·카페 어디를 가든 필요해요.',
  eatingOut: '가게 안에서 강아지와 함께 기다릴 때 필요해요.',
  stay: '숙소에서 쉬고 잘 때 필요해요.',
};

/** 여행의 시간 순서대로다 — 집을 나서고, 돌아다니고, 먹고, 잔다. */
export const ITEM_GROUP_ORDER: TItemGroupId[] = ['travel', 'everywhere', 'eatingOut', 'stay'];

/**
 * 규칙이 없는 준비물은 '오가는 길에' 로 본다.
 *
 * 지금 그것에 해당하는 것은 기내용 가방과 유모차뿐이고, 둘 다 장소가 아니라 **이동**에
 * 걸린 물건이라 규칙 표에 일부러 넣지 않았다(`itemNeeds.ts` 머리말). 다만 이 기본값은
 * "규칙을 아직 안 적은 준비물" 과 구분되지 않는다 — 준비물을 새로 늘리면서 장소 규칙이
 * 필요하다면 `ITEM_NEEDS` 에 줄을 더해야 하고, 안 그러면 조용히 여기로 떨어진다.
 */
export const groupOfItem = (item: TItem): TItemGroupId => {
  const types = placeTypesNeeding(item);
  if (!types) return 'travel';
  if (types.length >= 3) return 'everywhere';
  if (types.includes('stay')) return 'stay';
  return 'eatingOut';
};

export type TItemGroup = { id: TItemGroupId; label: string; items: TItem[] };

/** 준비물을 묶음으로 가른다. 빈 묶음은 빠지고, 묶음 순서는 `ITEM_GROUP_ORDER` 고정이다. */
export const groupItems = (items: TItem[]): TItemGroup[] =>
  ITEM_GROUP_ORDER.flatMap((id) => {
    const grouped = items.filter((item) => groupOfItem(item) === id);
    return grouped.length > 0 ? [{ id, label: ITEM_GROUP_LABEL[id], items: grouped }] : [];
  });
