import { describe, expect, it } from 'vitest';
import { placesPageHardFold } from './placesPageHardFold';

type TRow = { id: string; hard: boolean };
const row = (id: string, hard = false): TRow => ({ id, hard });
const isHard = (place: TRow) => place.hard;
const ids = (rows: TRow[]) => rows.map((place) => place.id);

describe('placesPageHardFold', () => {
  it('어려운 곳을 끝으로 접고, 각 쪽은 들어온 순서 그대로다', () => {
    const fold = placesPageHardFold([row('a'), row('h1', true), row('b'), row('h2', true), row('c')], isHard);
    expect(ids(fold.shown)).toEqual(['a', 'b', 'c']);
    expect(ids(fold.folded)).toEqual(['h1', 'h2']);
  });

  it('어려운 곳이 없으면 접지 않는다', () => {
    const fold = placesPageHardFold([row('a'), row('b')], isHard);
    expect(ids(fold.shown)).toEqual(['a', 'b']);
    expect(fold.folded).toEqual([]);
  });

  it('전부 어려우면 접지 않는다 — 빈 목록 위에 버튼만 남지 않게', () => {
    const fold = placesPageHardFold([row('h1', true), row('h2', true)], isHard);
    expect(ids(fold.shown)).toEqual(['h1', 'h2']);
    expect(fold.folded).toEqual([]);
  });

  it('빈 목록은 빈 채로', () => {
    expect(placesPageHardFold([], isHard)).toEqual({ shown: [], folded: [] });
  });
});
