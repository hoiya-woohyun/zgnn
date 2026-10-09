'use client';

import type { ReactNode } from 'react';
import type { TPolicyDraft, TTriState } from '../lib/adminEdit';
import { cx } from '../utils/cx';
import { AdminFilterChip } from './adminFilterChip';

export const INDOOR_OPTIONS: { key: TPolicyDraft['indoor']; label: string }[] = [
  { key: 'unknown', label: '언급 없음' },
  { key: 'free', label: '실내 자유' },
  { key: 'cage', label: '실내는 케이지' },
  { key: 'outdoorOnly', label: '야외만' },
];

/**
 * 삼항 버튼 셋. **체크박스로 두지 않는다** — `false`("불가 라고 적혀 있다")와 `null`("언급이 없다")이 한 칸이 되면
 * 그 둘이 구별되지 않는데, 판정은 정반대다. BUG-009 가 정확히 그 혼동이었다(`largeDogOk` 가 참/거짓 한 칸이라
 * 28kg 보호자에게 원문과 반대되는 안내가 떴다).
 */
export function TriButtons({
  value,
  yes,
  no,
  busy,
  onChange,
}: {
  value: TTriState;
  yes: string;
  no: string;
  busy: boolean;
  onChange: (next: TTriState) => void;
}) {
  const options: { key: TTriState; text: string }[] = [
    { key: 'unknown', text: '언급 없음' },
    { key: 'yes', text: yes },
    { key: 'no', text: no },
  ];
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((option) => (
        <AdminFilterChip key={option.key} pressed={value === option.key} isDisabled={busy} onClick={() => onChange(option.key)}>
          {option.text}
        </AdminFilterChip>
      ))}
    </div>
  );
}

/** 폼에서 쓰는 `<textarea>` 모양. `components/base` 에 TextArea 가 없고 그 폴더는 Untitled UI 복사본이라 건드리지 않는다(CLAUDE.md). */
export const TEXTAREA =
  'block w-full rounded-lg border border-primary bg-primary px-3 py-2 text-sm text-primary shadow-xs outline-focus-ring placeholder:text-placeholder focus:outline-2 focus:outline-offset-2 disabled:cursor-not-allowed disabled:bg-disabled_subtle';

/** 표의 세 열 — 항목 · 지금 값 · 고칠 값. 머리글과 줄이 같은 상수를 본다(한쪽만 고치면 열이 어긋난다). */
export const EDIT_GRID = 'md:grid md:grid-cols-[7rem_minmax(0,2fr)_minmax(0,3fr)] md:gap-3';

/**
 * 한 줄 — **왼쪽에 지금 값(읽기 전용), 오른쪽에 입력.** 바뀐 줄은 분홍 바탕 + `바뀜` 표시가 붙는다.
 *
 * 입력칸만 두던 자리다. 입력칸은 고치는 순간 원래 값을 지우므로, 몇 칸을 손댄 뒤에는 "원래 무엇이었나" 가 화면
 * 어디에도 없었다(사용자 지적). 지금 값을 옆에 **고정해 두면** 운영자는 한 줄에서 "이것을 → 이것으로" 를 읽는다.
 */
export function EditRow({
  label,
  current,
  changed,
  children,
}: {
  label: string;
  current: string;
  changed: boolean;
  children: ReactNode;
}) {
  return (
    <div className={cx('space-y-1 rounded-md px-2 py-1.5', EDIT_GRID, 'md:items-start md:space-y-0', changed && 'bg-brand-primary')}>
      <div className="flex items-center gap-1.5 pt-1 text-xs font-medium text-secondary">
        {label}
        {changed && <span className="rounded bg-brand-solid px-1 py-px text-[0.625rem] font-semibold text-primary_on-brand">바뀜</span>}
      </div>
      <div className={cx('min-w-0 pt-1 text-xs whitespace-pre-line', changed ? 'text-tertiary line-through' : 'text-tertiary')}>
        <span className="text-quaternary md:hidden">지금 값 · </span>
        {current}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
