import type { FC } from 'react';
import { Compass01, Heart, Home02, Map01 } from '@untitledui/icons';
import { CheckDone01 } from '@untitledui/icons';
import type { TIconProps } from '../icons/iconProps';

export type TNavItem = {
  to: string;
  label: string;
  Icon: FC<TIconProps>;
  /** 현재 경로가 이 항목에 속하는지. 상세(/place/:id)는 '둘러보기' 아래로 본다. */
  isActive: (pathname: string) => boolean;
  /** 저장 개수 배지를 붙이는 항목 표시. */
  showsSavedCount?: boolean;
};

/**
 * 모바일 하단 탭바와 데스크톱 사이드바가 같은 목록을 쓴다.
 * 두 곳이 갈리면 화면 폭을 바꿨을 때 내비게이션이 달라 보인다.
 */
export const NAV_ITEMS: TNavItem[] = [
  { to: '/', label: '홈', Icon: Home02, isActive: (path) => path === '/' },
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
    to: '/saved',
    label: '저장',
    Icon: Heart,
    isActive: (path) => path.startsWith('/saved'),
    showsSavedCount: true,
  },
];
