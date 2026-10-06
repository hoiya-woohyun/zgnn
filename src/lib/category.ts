/**
 * 네이버 카테고리 문자열을 화면에 쓸 라벨로 다듬는다.
 *
 * 예전에는 카테고리마다 이모지를 하나씩 매핑해 사진 자리를 채웠지만, 이제는 종류별
 * 선화 아이콘(src/components/icons/placeTypeIcon.tsx) 하나로 통일했다.
 * 카테고리는 '카페,디저트' 처럼 원문을 그대로 글자로 보여 준다 — 아이콘으로 뭉뚱그리는 것보다
 * 원문이 더 많은 것을 알려주기 때문이다.
 */

import { categoryForType } from '../../scripts/lib/placeCategory.mjs';

/**
 * 카테고리가 비어 있으면(10곳) 종류 이름으로 대신한다. 메타 줄이 비지 않게.
 *
 * 원문의 쉼표 구분(`카페,디저트` · `백반,가정식`)은 **표시에서만** `·` 로 바꾼다(12 U3.6) — 띄어쓰기 없는 쉼표는 한 단어처럼
 * 붙어 읽히고, 메타 줄의 ` · `(읍면 · 업종)과 겹치지 않게 앞뒤를 붙여 쓴다. 저장된 값·검색은 원문 그대로다.
 *
 * 종류(`type`)와 어긋나는 업종(식당의 `카페,디저트`)도 종류 이름으로 대신한다 — 규칙의 정본은 `scripts/lib/placeCategory.mjs`
 * 이고 분석·승인 반영도 같은 규칙으로 업종을 거른다. 화면에서 한 번 더 거르는 것은 그 전에 들어간 시드 행 때문이다.
 */
export const categoryLabel = (category: string | undefined, typeLabel: string, type?: string): string => {
  const fitting = type ? categoryForType(category, type) : category?.trim();
  return fitting
    ? fitting
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)
        .join('·')
    : typeLabel;
};
