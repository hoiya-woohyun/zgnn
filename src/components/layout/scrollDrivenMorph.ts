import type { TScrollMorphRange } from '../../lib/stickyMorph';

/**
 * 스크롤을 따라 접히는 헤더(`StickyMorphTitle`·`HomePageHero`)가 함께 쓰는 DOM 쪽 도구.
 *
 * **접힘은 브라우저의 스크롤 구동 애니메이션으로 돌린다**(`animation-timeline: scroll()`, `styles/scrollMorph.css`).
 * JS 가 스크롤 이벤트마다 `--morph` 를 적는 방식은 모바일에서 두 가지로 버벅였다:
 *
 * 1. **한 박자 늦다.** 모바일은 스크롤을 합성 스레드가 먼저 움직이고, 메인 스레드의 scroll 이벤트 → rAF → 변수 쓰기가 뒤따른다.
 *    `sticky` 블록은 손가락을 바로 따라가는데 그 안의 제목 위치·크기는 늦게 따라와, 접히는 동안 제목이 위아래로 떨렸다.
 * 2. **매 프레임 다시 그렸다.** 변수로 움직이는 `transform` 도 메인 스레드가 스타일을 다시 풀어야 하고, 그때 층의 배율이
 *    바뀌었다고 보고 글자를 새 크기로 다시 래스터하는 브라우저가 있다 — 글자 폭이 프레임마다 미세하게 흔들려 "부자연스럽게" 줄었다.
 *
 * 스크롤 구동 애니메이션의 `transform`·`opacity` 는 합성 스레드가 스크롤 위치에서 곧바로 값을 뽑는다 — 스크롤과 같은 프레임에,
 * 한 번 래스터한 층을 GPU 가 늘이고 줄이기만 한다. JS 가 하는 일은 **크기가 바뀔 때 구간(스크롤 오프셋)을 재 적는 것**뿐이다.
 *
 * 지원하지 않는 브라우저(지금은 Firefox)는 예전처럼 JS 가 `--morph` 를 적고, 같은 값을 인라인 `calc(var(--morph))` 가 받는다.
 * 지원하면 애니메이션 값이 인라인 스타일을 이긴다(캐스케이드에서 애니메이션이 작성자 선언보다 위다) — 그래서 두 길을 한 마크업에 둔다.
 */
export function supportsScrollTimeline(): boolean {
  return typeof CSS !== 'undefined' && CSS.supports('animation-timeline: scroll()');
}

/**
 * 스크롤이 0 일 때 `el` 이 **가장 가까운 스크롤 상자**의 맨 위에서 떨어진 거리.
 *
 * `window.scrollY` 로만 풀면 셸의 엿보기(ADR-014)에서 틀린다 — 엿보기는 자기 스크롤 상자(`overflow: hidden`)를 갖고, 그 안의 화면은
 * 문서 스크롤과 무관하다. CSS 의 `scroll(nearest)` 도 같은 상자를 고르므로 둘이 같은 기준을 본다.
 */
export function offsetInScroller(el: HTMLElement): number {
  let node = el.parentElement;
  while (node && node !== document.body && node !== document.documentElement) {
    const { overflowY } = getComputedStyle(node);
    // `clip`·`visible` 은 스크롤 상자를 만들지 않는다(셸의 `overflow-x-clip` 이 그렇다).
    if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'hidden') {
      return el.getBoundingClientRect().top - node.getBoundingClientRect().top - node.clientTop + node.scrollTop;
    }
    node = node.parentElement;
  }
  return el.getBoundingClientRect().top + window.scrollY;
}

/** 구간을 CSS 변수로 — `scrollMorph.css` 의 `animation-range` 가 읽는다. */
export function writeMorphRange(el: HTMLElement, { from, to }: TScrollMorphRange) {
  el.style.setProperty('--morph-from', `${from}px`);
  el.style.setProperty('--morph-to', `${to}px`);
}
