import type { ButtonHTMLAttributes, FC, ReactNode } from 'react';
import { cx } from '../utils/cx';

type TFilterChipProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'aria-pressed'> & {
  /** 켜졌는가. 모양과 `aria-pressed` 를 함께 정한다. */
  pressed: boolean;
  /**
   * 누르면 켜고 끄는 칩인가(기본 true). "켜진 조건 ✕" 처럼 누르면 **사라지는** 칩은 켜진
   * 모양만 빌리고 `aria-pressed` 는 달지 않는다 — "눌림, 조건 끄기" 로 두 번 말하게 된다.
   */
  toggle?: boolean;
  /** 글자 뒤 아이콘(예: ✕). 장식이라 가린다 — 뜻은 `aria-label` 이 말한다. */
  iconTrailing?: FC<{ className?: string; 'aria-hidden'?: boolean }>;
  children: ReactNode;
};

/**
 * 필터 칩의 "켜짐" 을 한 모양으로 — 연한 브랜드 워시 + 진한 브랜드 글씨 + 브랜드 테두리.
 *
 * 둘러보기 조건 판·근처 장소·켜진 조건 줄은 base `Button` 의 primary(진한 브랜드 면)로, 판정
 * 토글은 워시로 켜짐을 그려 한 화면에 두 언어가 섞여 있었다(D6). 진한 면은 지도 오버레이
 * 위에서만 쓴다(ADR-003 "켜짐은 한 가지 언어로") — 그래서 지도 종류 칩은 이것을 쓰지 않는다.
 *
 * 꺼짐에도 같은 두께의 테두리를 둔다. 켜질 때만 테두리가 생기면 칩 폭이 1px 씩 흔들린다.
 * 높이는 44px(`h-11`) 고정 — 터치 기준(ADR-006)이라 줄이지 않는다.
 */
export function FilterChip({
  pressed,
  toggle = true,
  iconTrailing: IconTrailing,
  className,
  children,
  ...rest
}: TFilterChipProps) {
  return (
    <button
      type="button"
      aria-pressed={toggle ? pressed : undefined}
      className={cx(
        'inline-flex h-11 shrink-0 cursor-pointer items-center justify-center gap-1 whitespace-nowrap rounded-xl border px-3.5 text-sm font-semibold transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 outline-focus-ring',
        pressed
          ? 'border-brand bg-brand-primary text-brand-secondary'
          : 'border-primary bg-primary text-secondary hover:bg-primary_hover',
        className,
      )}
      {...rest}
    >
      {children}
      {IconTrailing && <IconTrailing aria-hidden className="size-4 shrink-0" />}
    </button>
  );
}
