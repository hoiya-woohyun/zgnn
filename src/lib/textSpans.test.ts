import { describe, expect, it } from 'vitest';
import { spansOf } from './textSpans';

describe('spansOf', () => {
  it('칠할 구간이 없으면 한 조각', () => {
    expect(spansOf('목줄 필수', [])).toEqual([{ text: '목줄 필수', mark: false }]);
  });

  it('구간 앞뒤를 칠하지 않은 조각으로 남긴다', () => {
    expect(spansOf('최대 7kg 까지', [{ start: 3, end: 6 }])).toEqual([
      { text: '최대 ', mark: false },
      { text: '7kg', mark: true },
      { text: ' 까지', mark: false },
    ]);
  });

  it('겹치거나 맞닿은 구간은 합친다 — 글자가 두 번 찍히지 않는다', () => {
    const spans = spansOf('1박 3만원 추가', [
      { start: 3, end: 6 },
      { start: 3, end: 6 },
      { start: 5, end: 6 },
      { start: 2, end: 3 },
    ]);
    expect(spans.map((span) => span.text).join('')).toBe('1박 3만원 추가');
    expect(spans.filter((span) => span.mark)).toEqual([{ text: ' 3만원', mark: true }]);
  });

  it('빈 구간·줄 밖 구간은 버리고 순서와 상관없이 정렬한다', () => {
    expect(spansOf('abcdef', [{ start: 4, end: 99 }, { start: 2, end: 2 }, { start: 0, end: 1 }])).toEqual([
      { text: 'a', mark: true },
      { text: 'bcd', mark: false },
      { text: 'ef', mark: true },
    ]);
  });
});
