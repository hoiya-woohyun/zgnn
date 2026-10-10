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

/** 돌아왔을 때 되살릴 초안 — 기준 프로필이 떠날 때와 **같은 값**일 때만. 아니면 `null`(저장된 프로필로 채운다). */
export function restorableDogProfileDraft(draft: TDogProfileDraft | null, current: TDogProfile | null): TDogProfileForm | null {
  if (!draft) return null;
  return JSON.stringify(draft.base) === JSON.stringify(current) ? draft.form : null;
}
