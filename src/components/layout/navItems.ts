import type { FC } from 'react';
import { Compass01, Home02, Map01, Settings01 } from '@untitledui/icons';
import { CheckDone01 } from '@untitledui/icons';
import type { TIconProps } from '../icons/iconProps';

export type TNavItem = {
  to: string;
  label: string;
  Icon: FC<TIconProps>;
  /** 현재 경로가 이 항목에 속하는지. 상세(/place/:id)는 '둘러보기' 아래로 본다. */
  isActive: (pathname: string) => boolean;
};

/**
 * 모바일 하단 탭바와 데스크톱 사이드바가 같은 목록을 쓴다.
 * 두 곳이 갈리면 화면 폭을 바꿨을 때 내비게이션이 달라 보인다.
 *
 * 저장 개수 배지는 탭에 두지 않는다 — 개수는 홈 카드·지도의 저장 칩·설정의 "저장한 곳" 행에서 보인다.
 * 저장한 곳(`/saved`)은 홈 카드가 주 진입점이라 홈 탭에 불이 들어온다(설정은 보조 경로).
 */
export const NAV_ITEMS: TNavItem[] = [
  { to: '/', label: '홈', Icon: Home02, isActive: (path) => path === '/' || path.startsWith('/saved') },
  { to: '/map', label: '지도', Icon: Map01, isActive: (path) => path.startsWith('/map') },
  {
    to: '/places/stay',
    label: '둘러보기',
    Icon: Compass01,
    isActive: (path) => path.startsWith('/places') || path.startsWith('/place/'),
  },
  {
    to: '/checklist',
    label: '준비물',
    Icon: CheckDone01,
    isActive: (path) => path.startsWith('/checklist'),
  },
  {
    to: '/settings',
    label: '설정',
    Icon: Settings01,
    // 강아지 프로필은 설정 안의 화면이라 거기 있을 때도 설정 탭에 불이 들어온다.
    isActive: (path) => path.startsWith('/settings') || path.startsWith('/dog'),
  },
];
