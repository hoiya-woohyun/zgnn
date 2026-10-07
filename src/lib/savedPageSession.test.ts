import { beforeEach, describe, expect, it } from 'vitest';
import {
  enterSavedPage,
  leaveSavedPage,
  listSavedPage,
  rememberUnsavedOnSavedPage,
  takeUnsavedOnSavedPage,
} from './savedPageSession';

describe('listSavedPage', () => {
  it('들어올 때 있던 id 는 하트를 꺼도 그 자리에 남는다', () => {
    expect(listSavedPage(['a', 'b', 'c'], ['a', 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('그 사이 새로 저장된 id 는 뒤에 붙는다', () => {
    expect(listSavedPage(['a'], ['a', 'z'])).toEqual(['a', 'z']);
  });

  it('다시 켠 id 는 뒤에 중복으로 붙지 않는다', () => {
    expect(listSavedPage(['a', 'b'], ['b', 'a'])).toEqual(['a', 'b']);
  });
});

describe('저장 화면의 끈 하트 기억', () => {
  beforeEach(() => leaveSavedPage());

  it('화면 안에서 껐다 켜면 자리와 메모를 한 번만 돌려준다', () => {
    enterSavedPage(['a', 'b']);
    rememberUnsavedOnSavedPage('a', { index: 0, note: '1일차' });
    expect(takeUnsavedOnSavedPage('a')).toEqual({ index: 0, note: '1일차' });
    expect(takeUnsavedOnSavedPage('a')).toBeUndefined();
  });

  it('화면 밖에서는 기억하지 않는다', () => {
    rememberUnsavedOnSavedPage('a', { index: 0 });
    expect(takeUnsavedOnSavedPage('a')).toBeUndefined();
  });

  it('나갔다 들어오면 이전 방문의 기억은 없다', () => {
    enterSavedPage(['a']);
    rememberUnsavedOnSavedPage('a', { index: 0 });
    leaveSavedPage();
    enterSavedPage([]);
    expect(takeUnsavedOnSavedPage('a')).toBeUndefined();
  });
});
