/**
 * 여러 묶음을 한 번에 고르는 일의 순수 로직 — 고른 키의 집합과 그 결과를 말하는 한 줄.
 *
 * 화면(`adminPage.tsx`)이 `Set` 을 직접 주무르지 않게 여기로 뺀 이유는 둘이다.
 *  1) **집합을 깎지 않고 걸러 낸다**(`visibleSelection`). 걸러 보기를 바꾸거나 반려가 끝나 줄이 사라져도 집합에는
 *     그 키가 남는데, 남은 채로 "N묶음 골랐어요" 를 세면 **화면에 없는 것까지 센다**. 그 상태로 반려를 누르면
 *     이미 처리된 묶음을 한 번 더 부른다. 집합을 효과로 깎아 맞추는 길도 있었지만 그건 렌더가 렌더를 부르는
 *     구조라(`react-hooks/set-state-in-effect`), 세는 쪽·부르는 쪽이 **렌더 중에** 교집합을 구하는 것이 맞다.
 *  2) 집합을 바꾸지 않을 때 **같은 객체를 돌려주는 것**이 규약이다(아래 함수들이 전부 지킨다) — 상태로 들고
 *     있으므로 매번 새 `Set` 을 만들면 아무것도 안 바뀐 누름에도 목록 전체가 다시 그려진다.
 */

/** 고른 묶음 키(`TCandidateGroup.key`)들. 읽기 전용으로 다룬다 — 바꾸는 길은 아래 함수뿐이다. */
export type TSelection = ReadonlySet<string>;

export const EMPTY_SELECTION: TSelection = new Set<string>();

/** 하나를 켜고 끈다. */
export function toggleSelected(selection: TSelection, key: string): TSelection {
  const next = new Set(selection);
  if (!next.delete(key)) next.add(key);
  return next;
}

/** 주어진 키를 전부 더한다(합집합). 이미 다 들어 있으면 **같은 객체**를 돌려준다. */
export function selectKeys(selection: TSelection, keys: readonly string[]): TSelection {
  if (keys.every((key) => selection.has(key))) return selection;
  const next = new Set(selection);
  for (const key of keys) next.add(key);
  return next;
}

/** 주어진 키를 전부 뺀다(차집합). 하나도 안 들어 있으면 **같은 객체**를 돌려준다. */
export function clearKeys(selection: TSelection, keys: readonly string[]): TSelection {
  if (!keys.some((key) => selection.has(key))) return selection;
  const next = new Set(selection);
  for (const key of keys) next.delete(key);
  return next;
}

/**
 * 골라 둔 것 중 **지금 목록에 있는 것**만, 목록 순서대로. 집합에는 사라진 키가 남아 있어도 되고(그 편이
 * 걸러 보기를 껐다 켜면 돌아온다), 세는 것도 반려하는 것도 이 결과만 본다.
 */
export function visibleSelection(selection: TSelection, keys: readonly string[]): string[] {
  return keys.filter((key) => selection.has(key));
}

/**
 * 주어진 키가 **하나도 빠짐없이** 골라져 있는가. 빈 목록은 `false` 다 — 고를 것이 없는데 '전부 골랐다' 고
 * 말하면 '전부 고르기' 버튼이 눌린 모습으로 굳는다.
 */
export function allSelected(selection: TSelection, keys: readonly string[]): boolean {
  return keys.length > 0 && keys.every((key) => selection.has(key));
}

/**
 * 일괄 제외가 끝난 뒤의 한 줄. **부분 실패를 숨기지 않는 것**이 요점이다 — 141묶음 중 3묶음이 실패했는데
 * "제외했어요" 라고만 하면 운영자는 목록에 남은 3줄을 새 후보로 읽는다. `blockFailed` 는 제외는 됐는데
 * 블랙리스트 쓰기가 실패한 곳 수다 — 반려는 이미 됐다는 것과 블랙리스트는 안 들어갔다는 것을 함께 말한다.
 */
export function summarizeBulkReject(done: number, failed: number, blockFailed = 0): string {
  const blockNote = blockFailed ? ` · 블랙리스트에는 ${blockFailed}곳이 안 들어갔어요` : '';
  if (failed === 0) return `${done}곳을 제외했어요${blockNote}`;
  if (done === 0) return `${failed}곳을 제외하지 못했어요 — 그대로 남겨 뒀어요`;
  return `${done}곳 제외 · ${failed}곳 실패 — 실패한 것만 목록에 남겨 뒀어요${blockNote}`;
}
