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
 * 저장한 곳(`/saved`)은 홈 카드가 주 진입점이라 홈 탭에 불이 들어온다(설정은 보조 경로).
 */
export const NAV_ITEMS: TNavItem[] = [
  { to: '/', label: '홈', Icon: Home02, isActive: (path) => path === '/' || path.startsWith('/saved') },
  {
    to: '/places/stay',
    label: '둘러보기',
    Icon: Compass01,
    // `/places/` 까지 본다 — `/places` 로만 보면 `/placesX` 같은 404 에서도 불이 들어왔다(D5).
    isActive: (path) => path.startsWith('/places/') || path.startsWith('/place/'),
    // 보던 종류로 돌아간다(12 U1.5) — 카페 목록에서 누르면 숙소로 넘어가지 않고 맨 위로, 지도에서 누르면 보던 카페로.
    hrefFor: (path) => placesTabHref(path),
  },
  // 다섯 자리의 **가운데**이고 솟은 원형 버튼이다 — 여행 중 가장 자주 여는 화면을 엄지 바로 위에 둔다.
  // 순서를 바꾸면 `lib/appRoutes.ts` 의 `SWIPE_ROUTES` 도 같이 바꾼다(손가락 순서와 눈 순서가 같아야 한다).
  { to: '/map', label: '지도', Icon: Map01, isActive: (path) => path.startsWith('/map'), prominent: true },
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
    // 강아지 프로필(`/dog`)은 여기 넣지 않는다 — 들어온 탭을 따른다(`navHighlightPath`).
    isActive: (path) => path.startsWith('/settings'),
  },
];

/**
 * 어느 탭에도 속하지 않고 **들어온 탭을 따르는** 화면. 강아지 등록은 홈 카드·상세·목록·설정
 * 어디서나 들어오는데, 설정에 못 박아 두면 홈에서 들어온 사람에게 '설정' 이 켜져 길을 잃은 듯 보인다
 * (14 W261006.10, 3/6).
 */
const FOLLOWS_ORIGIN = new Set(['/dog']);

/**
 * 탭 하이라이트를 계산할 주소. 보통은 지금 주소 그대로이고, `FOLLOWS_ORIGIN` 화면에서는 들어오기
 * 직전 주소다. 직전 주소가 없으면(딥링크로 바로 들어옴) null — 어느 탭에도 불을 켜지 않는다.
 * 뒤로가기는 이와 무관하게 셸이 붙인다(`appRoutes.ts`).
 */
export const navHighlightPath = (pathname: string, originPath: string | null): string | null => {
  const path = pathname.replace(/\/+$/, '') || '/';
  return FOLLOWS_ORIGIN.has(path) ? originPath : pathname;
};

/** 이 항목에 불이 들어오는가. 계산할 주소가 없으면(null) 어느 탭도 아니다. */
export const isNavActive = (item: TNavItem, highlightPath: string | null): boolean =>
  highlightPath !== null && item.isActive(highlightPath);
