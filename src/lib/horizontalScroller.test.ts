import { describe, expect, it } from 'vitest';
import { startsInHorizontalScroller, type TScrollNode } from './horizontalScroller';

type TNode = TScrollNode & { overflowX: string };

const node = (overflowX: string, scrollWidth: number, clientWidth: number, parentElement: TNode | null): TNode => ({
  overflowX,
  scrollWidth,
  clientWidth,
  parentElement,
});
const overflowOf = (n: TScrollNode) => (n as TNode).overflowX;

describe('startsInHorizontalScroller — 가로 스크롤 줄 안에서 시작한 터치(22 A·B review R-10)', () => {
  const surface = node('visible', 390, 390, null);
  const main = node('visible', 390, 390, surface);

  it('넘치는 overflow-x 줄 안의 칩에서 시작하면 그 줄의 것 — 줄 끝에 닿아 있어도(스크롤 위치는 보지 않는다)', () => {
    const row = node('auto', 573, 390, main);
    const chip = node('visible', 74, 74, row);
    const label = node('visible', 30, 30, chip);
    expect(startsInHorizontalScroller(label, surface, overflowOf)).toBe(true);
    expect(startsInHorizontalScroller(row, surface, overflowOf)).toBe(true);
  });

  it('넘치지 않는 줄·가로 스크롤이 아닌 줄(overflow hidden·clip·visible)은 화면 넘기기 그대로', () => {
    const fits = node('auto', 390, 390, main);
    expect(startsInHorizontalScroller(node('visible', 74, 74, fits), surface, overflowOf)).toBe(false);
    // 소수 폭 반올림 1px 는 넘침이 아니다.
    expect(startsInHorizontalScroller(node('auto', 391, 390, main), surface, overflowOf)).toBe(false);
    for (const overflowX of ['hidden', 'clip', 'visible']) {
      expect(startsInHorizontalScroller(node(overflowX, 900, 390, main), surface, overflowOf), overflowX).toBe(false);
    }
    expect(startsInHorizontalScroller(node('scroll', 900, 390, main), surface, overflowOf)).toBe(true);
  });

  it('표면(stop) 밖은 보지 않는다 · 시작점이 없으면 아니다', () => {
    const outer = node('auto', 900, 390, null);
    const inner = node('visible', 390, 390, outer);
    const leaf = node('visible', 10, 10, inner);
    expect(startsInHorizontalScroller(leaf, inner, overflowOf)).toBe(false);
    expect(startsInHorizontalScroller(leaf, null, overflowOf)).toBe(true);
    expect(startsInHorizontalScroller(null, null, overflowOf)).toBe(false);
  });
});
