/**
 * 터치가 **가로로 스크롤되는 줄** 안에서 시작했나(22 A·B review R-10). 순수 — DOM 은 `TScrollNode` 로만 받는다(테스트에 jsdom 이 없다).
 *
 * 그런 줄(둘러보기 검색칸 밑 칩 줄 · md 조건 판의 줄 · 지도 종류 칩 줄)에서 시작한 가로 손짓은 **그 줄의 것**이다 — 좌우 스와이프(셸의 탭 넘기기 ·
 * 둘러보기 종류 넘기기)가 가져가지 않는다. 줄이 끝까지 밀려 더 갈 데가 없어도 그렇다: 끝에서만 화면이 넘어가면 칩을 훑던 손가락이
 * 끝에 닿는 순간 다른 탭(홈·지도)으로 날아갔다(숙소에서 칩 줄을 오른쪽으로 되돌리다 홈으로, 카페에서 왼쪽으로 밀다 지도로).
 * 넘치지 않는 줄(칩이 몇 개 없어 다 보이는 줄)은 스크롤이 없어 거기서의 손짓은 화면 넘기기 그대로다.
 *
 * `stop` 에 닿으면 멈춘다 — 인식기가 붙은 표면 밖(문서 전체)은 보지 않는다.
 */
export type TScrollNode = {
  scrollWidth: number;
  clientWidth: number;
  parentElement: TScrollNode | null;
};

export const startsInHorizontalScroller = (
  start: TScrollNode | null,
  stop: TScrollNode | null,
  overflowXOf: (node: TScrollNode) => string,
): boolean => {
  for (let node = start; node && node !== stop; node = node.parentElement) {
    // 1px 는 소수 폭 반올림 몫 — 넘치지 않는 줄을 스크롤 줄로 오인하지 않게.
    if (node.scrollWidth <= node.clientWidth + 1) continue;
    const overflowX = overflowXOf(node);
    if (overflowX === 'auto' || overflowX === 'scroll') return true;
  }
  return false;
};

/** 브라우저 이벤트에서 — 표면(`stop`) 안의 요소만, 계산된 `overflow-x` 로. */
export const eventStartsInHorizontalScroller = (target: EventTarget | null, stop: Element | null): boolean =>
  typeof Element !== 'undefined' &&
  target instanceof Element &&
  startsInHorizontalScroller(target, stop, (node) => getComputedStyle(node as Element).overflowX);
