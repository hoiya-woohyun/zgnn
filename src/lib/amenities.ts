/**
 * 숙소 구비 용품 → 준비물 매핑.
 *
 * ✅ 규칙은 여기서 조정한다. AMENITY_RULES 한 줄이 규칙 하나다.
 *    왼쪽 keywords 중 하나라도 숙소의 amenitiesText 에 들어 있으면,
 *    오른쪽 itemName 과 이름이 같은 준비물을 '숙소에 있어요' 로 표시한다.
 *
 * itemName 은 src/data/items.json 의 name 과 정확히 일치해야 한다.
 */
import type { TItem } from '../types';

export const AMENITY_RULES: { keywords: string[]; itemName: string }[] = [
  { keywords: ['식기', '밥그릇'], itemName: '휴대용 물병/밥그릇' },
  // '배변 패드' 는 배변봉투와 쓰임이 다르다(실내 흡수 vs 산책 중 수거).
  // 패드가 있다고 봉투를 빼면 산책 나가서 곤란해진다.
  { keywords: ['침대', '쿠션'], itemName: '얇은 이불/담요' },
  { keywords: ['담요', '이불'], itemName: '얇은 이불/담요' },
  { keywords: ['튜브'], itemName: '강아지 튜브' },
  { keywords: ['간식'], itemName: '오래 씹을 수 있는 간식' },
  // '샴푸' 는 대응하는 준비물이 목록에 없어서 매핑하지 않는다.
  // '기본적인 용품 구비' 같은 포괄 표현도 매핑하지 않는다 — 무엇이 있는지 알 수 없어서,
  // 실제로는 없는 물건을 챙기지 않게 만드는 편이 더 위험하다.
];

/** 이 문장으로 시작하면 구비 용품이 없거나 확인되지 않은 것으로 본다. */
const NO_AMENITY = /^\s*(없음|정보\s*없음)/;

/**
 * 숙소의 amenitiesText 로 '숙소에 있어요' 로 표시할 준비물 id 집합을 만든다.
 */
export const resolveProvidedItemIds = (
  amenitiesText: string | undefined,
  items: TItem[],
): Set<string> => {
  const provided = new Set<string>();
  if (!amenitiesText || NO_AMENITY.test(amenitiesText)) return provided;

  for (const rule of AMENITY_RULES) {
    if (!rule.keywords.some((keyword) => amenitiesText.includes(keyword))) continue;
    const item = items.find((candidate) => candidate.name === rule.itemName);
    if (item) provided.add(item.id);
  }
  return provided;
};
