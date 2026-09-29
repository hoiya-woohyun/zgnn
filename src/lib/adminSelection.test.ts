import { describe, expect, it } from 'vitest';
import {
  allSelected,
  clearKeys,
  EMPTY_SELECTION,
  selectKeys,
  summarizeBulkReject,
  toggleSelected,
  visibleSelection,
} from './adminSelection';

describe('toggleSelected', () => {
  it('없으면 켜고 있으면 끈다', () => {
    const on = toggleSelected(EMPTY_SELECTION, 'a');
    expect([...on]).toEqual(['a']);
    expect([...toggleSelected(on, 'a')]).toEqual([]);
  });

  it('원본을 고치지 않는다 — 상태로 들고 있어 리렌더가 이것에 달렸다', () => {
    const before = new Set(['a']);
    toggleSelected(before, 'b');
    expect([...before]).toEqual(['a']);
  });
});

describe('selectKeys · clearKeys', () => {
  it('합집합 · 차집합', () => {
    expect([...selectKeys(new Set(['a']), ['b', 'c'])].sort()).toEqual(['a', 'b', 'c']);
    expect([...clearKeys(new Set(['a', 'b', 'c']), ['b', 'c'])]).toEqual(['a']);
  });

  /*
   * 같은 객체를 돌려주는 규약. 이것이 깨지면 `pruneSelection` 을 부르는 효과가 스스로 만든 새 Set 을 보고
   * 다시 돌아 무한 루프가 된다 — 빌드·테스트는 통과하고 화면만 멈춘다.
   */
  it('바꿀 것이 없으면 같은 객체', () => {
    const selection = new Set(['a', 'b']);
    expect(selectKeys(selection, ['a'])).toBe(selection);
    expect(clearKeys(selection, ['z'])).toBe(selection);
  });
});

describe('visibleSelection', () => {
  // 화면에 없는 것을 세면 "N묶음 골랐어요" 가 거짓말을 하고, 그대로 반려하면 이미 처리된 묶음을 다시 부른다.
  it('목록에 있는 것만, 목록 순서대로', () => {
    expect(visibleSelection(new Set(['c', 'a', 'z']), ['a', 'b', 'c'])).toEqual(['a', 'c']);
  });

  // 집합에 남겨 두는 것이 의도다 — 걸러 보기를 껐다 켜면 고른 것이 돌아온다.
  it('사라진 키는 결과에서만 빠지고 집합은 그대로', () => {
    const selection = new Set(['a', 'gone']);
    expect(visibleSelection(selection, ['a'])).toEqual(['a']);
    expect(selection.has('gone')).toBe(true);
  });
});

describe('allSelected', () => {
  it('전부 들어 있어야 참', () => {
    expect(allSelected(new Set(['a', 'b']), ['a', 'b'])).toBe(true);
    expect(allSelected(new Set(['a']), ['a', 'b'])).toBe(false);
  });

  // 고를 것이 없는데 '전부 골랐다' 면 버튼이 눌린 모습으로 굳어, 누르면 아무 일도 안 나는 자리가 된다.
  it('빈 목록은 거짓', () => {
    expect(allSelected(new Set(['a']), [])).toBe(false);
  });
});

describe('summarizeBulkReject', () => {
  it('전부 성공 · 전부 실패 · 반반을 각각 다르게 말한다', () => {
    expect(summarizeBulkReject(141, 0)).toBe('141묶음을 반려했어요');
    expect(summarizeBulkReject(0, 3)).toBe('3묶음을 반려하지 못했어요 — 그대로 남겨 뒀어요');
    expect(summarizeBulkReject(138, 3)).toBe('138묶음 반려 · 3묶음 실패 — 실패한 것만 목록에 남겨 뒀어요');
  });
});
