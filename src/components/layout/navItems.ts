import type { FC } from 'react';
import { Compass01, Home02, Map01, Settings01 } from '@untitledui/icons';
import { CheckDone01 } from '@untitledui/icons';
import type { TIconProps } from '../icons/iconProps';
import { placesTabHref } from '../../lib/lastPlaceType';

/** 불이 들어올 때 아이콘이 어떻게 움직이나 — 키프레임은 `styles/appTabBar.css`. 아이콘의 뜻을 따라 고른다. */
export type TTabMotion = 'bounce' | 'wobble' | 'tilt' | 'press' | 'turn';

export type TNavItem = {
  to: string;
  label: string;
  Icon: FC<TIconProps>;
  /**
   * 이 탭 화면에 불이 들어오는가. **탭 화면 주소만** 받는다 — 하위 화면(상세·저장한 곳·강아지)이 어느 탭 밑인지는
   * 정적 규칙이 아니라 들어온 길이 정한다(`lib/appRoutes.ts` 의 `ownerRootOf`, 셸의 `useNavHighlightPath`).
   */
  isActive: (rootPath: string) => boolean;
  /** 주소가 상황에 따라 바뀌는 항목만 — 없으면 `to`. `to` 는 목록의 key 로도 쓰여 고정이다. */
  hrefFor?: (pathname: string) => string;
  /** 탭바에서 비활성 → 활성이 되는 순간의 아이콘 모션(사이드바는 안 움직인다). */
  motion: TTabMotion;
  /**
   * 탭바 **가운데의 솟은 원형 버튼**으로 그린다 — 하나뿐이어야 한다(둘이면 가운데가 없다).
   * 사이드바는 이 표시를 무시한다(세로 목록엔 '가운데' 가 없다).
   */
  prominent?: boolean;
};

/** 항목이 지금 가리킬 주소. 탭바·사이드바가 같은 답을 쓴다. */
export const navHref = (item: TNavItem, pathname: string) => item.hrefFor?.(pathname) ?? item.to;

/**
 * 모바일 하단 탭바와 데스크톱 사이드바가 같은 목록을 쓴다.
 * 두 곳이 갈리면 화면 폭을 바꿨을 때 내비게이션이 달라 보인다.
 *
 * 저장 개수 배지는 탭에 두지 않는다 — 개수는 홈 카드·지도의 저장 칩·설정의 "저장한 곳" 행에서 보인다.
 */
export const NAV_ITEMS: TNavItem[] = [
  { to: '/', label: '홈', Icon: Home02, motion: 'bounce', isActive: (path) => path === '/' },
  {
    to: '/places/stay',
    label: '둘러보기',
    Icon: Compass01,
    motion: 'wobble',
    // `/places/` 까지 본다 — `/places` 로만 보면 `/placesX` 같은 404 에서도 불이 들어왔다(D5).
    isActive: (path) => path.startsWith('/places/'),
    // 보던 종류로 돌아간다(12 U1.5) — 카페 목록에서 누르면 숙소로 넘어가지 않고 맨 위로, 지도에서 누르면 보던 카페로.
    hrefFor: (path) => placesTabHref(path),
  },
  // 다섯 자리의 **가운데**이고 솟은 원형 버튼이다 — 여행 중 가장 자주 여는 화면을 엄지 바로 위에 둔다.
  // 순서를 바꾸면 `lib/appRoutes.ts` 의 `SWIPE_ROUTES` 도 같이 바꾼다(손가락 순서와 눈 순서가 같아야 한다).
  { to: '/map', label: '지도', Icon: Map01, motion: 'tilt', isActive: (path) => path.startsWith('/map'), prominent: true },
  {
    to: '/checklist',
    label: '준비물',
    Icon: CheckDone01,
    motion: 'press',
    isActive: (path) => path.startsWith('/checklist'),
  },
  {
    to: '/settings',
    label: '설정',
    Icon: Settings01,
    motion: 'turn',
    isActive: (path) => path.startsWith('/settings'),
  },
];

/** 이 항목에 불이 들어오는가. `highlightPath` 는 탭 화면 주소다(`useNavHighlightPath`). */
export const isNavActive = (item: TNavItem, highlightPath: string): boolean => item.isActive(highlightPath);
