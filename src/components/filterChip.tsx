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
  /** 글자 앞 아이콘(예: 필터의 슬라이더). 장식이라 가린다. */
  iconLeading?: FC<{ className?: string; 'aria-hidden'?: boolean }>;
  /** 글자 뒤 아이콘(예: ✕). 장식이라 가린다 — 뜻은 `aria-label` 이 말한다. */
  iconTrailing?: FC<{ className?: string; 'aria-hidden'?: boolean }>;
  children: ReactNode;
};

/**
 * 필터 칩 하나 — 둘러보기 칩 줄·시트·근처 장소·홈 관광지 칩이 이것을 쓴다(22 D-5).
 *
 * **보이는 것은 36px(`h-9`), 누르는 것은 44px** — `before:` 가 위아래 4px 씩 넓힌다(ADR-006 의 44px 터치 기준). 44px 알약이
 * 줄줄이 서면 칩 더미가 화면을 먹고 "AI 가 찍어 낸" 모양이 됐다(22 · 실서비스 4/4 가 h34~40). 그래서 칩을 가로 스크롤 줄에 둘 때는
 * 줄을 44px(`min-h-11 items-center`)로 잡는다 — `overflow-x-auto` 는 세로도 잘라서 넓힌 4px 가 줄 밖에서 안 눌린다.
 *
 * 꺼짐은 **면 없이 테두리만**(크림 위에 투명) · 글자 400. 켜짐은 옅은 브랜드 면 + 브랜드 테두리 + 600 — 브랜드 단색 채움은 쓰지 않는다
 * (실서비스 0/4, 진한 면은 지도 오버레이 위에서만 — ADR-003 "켜짐은 한 가지 언어로"). 눌림은 `bg-tertiary` — 크림 시트 위에서
 * `primary_hover` 는 크림과 같은 값이라 안 보인다(CLAUDE.md). 켜진 칩은 눌림 면을 덮지 않는다(브랜드 면이 회색으로 바래 보인다).
 *
 * **옵션 칩 안에 숫자를 싣지 않는다** — 옵션마다 개수는 실서비스 0/4, 남는 곳 수는 시트의 결과 버튼("N곳 보기") 한 곳이 말한다.
 * 숫자가 서는 칩은 켠 조건 수를 말하는 '필터 3' 하나다(실서비스도 필터 버튼 한 곳).
 * 꺼짐에도 같은 두께의 테두리를 두고, 굵은 글자 폭을 보이지 않는 사본으로 미리 잡는다 — 켤 때 칩 폭이 흔들리면 줄의 뒤 칩이 밀린다.
 */
export function FilterChip({
  pressed,
  toggle = true,
  iconLeading: IconLeading,
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
        'relative inline-flex h-9 shrink-0 cursor-pointer items-center justify-center gap-1 whitespace-nowrap rounded-full border px-3.5 text-sm transition-colors',
        'before:absolute before:inset-x-0 before:-inset-y-1 before:content-[""]',
        'focus-visible:outline-2 focus-visible:outline-offset-2 outline-focus-ring',
        pressed
          ? 'border-brand bg-brand-primary text-brand-secondary'
          : 'border-primary bg-transparent text-secondary hover:bg-tertiary active:bg-tertiary',
        className,
      )}
      {...rest}
    >
      {IconLeading && <IconLeading aria-hidden className={cx('size-4 shrink-0', !pressed && 'text-fg-secondary')} />}
      <span className="grid">
        <span className={cx('col-start-1 row-start-1', pressed ? 'font-semibold' : 'font-normal')}>{children}</span>
        <span aria-hidden="true" className="invisible col-start-1 row-start-1 font-semibold">
          {children}
        </span>
      </span>
      {IconTrailing && <IconTrailing aria-hidden className="size-3.5 shrink-0" />}
    </button>
  );
}
