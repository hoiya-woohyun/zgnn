/**
 * 강아지 프로필 폼의 **쓰다 만 입력** — 화면을 떠났다 돌아와도 남게(2026-10-10, todo/14 W261010.2).
 *
 * 탭바의 지도 원을 잘못 누르거나 가장자리를 끌어 뒤로 가면 폼이 언마운트되고, 돌아오면 저장된 프로필(또는 빈 폼)로
 * 다시 채워져 쓰던 것이 사라졌다. 저장은 하지 않는다(localStorage 에 안 쓴다) — 앱 안에서 오가는 동안만 기억하는
 * 것이라 새로고침하면 없다. 그 정도면 "실수로 나갔다 돌아왔다" 를 덮는다.
 *
 * 되살리는 조건은 **떠날 때 기준이던 프로필이 그대로일 때만**이다. 그 사이 다른 곳에서 프로필이 바뀌었으면(지움·되돌리기)
 * 옛 초안이 새 프로필을 덮으면 안 된다.
 */

import type { TCarrier, TDogProfile, TDogSize } from '../types';
import { MAX_DOGS } from './dogProfile';

export type TDogProfileFormRow = { name: string; weightKg: string };

export type TDogProfileForm = { rows: TDogProfileFormRow[]; carrier: TCarrier | null; sizeOverride: TDogSize | undefined };

/** 떠날 때의 폼과 그때 기준이던 프로필(`null` = 등록 전). */
export type TDogProfileDraft = { form: TDogProfileForm; base: TDogProfile | null };

/** 프로필 하나(또는 빈 폼)가 폼에 채워지는 모양 — 처음 채울 때·지운 뒤·되돌린 뒤가 같은 모양을 쓴다. */
export function dogProfileFormOf(profile: TDogProfile | null): TDogProfileForm {
  return {
    rows: profile ? profile.dogs.map((dog) => ({ name: dog.name, weightKg: String(dog.weightKg) })) : [{ name: '', weightKg: '' }],
    carrier: profile?.carrier ?? null,
    sizeOverride: profile?.sizeOverride,
  };
}

/** 폼이 기준 프로필에서 손댄 데가 있나 — 없으면 남길 것도 없다. */
export function dogProfileFormDirty(form: TDogProfileForm, base: TDogProfile | null): boolean {
  const seed = dogProfileFormOf(base);
  if (form.carrier !== seed.carrier || form.sizeOverride !== seed.sizeOverride) return true;
  if (form.rows.length !== seed.rows.length) return true;
  return form.rows.some((row, index) => row.name !== seed.rows[index].name || row.weightKg !== seed.rows[index].weightKg);
}

/** 이름도 몸무게도 비어 있는 행 — 빼도 잃는 것이 없어 되돌리기를 띄우지 않는다(14 W261010.7a). */
export function dogFormRowEmpty(row: TDogProfileFormRow): boolean {
  return row.name.trim() === '' && row.weightKg.trim() === '';
}

/**
 * ✕ 로 뺀 행을 되돌리기로 제자리(`index`)에 되넣는다(14 W261010.7a). 그 사이 행이 줄었으면 끝에 붙인다.
 * 마릿수 상한(`MAX_DOGS`)은 넘기지 않는다 — 넘긴 채 저장하면 다음에 읽을 때 `sanitizeDog` 가 프로필을 **통째로** 비운다.
 * 빼고 나서 '한 마리 더' 로 빈 행을 더했으면(잘못 뺀 걸 알고 다시 쓰려던 자리) 그 빈 행을 내주고 되넣는다.
 * 빈 행도 없으면 `null` — 되넣지 않는다.
 */
export function restoreDogFormRow(
  rows: TDogProfileFormRow[],
  index: number,
  row: TDogProfileFormRow,
): TDogProfileFormRow[] | null {
  const at = Math.min(index, rows.length);
  const next = [...rows.slice(0, at), row, ...rows.slice(at)];
  if (next.length <= MAX_DOGS) return next;
  for (let i = next.length - 1; i >= 0; i -= 1) {
    if (i !== at && dogFormRowEmpty(next[i])) return next.filter((_, j) => j !== i);
  }
  return null;
}

/**
 * ✕ 로 `count` 행 중 `index` 행을 뺀 뒤 키보드 포커스가 갈 곳(14 W261010.7b) — 행 번호(그 행의 이름 칸)거나 `'add'`('한 마리 더').
 * 누른 ✕ 가 사라지거나(마지막 행 · 두 마리 → 한 마리면 ✕ 열이 통째로) 같은 자리 ✕ 가 다음 마리 것이 되어(`key={index}`)
 * Enter 한 번 더에 다음 마리가 빠졌다. **Tab 이 그 ✕ 다음에 가던 곳**으로 보낸다: 뒤에 행이 있었으면 한 칸 올라온 그 행의 이름 칸
 * (낭독이 "2번째 강아지 이름, 콩" 이라 목록이 당겨진 것도 들린다), 마지막 행이었으면 바로 밑 '한 마리 더'(뺀 뒤엔 늘 있다 — 상한 아래).
 */
export function dogRowFocusAfterRemove(index: number, count: number): number | 'add' {
  return index < count - 1 ? index : 'add';
}

/** 돌아왔을 때 되살릴 초안 — 기준 프로필이 떠날 때와 **같은 값**일 때만. 아니면 `null`(저장된 프로필로 채운다). */
export function restorableDogProfileDraft(draft: TDogProfileDraft | null, current: TDogProfile | null): TDogProfileForm | null {
  if (!draft) return null;
  return JSON.stringify(draft.base) === JSON.stringify(current) ? draft.form : null;
}
