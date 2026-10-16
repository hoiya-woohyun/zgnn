import { describe, expect, it } from 'vitest';
import {
  PULL_DISMISS_DISTANCE_PX,
  PULL_DISMISS_VELOCITY,
  dismissesSheetPull,
  takesSheetPull,
} from './placesPageFilterSheetPull';

const move = (over: Partial<Parameters<typeof takesSheetPull>[0]> = {}) => ({
  dx: 0,
  dy: 8,
  inScroller: true,
  scrollTop: 0,
  cancelable: true,
  ...over,
});

describe('takesSheetPull — 첫 touchmove 에서 시트 끌기로 잡을지', () => {
  it('목록이 맨 위일 때 아래로 끌면 시트를 끈다', () => {
    expect(takesSheetPull(move())).toBe(true);
  });

  it('목록이 내려가 있으면 아래로 끌어도 목록 몫이다(스크롤과 다투지 않는다)', () => {
    expect(takesSheetPull(move({ scrollTop: 169 }))).toBe(false);
  });

  it('맨 위에서 위로 쓸면 목록이 내려가야 한다', () => {
    expect(takesSheetPull(move({ dy: -8 }))).toBe(false);
    expect(takesSheetPull(move({ dy: 0 }))).toBe(false);
  });

  it('옆으로 더 많이 움직였으면 잡지 않는다', () => {
    expect(takesSheetPull(move({ dx: 12, dy: 6 }))).toBe(false);
    expect(takesSheetPull(move({ dx: -12, dy: 6 }))).toBe(false);
    // 같으면 세로로 친다.
    expect(takesSheetPull(move({ dx: 6, dy: 6 }))).toBe(true);
  });

  it('목록 밖(제목·하단 줄)에서 시작하면 목록이 내려가 있어도 끈다', () => {
    expect(takesSheetPull(move({ inScroller: false, scrollTop: 169 }))).toBe(true);
  });

  it('브라우저가 이미 스크롤로 가져갔으면(취소 불가) 잡지 않는다', () => {
    expect(takesSheetPull(move({ cancelable: false }))).toBe(false);
    expect(takesSheetPull(move({ inScroller: false, cancelable: false }))).toBe(false);
  });

  it('iOS 고무줄로 scrollTop 이 음수여도 맨 위로 친다', () => {
    expect(takesSheetPull(move({ scrollTop: -12 }))).toBe(true);
    expect(takesSheetPull(move({ scrollTop: 0.5 }))).toBe(true);
    expect(takesSheetPull(move({ scrollTop: 1 }))).toBe(false);
  });
});

describe('dismissesSheetPull — 놓았을 때 닫을지(base 손잡이와 같은 문턱)', () => {
  it('문턱보다 멀리 끌었으면 닫는다', () => {
    expect(dismissesSheetPull(PULL_DISMISS_DISTANCE_PX + 1, 0)).toBe(true);
    expect(dismissesSheetPull(PULL_DISMISS_DISTANCE_PX, 0)).toBe(false);
  });

  it('짧아도 빠르게 튕기면 닫는다', () => {
    expect(dismissesSheetPull(30, PULL_DISMISS_VELOCITY + 0.1)).toBe(true);
    expect(dismissesSheetPull(30, PULL_DISMISS_VELOCITY)).toBe(false);
  });

  it('위로 되돌려 놓으면(속도 음수) 닫지 않는다', () => {
    expect(dismissesSheetPull(40, -1.2)).toBe(false);
  });
});
