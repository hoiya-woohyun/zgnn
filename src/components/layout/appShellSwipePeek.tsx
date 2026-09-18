'use client';

import { useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react';
import { mainSurfaceProps } from './appShellSurface';
import { normalizeRoute } from '../../lib/appRoutes';
import { arrivalScrollOf } from '../../lib/appScroll';
import { PLACE_TYPES } from '../../lib/places';
import { ChecklistPage } from '../../screens/checklistPage';
import { HomePage } from '../../screens/homePage';
import { PlacesPage } from '../../screens/placesPage';
import { SettingsPage } from '../../screens/settingsPage';

/**
 * 지도 자리에 세워 두는 대역.
 *
 * **지도는 엿보기에 진짜로 그리지 않는다.** 카카오 SDK 를 스크립트로 받아 붙이는 화면이라
 * (`mapRouteClient` 가 `ssr: false` 로 늦게 불러온다) 손가락이 잠기는 순간 그것을 시작하면
 * 첫 프레임이 걸린다 — 스와이프는 손가락을 따라오는 것이 전부인데 거기서 끊기면 그게 고장이다.
 *
 * 대신 **갓 마운트된 지도와 같은 모습**을 세운다. 타일이 그려지기 전의 지도는 실제로
 * 크림 한 장이므로(`mapPageCanvas` 의 `bg-secondary`) 이 대역은 거짓이 아니라 그 순간의
 * 사실이고, 도착하면 그 위에 타일이 얹힌다. 높이 계산은 `mapPage` 의 바깥 상자와 같아야 한다.
 */
function MapStandIn() {
  return <div className="h-[calc(100dvh-60px-env(safe-area-inset-bottom,0px))] bg-secondary md:h-dvh" />;
}

/**
 * 주소 하나를 화면 하나로. 엿보기가 "옆에 무엇이 있는지" 를 그릴 때만 쓴다.
 *
 * 홈·준비물·설정은 이펙트가 하나도 없는 순수한 화면이라 두 번 그려도 아무 일도 일어나지
 * 않는다(스토어를 읽기만 한다). 둘러보기는 다르다 — `usePlaceTypeSwitch` 가 "직전에 보던
 * 종류" 를 모듈 변수에 적는다. 그래서 셸은 미끄러짐이 끝날 때마다 도착점을 다시 찍는다
 * (`appShellSwipe` 의 `markPlacesArrival`).
 */
const screenOf = (route: string): ReactNode => {
  if (route === '/') return <HomePage />;
  if (route === '/map') return <MapStandIn />;
  if (route === '/checklist') return <ChecklistPage />;
  if (route === '/settings') return <SettingsPage />;
  const type = PLACE_TYPES.find((value) => route === `/places/${value}`);
  return type ? <PlacesPage type={type} /> : null;
};

type TAppShellSwipePeekProps = {
  ref: RefObject<HTMLDivElement | null>;
  /** 이웃 화면의 주소. `SWIPE_ROUTES` 안의 값이다. */
  route: string;
  /** 어느 쪽에 대기하나. 왼쪽이면 -100%, 오른쪽이면 +100% 에서 출발한다. */
  side: 'left' | 'right';
  /** 한 장의 폭(px) = 지금 `<main>` 의 폭. 왜 `100%` 가 아닌지는 `appShellSwipe` 의 `TAppShellPeek`. */
  width: number;
};

/**
 * 스와이프 중에 옆에서 따라 들어오는 이웃 화면.
 *
 * `<main>` 밖에 `fixed` 로 띄운다. 무대 안에 두면 `<main>` 의 transform 을 같이 받아 두 배로
 * 움직이고, 문서 높이도 늘어나 지금 화면의 스크롤이 흔들린다. 밖에 두면 탭바(`z-40`)는
 * 제자리에 선 채 내용만 갈리는데, 그게 네이티브 페이저의 모습이다 — 탭바는 화면이 아니라
 * 화면들을 담는 틀이다.
 *
 * **자기 스크롤 상자를 가진다.** 도착점은 맨 위가 아니라 그 화면을 떠날 때의 자리이므로
 * (`lib/appScroll.ts`) 엿보기도 거기서부터 보여야 놓는 순간 튀지 않는다. `overflow: hidden`
 * 이어도 `scrollTop` 은 코드로 넣을 수 있고, 무엇보다 **상자가 있어야 안쪽의 `sticky` 헤더가
 * 제자리를 찾는다** — 내용을 음수 마진으로 끌어올리는 방법으로는 헤더가 같이 끌려 올라간다.
 *
 * 보여주기만 한다(`inert`) — 손가락이 지나가는 동안 카드 링크가 눌리거나 포커스가 옮겨가면 안 된다.
 */
export function AppShellSwipePeek({ ref, route, side, width }: TAppShellSwipePeekProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const path = normalizeRoute(route);
  const offset = arrivalScrollOf(path);
  const surface = mainSurfaceProps(path === '/map');

  useLayoutEffect(() => {
    // 그려지기 전에 넣어야 맨 위가 한 프레임 비치지 않는다.
    if (scrollRef.current) scrollRef.current.scrollTop = offset;
  }, [offset]);

  return (
    // 바깥 상자는 자리만 잡는다 — 사이드바를 뺀 칸에 화면 높이만큼. transform 은 안쪽이 받는다.
    <div inert aria-hidden="true" className="pointer-events-none fixed inset-0 z-30 md:pl-64">
      <div
        ref={ref}
        className="mx-auto h-full"
        style={{ width, transform: `translateX(${side === 'left' ? -100 : 100}%)` }}
      >
        <div ref={scrollRef} className="h-full overflow-hidden bg-secondary">
          <div {...surface}>{screenOf(path)}</div>
        </div>
      </div>
    </div>
  );
}
