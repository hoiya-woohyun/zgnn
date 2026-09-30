import { describe, expect, it } from 'vitest';
import { collapseProgress, stickyMorphProgress } from './stickyMorph';

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
