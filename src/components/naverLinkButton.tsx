import type { FC, ReactNode, SVGProps } from 'react';
import { cx } from '../utils/cx';

type TNaverLinkButtonIcon = FC<SVGProps<SVGSVGElement> & { size?: number }>;

type TNaverLinkButtonProps = {
  href: string;
  children: ReactNode;
  /**
   * lg: 한 덩어리에 버튼이 이것 하나인 자리(하루 경로 · 지도 시트) — h-11, 폭은 부르는 쪽이 정한다(전폭·flex-1).
   * sm: 목록 카드처럼 여럿 반복되는 자리 — 보이는 높이는 h-8, 누를 자리는 44px.
   */
  size?: 'lg' | 'sm';
  /** 길찾기는 `NavigationPointer01`(상세 액션 줄의 길찾기 칸과 같은 화살표), 가게 페이지는 `MarkerPin02`. */
  icon?: TNaverLinkButtonIcon;
  className?: string;
};

const SIZE = {
  lg: { root: 'h-11 gap-1.5 px-4 text-md', icon: 18, iconClass: 'text-fg-secondary' },
  // 히트 영역은 위아래로 7px 씩 내민 투명 `before:` 다 — 줄 높이를 늘리면 카드 배지 줄이 같이 높아진다.
  // 6px 이 아닌 이유: 절대 위치는 테두리 **안쪽**(패딩 박스 30px)을 기준으로 잡혀 6px 이면 42px 였다(22 review R-1). (44 − 30) / 2 = 7.
  sm: {
    root: 'h-8 gap-1 px-2.5 text-sm before:absolute before:inset-x-0 before:-inset-y-1.75 before:content-[""]',
    icon: 14,
    iconClass: 'text-fg-quaternary',
  },
} as const;

/**
 * 네이버(지도·플레이스)로 나가는 링크 버튼. 네이버로 가는 버튼은 전부 이것을 쓴다(상세 액션 줄은 `ActionTile` 의 목적지 줄).
 *
 * **중립 테두리다**(흰 면 · 회색 1px · 회색 글자, 22 D-11). 예전엔 네이버 공식 초록 면 + 흰 N 상자였는데, 저장 카드마다 서는 초록이
 * 화면에서 가장 센 색이 되어 판정 배지·주 버튼보다 앞에 읽혔다(사용자: "AI 같다"). 실서비스 레퍼런스(docs/reviews/design-audit/2026-10-19-references.md)는
 * 지도 회사가 아니면 목록 카드에 길찾기를 두지 않거나 회색 글자·테두리로 두고, 상세는 중립 테두리 버튼이다 — 브랜드 채움은 예약 같은 주 행동 하나 몫.
 * **앱을 떠난다는 신호는 색이 아니라 글자의 앱 이름**이다('네이버 길찾기' · '네이버 플레이스' · '네이버에서 찾기'). ↗ 는 붙이지 않는다(레퍼런스 0곳).
 */
export function NaverLinkButton({ href, children, size = 'sm', icon: Icon, className }: TNaverLinkButtonProps) {
  const sized = SIZE[size];
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={cx(
        'relative inline-flex shrink-0 items-center justify-center rounded-lg border border-primary bg-primary font-semibold whitespace-nowrap text-secondary',
        'transition duration-100 ease-linear hover:bg-primary_hover active:bg-tertiary',
        'outline-focus-ring focus-visible:outline-2 focus-visible:outline-offset-2',
        sized.root,
        className,
      )}
    >
      {Icon && <Icon size={sized.icon} aria-hidden="true" className={cx('shrink-0', sized.iconClass)} />}
      {children}
    </a>
  );
}
