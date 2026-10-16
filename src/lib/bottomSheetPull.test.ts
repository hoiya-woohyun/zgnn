import { describe, expect, it } from 'vitest';
import {
  SHEET_DISMISS_DISTANCE_PX,
  SHEET_DISMISS_VELOCITY,
  dismissesSheetPull,
  scrollTopAbove,
  takesSheetPull,
} from './bottomSheetPull';

const move = (over: Partial<Parameters<typeof takesSheetPull>[0]> = {}) => ({
  dx: 0,
  dy: 8,
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

  it('브라우저가 이미 스크롤로 가져갔으면(취소 불가) 잡지 않는다', () => {
    expect(takesSheetPull(move({ cancelable: false }))).toBe(false);
  });

  it('iOS 고무줄로 scrollTop 이 음수여도 맨 위로 친다', () => {
    expect(takesSheetPull(move({ scrollTop: -12 }))).toBe(true);
    expect(takesSheetPull(move({ scrollTop: 0.5 }))).toBe(true);
    expect(takesSheetPull(move({ scrollTop: 1 }))).toBe(false);
  });
});

type TNode = { scrollTop: number; parentElement: TNode | null };
const node = (scrollTop: number, parentElement: TNode | null): TNode => ({ scrollTop, parentElement });

describe('scrollTopAbove — 닿은 곳 위로 내려가 있는 스크롤', () => {
  // 문서(페이지는 내려 본 채 잠겨 있다) > 시트 본문(base 칸) > 필터 시트 세로 묶음 > 조건 줄(스크롤) > 칩
  const page = node(1200, null);
  const content = node(0, page);
  const column = node(0, content);
  const scroller = node(169, column);
  const chip = node(0, scroller);
  const title = node(0, column);

  it('조건 줄이 내려가 있으면 그 안의 칩에서 닿은 끌기는 그 스크롤 몫이다', () => {
    expect(scrollTopAbove(chip, content)).toBe(169);
    expect(takesSheetPull(move({ scrollTop: scrollTopAbove(chip, content) }))).toBe(false);
  });

  it('목록 밖(제목·하단 줄)에서 시작하면 목록이 내려가 있어도 끈다', () => {
    expect(scrollTopAbove(title, content)).toBe(0);
    expect(takesSheetPull(move({ scrollTop: scrollTopAbove(title, content) }))).toBe(true);
  });

  it('base 본문 칸이 스크롤하는 시트(긴 목록)도 같은 규칙이다', () => {
    const scrolledContent = node(40, page);
    expect(scrollTopAbove(node(0, scrolledContent), scrolledContent)).toBe(40);
  });

  it('시트 본문 위(문서)의 scrollTop 은 보지 않는다 — 모달이 잠근 원래 페이지 스크롤이다', () => {
    expect(scrollTopAbove(node(0, column), content)).toBe(0);
    expect(scrollTopAbove(content, content)).toBe(0);
  });

  it('고무줄 튕김의 음수는 0 으로 친다', () => {
    const bouncing = node(-12, column);
    expect(scrollTopAbove(node(0, bouncing), content)).toBe(0);
  });
});

describe('dismissesSheetPull — 놓았을 때 닫을지(손잡이·본문 끌기가 같은 문턱)', () => {
  it('문턱보다 멀리 끌었으면 닫는다', () => {
    expect(dismissesSheetPull(SHEET_DISMISS_DISTANCE_PX + 1, 0)).toBe(true);
    expect(dismissesSheetPull(SHEET_DISMISS_DISTANCE_PX, 0)).toBe(false);
  });

  it('짧아도 빠르게 튕기면 닫는다', () => {
    expect(dismissesSheetPull(30, SHEET_DISMISS_VELOCITY + 0.1)).toBe(true);
    expect(dismissesSheetPull(30, SHEET_DISMISS_VELOCITY)).toBe(false);
  });

  it('위로 되돌려 놓으면(속도 음수) 닫지 않는다', () => {
    expect(dismissesSheetPull(40, -1.2)).toBe(false);
  });
});
