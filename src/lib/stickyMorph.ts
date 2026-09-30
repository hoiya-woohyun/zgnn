/** `StickyMorphTitle`(src/components/layout/stickyMorphTitle.tsx)의 접힘 계산. */

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/**
 * 접힘 진행도 — 순수. 센티넬(줄 바로 앞의 0높이 표식)의 화면상 위치로 계산한다.
 *
 * 줄은 `bleed-top-0` 이라 자기 자리보다 인셋만큼 위에서 시작한다. 그래서 **센티넬이 인셋 높이까지 올라온 순간**이
 * 줄의 윗변이 화면 맨 위에 닿는 순간(= 붙는 순간)이고, 거기서부터 `distance` 만큼 더 올라가면 다 접힌다.
 *
 * `window.scrollY` 가 아니라 화면상 위치를 쓰는 이유: 셸이 옆 화면을 엿보기로 그릴 때(ADR-014) 그 화면은
 * 문서 스크롤과 무관한 자리에 있다. 화면상 위치는 어디에 그려지든 그 자리 그대로의 답을 준다.
 */
export function stickyMorphProgress(sentinelTop: number, insetTop: number, distance: number): number {
  if (distance <= 0) return sentinelTop <= insetTop ? 1 : 0;
  return clamp01((insetTop - sentinelTop) / distance);
}

/**
 * 홈 히어로(`homePageHero.tsx`)의 접힘 진행도 — 순수. 센티넬이 `restTop`(스크롤 0 일 때의 화면상 위치)에서
 * `pinnedTop`(히어로가 헤더 높이만 남기고 붙는 위치)까지 올라가는 동안 0 → 1.
 *
 * 준비물의 `stickyMorphProgress` 와 달리 **붙기 전부터** 접힌다 — 히어로는 카드 전체가 헤더로 줄어드는 것이라,
 * 붙는 순간 이미 헤더 모양이어야 한다(붙은 뒤에 접히면 250px 카드가 한동안 화면 위를 덮는다).
 */
export function collapseProgress(sentinelTop: number, restTop: number, pinnedTop: number): number {
  const range = restTop - pinnedTop;
  if (range <= 0) return sentinelTop <= pinnedTop ? 1 : 0;
  return clamp01((restTop - sentinelTop) / range);
}

/** 스크롤 구동 애니메이션(`animation-timeline: scroll()`)의 구간 — 스크롤 오프셋 [from, to] 에서 0 → 1. */
export type TScrollMorphRange = { from: number; to: number };

/**
 * `stickyMorphProgress` 와 같은 접힘을 **스크롤 오프셋의 구간**으로 — 순수. `sentinelOffset` 은 스크롤이 0 일 때 센티넬이
 * 스크롤 상자 맨 위에서 떨어진 거리다(스크롤 S 에서 센티넬의 화면상 위치 = sentinelOffset − S).
 * 붙은 뒤로 센티넬이 1:1 로 올라가므로 두 식이 같은 답을 낸다 — 구간 밖은 애니메이션의 `fill: both` 가 0·1 로 묶는다.
 */
export function stickyMorphRange(sentinelOffset: number, insetTop: number, distance: number): TScrollMorphRange {
  const from = sentinelOffset - insetTop;
  // 거리를 못 쟀으면(0) 붙는 순간 바로 1 이 되게 — 길이 0 구간은 브라우저마다 다르게 다뤄서 1px 을 준다.
  return { from, to: from + Math.max(distance, 1) };
}

/** `collapseProgress` 와 같은 접힘을 스크롤 오프셋의 구간으로 — 순수. 스크롤 0(제자리)에서 시작해 `pinnedTop` 에 닿으면 끝난다. */
export function collapseRange(sentinelOffset: number, pinnedTop: number): TScrollMorphRange {
  return { from: 0, to: Math.max(sentinelOffset - pinnedTop, 1) };
}

/**
 * 하위 화면 헤더(`AppBar`)에 제목이 올라오는 구간 — 순수. 화면의 `<h1>` 이 헤더 밑으로 들어가는 동안이다:
 * h1 의 윗변이 헤더 아랫변에 닿을 때 시작해, h1 의 아랫변이 닿을 때 끝난다(= h1 이 다 가려진 순간 제목이 다 올라와 있다).
 * `headingOffset` 은 스크롤 0 에서 h1 윗변의 위치, `barBottom` 은 붙은 헤더의 아랫변(인셋 포함)이다.
 */
export function barRevealRange(headingOffset: number, headingHeight: number, barBottom: number): TScrollMorphRange {
  const from = headingOffset - barBottom;
  return { from, to: from + Math.max(headingHeight, 1) };
}
