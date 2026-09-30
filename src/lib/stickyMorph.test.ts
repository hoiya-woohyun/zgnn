import { describe, expect, it } from 'vitest';
import { barRevealRange, collapseProgress, collapseRange, stickyMorphProgress, stickyMorphRange } from './stickyMorph';

describe('stickyMorphProgress — 붙는 순간부터 스크롤한 거리만큼 0 → 1', () => {
  // 노치 기기(인셋 47px), 접히는 거리 57px(줄 56 + 선 1).
  const INSET = 47;
  const DISTANCE = 57;

  it('센티넬이 인셋보다 아래에 있으면(아직 안 붙음) 0 — 진입 때는 지금 모습 그대로', () => {
    expect(stickyMorphProgress(INSET + 12, INSET, DISTANCE)).toBe(0);
    expect(stickyMorphProgress(INSET, INSET, DISTANCE)).toBe(0);
  });

  it('붙은 뒤로는 올라간 거리에 비례한다', () => {
    expect(stickyMorphProgress(INSET - DISTANCE / 2, INSET, DISTANCE)).toBeCloseTo(0.5);
  });

  it('접히는 거리를 넘으면 1 에서 멈춘다 — 아래로 계속 내려도 더 변하지 않는다', () => {
    expect(stickyMorphProgress(INSET - DISTANCE, INSET, DISTANCE)).toBe(1);
    expect(stickyMorphProgress(-5000, INSET, DISTANCE)).toBe(1);
  });

  it('같은 위치면 같은 값이다 — 되돌아 스크롤하면 같은 길을 되짚는다', () => {
    const down = stickyMorphProgress(10, 0, DISTANCE);
    const up = stickyMorphProgress(10, 0, DISTANCE);
    expect(up).toBe(down);
  });

  it('거리를 아직 못 쟀으면(0) 붙었는지만 본다 — 0 으로 나누지 않는다', () => {
    expect(stickyMorphProgress(10, 0, 0)).toBe(0);
    expect(stickyMorphProgress(-1, 0, 0)).toBe(1);
  });
});

describe('collapseProgress — 홈 히어로: 제자리에서 붙는 자리까지 0 → 1', () => {
  // 제자리 24px(인셋 0), 붙는 자리 = 인셋 + 헤더 56 - 히어로 248 = -192.
  const REST = 24;
  const PINNED = -192;

  it('스크롤 0 이면 0, 붙는 자리에 닿으면 1, 그 뒤로도 1', () => {
    expect(collapseProgress(REST, REST, PINNED)).toBe(0);
    expect(collapseProgress(PINNED, REST, PINNED)).toBe(1);
    expect(collapseProgress(PINNED - 500, REST, PINNED)).toBe(1);
  });

  it('중간은 올라간 거리에 비례한다 — 붙기 전부터 접힌다', () => {
    expect(collapseProgress((REST + PINNED) / 2, REST, PINNED)).toBeCloseTo(0.5);
  });

  it('제자리보다 아래(당겨 내림·엿보기)는 0 이다', () => {
    expect(collapseProgress(REST + 40, REST, PINNED)).toBe(0);
  });
});

describe('스크롤 구동 구간 — JS 진행도와 같은 스크롤 위치에서 같은 값', () => {
  // 구간 [from, to] 에서 스크롤 S 의 진행도. 브라우저가 animation-range 로 하는 계산이다.
  const progressAt = ({ from, to }: { from: number; to: number }, scroll: number) =>
    Math.min(1, Math.max(0, (scroll - from) / (to - from)));

  it('stickyMorphRange 는 stickyMorphProgress 와 모든 스크롤 위치에서 일치한다', () => {
    const OFFSET = 88; // 스크롤 0 에서 센티넬의 위치
    const range = stickyMorphRange(OFFSET, 47, 57);
    for (const scroll of [0, 30, 41, 60, 69.5, 98, 200]) {
      expect(progressAt(range, scroll)).toBeCloseTo(stickyMorphProgress(OFFSET - scroll, 47, 57));
    }
  });

  it('collapseRange 는 collapseProgress 와 모든 스크롤 위치에서 일치한다', () => {
    const OFFSET = 71;
    const PINNED = -150;
    const range = collapseRange(OFFSET, PINNED);
    for (const scroll of [0, 50, 110.5, 221, 400]) {
      expect(progressAt(range, scroll)).toBeCloseTo(collapseProgress(OFFSET - scroll, OFFSET, PINNED));
    }
  });

  it('길이가 0 인 구간은 만들지 않는다 — 0 으로 나누는 계산을 브라우저에 넘기지 않는다', () => {
    expect(stickyMorphRange(10, 0, 0).to).toBeGreaterThan(stickyMorphRange(10, 0, 0).from);
    expect(collapseRange(0, 0).to).toBeGreaterThan(0);
  });
});

describe('barRevealRange — h1 이 헤더 밑으로 들어가는 동안 제목이 올라온다', () => {
  // 헤더 아랫변 104(인셋 47 + 줄 56 + 선 1), h1 은 스크롤 0 에서 160 에 있고 높이 32.
  const range = barRevealRange(160, 32, 104);

  it('h1 윗변이 헤더 아랫변에 닿는 스크롤에서 시작한다', () => {
    expect(range.from).toBe(56);
  });

  it('h1 이 다 가려지는 스크롤(높이만큼 더)에서 끝난다 — 옛 "h1 아랫변이 헤더 아랫변을 지나면" 과 같은 순간이다', () => {
    expect(range.to).toBe(88);
  });

  it('h1 높이를 못 쟀으면(0) 1px 구간 — 길이 0 구간을 만들지 않는다', () => {
    const empty = barRevealRange(160, 0, 104);
    expect(empty.to).toBeGreaterThan(empty.from);
  });
});
