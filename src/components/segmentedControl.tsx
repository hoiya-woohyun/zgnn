'use client';

import { Radio as AriaRadio, RadioGroup as AriaRadioGroup } from 'react-aria-components';
import { cx } from '../utils/cx';

export type TSegmentedOption<T extends string> = { value: T; label: string };

type TSegmentedControlProps<T extends string> = {
  /** 묶음의 접근 이름. 보이는 제목이 따로 있으면 그 글자와 같게 둔다. */
  label: string;
  options: readonly TSegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
};

/**
 * 하나만 고르는 세그먼트(22 D-6) — 필터 시트 강아지 기준(전부 · 어려운 곳 빼고 · 갈 수 있는 곳만)이 먼저 쓰고,
 * 저장한 곳의 종류별/날짜별(D-16) · 하루 경로 출발점(D-13)도 같은 부품으로 바꿀 자리라 소유자 접두어 없이 공용에 둔다.
 *
 * - 트랙은 `bg-tertiary` 알약(크림 시트 위에서 한 단 진하게 — `bg-secondary` 면 바탕과 같아 트랙이 안 보였다, D-16), 손잡이는 흰 `bg-primary` + `shadow-xs`.
 *   칸은 폭이 같고 손잡이 하나가 `translateX(i×100%)` 로 옮겨 다닌다(둘러보기 종류 밑줄과 같은 계약 — 폭 = 칸 하나).
 * - 글자 14px · 고른 칸 `text-primary` 600 · 나머지 `text-tertiary` 400. 칸 폭이 고정이라 굵기가 바뀌어도 이웃이 밀리지 않는다.
 * - **트랙은 44px, 칸은 36px 로 보이고 `before:` 로 위아래 4px 를 더해 44px 를 누른다**(ADR-006). 트랙의 안쪽 여백까지 누를 수 있다.
 * - 의미는 라디오 묶음이다(react-aria `RadioGroup` — 좌우 화살표로 옮기며 고른다, 한 번에 하나만 탭이 멈춘다).
 *   고르는 즉시 반영되는 자리(시트가 열린 채 목록이 바뀐다)에 쓴다 — 고르면 닫히는 자리는 화살표가 곧 선택이라 맞지 않는다.
 * - 320px 시트(칸 93px)에 '갈 수 있는 곳만'(600 · 83px)이 들어가는 폭이다 — 더 긴 이름은 줄여 짓는다(줄을 바꾸거나 자르지 않는다).
 */
export function SegmentedControl<T extends string>({ label, options, value, onChange, className }: TSegmentedControlProps<T>) {
  const index = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );

  return (
    <AriaRadioGroup
      aria-label={label}
      orientation="horizontal"
      value={value}
      onChange={(next) => onChange(next as T)}
      className={cx('relative flex h-11 w-full rounded-full bg-tertiary p-1', className)}
    >
      {/*
        손잡이. 절대 위치의 기준이 트랙의 padding box 라 `left-1` 이 곧 내용 영역의 가장자리이고
        `(100% - 좌우 패딩) / 칸 수` 가 칸 하나의 폭이다. 패딩을 px 로 굳히지 않는다 — `--spacing` 파생이라 md 에서 값이 바뀐다(ADR-006).
      */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-1 left-1 rounded-full bg-primary shadow-xs transition-transform duration-200 ease-out motion-reduce:transition-none"
        style={{
          width: `calc((100% - var(--spacing) * 2) / ${options.length})`,
          transform: `translateX(${index * 100}%)`,
        }}
      />
      {options.map((option) => (
        <AriaRadio
          key={option.value}
          value={option.value}
          className={({ isSelected, isFocusVisible }) =>
            cx(
              'relative flex min-w-0 flex-1 cursor-pointer items-center justify-center whitespace-nowrap rounded-full px-1 text-sm transition-colors select-none',
              'before:absolute before:inset-x-0 before:-inset-y-1 before:content-[""]',
              isSelected ? 'font-semibold text-primary' : 'font-normal text-tertiary hover:text-secondary',
              isFocusVisible && 'outline-2 outline-offset-2 outline-focus-ring',
            )
          }
        >
          {option.label}
        </AriaRadio>
      ))}
    </AriaRadioGroup>
  );
}
