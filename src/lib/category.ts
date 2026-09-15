/**
 * 네이버 카테고리 문자열을 화면에 쓸 라벨로 다듬는다.
 *
 * 예전에는 카테고리마다 이모지를 하나씩 매핑해 사진 자리를 채웠지만, 이제는 종류별
 * 선화 아이콘(src/components/icons/placeTypeIcon.ts) 하나로 통일했다.
 * 카테고리는 '카페,디저트' 처럼 원문을 그대로 글자로 보여 준다 — 아이콘으로 뭉뚱그리는 것보다
 * 원문이 더 많은 것을 알려주기 때문이다.
 */

/** 카테고리가 비어 있으면(10곳) 종류 이름으로 대신한다. 메타 줄이 비지 않게. */
export const categoryLabel = (category: string | undefined, typeLabel: string): string =>
  category && category.trim() ? category : typeLabel;
