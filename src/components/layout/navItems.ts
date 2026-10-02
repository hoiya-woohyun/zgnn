import type { FC } from 'react';
import { Compass01, Home02, Map01, Settings01 } from '@untitledui/icons';
import { CheckDone01 } from '@untitledui/icons';
import type { TIconProps } from '../icons/iconProps';
import { placesTabHref } from '../../lib/lastPlaceType';

export type TNavItem = {
  to: string;
  label: string;
  Icon: FC<TIconProps>;
  /** 현재 경로가 이 항목에 속하는지. 상세(/place/:id)는 '둘러보기' 아래로 본다. */
  isActive: (pathname: string) => boolean;
  /** 주소가 상황에 따라 바뀌는 항목만 — 없으면 `to`. `to` 는 목록의 key 로도 쓰여 고정이다. */
  hrefFor?: (pathname: string) => string;
};

/** 항목이 지금 가리킬 주소. 탭바·사이드바가 같은 답을 쓴다. */
export const navHref = (item: TNavItem, pathname: string) => item.hrefFor?.(pathname) ?? item.to;

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
    // `/places/` 까지 본다 — `/places` 로만 보면 `/placesX` 같은 404 에서도 불이 들어왔다(D5).
    isActive: (path) => path.startsWith('/places/') || path.startsWith('/place/'),
    // 보던 종류로 돌아간다(12 U1.5) — 카페 목록에서 누르면 숙소로 넘어가지 않고 맨 위로, 지도에서 누르면 보던 카페로.
    hrefFor: (path) => placesTabHref(path),
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
