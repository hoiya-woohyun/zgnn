'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { AppBar } from './appBar';
import { AppSidebar } from './appSidebar';
import { AppTabBar } from './appTabBar';
import { mainSurfaceProps, surfaceKindOf } from './appShellSurface';
import { useAppShellSwipe } from './appShellSwipe';
import { AppShellSwipePeek } from './appShellSwipePeek';
import { AppShellUpdateNotice } from './appShellUpdateNotice';
import { AppStatusToast } from './appStatusToast';
import { stampHistoryDepth } from '../../lib/appHistory';
import { isRootRoute, parentRouteOf } from '../../lib/appRoutes';
import { arrivalScrollOf, rememberScroll } from '../../lib/appScroll';
import { cx } from '../../utils/cx';

/**
 * 앱 셸.
 *
 * 모바일은 [콘텐츠 + 하단 탭바], 데스크톱(md 이상)은 [좌측 사이드바 + 콘텐츠] 로 갈린다.
 * 지도 화면만 예외로 콘텐츠 폭을 제한하지 않고 아래 여백도 두지 않는다 — 규격은
 * `appShellSurface.ts` 에 있다(엿보기가 같은 것을 써야 해서 떼어 냈다).
 *
 * 뒤로가기는 화면이 아니라 셸이 붙인다. 탭바에 없는 화면(= 무언가를 눌러 들어온 하위 화면)은
 * 모바일에서 되돌아갈 수단이 없기 때문이다 — 홈 화면에서 띄운 PWA 에는 브라우저 뒤로가기도
 * 없다. 루트 여부는 `lib/appRoutes.ts` 가 판정하므로, 화면을 새로 만들 때는 그 표에만
 * 손대면 되고 화면 쪽에서는 아무것도 하지 않는다.
 *
 * 상태바(safe-area-inset-top)도 같은 방식이다(ADR-010). `viewportFit: cover` 라 내용이 상태바
 * 밑까지 깔리는데, 그 자리를 화면마다 알아서 피하게 두면 하나만 빠져도 노치 기기에서만 깨진다.
 * 그래서 **여백은 여기 한 곳에서만 준다** — `<main>` 에 인셋만큼 위 여백. 화면 쪽에서
 * `pt-safe` 를 붙일 일이 없다. 그 여백은 아무도 칠하지 않아 페이지 바탕(크림)이 비치는데,
 * **맨 위 면은 전 화면 크림이므로** 그것으로 끝난다(ADR-010 v3).
 *
 * **좌우 스와이프도 셸이 붙인다**(ADR-014). 탭바의 다섯 화면은 손가락으로 넘나들 수 있고,
 * 그 이동은 화면 하나의 사정이 아니라 화면들 **사이**의 사정이라 화면이 알 수 없다.
 * 제스처는 `appShellSwipe`, 옆에서 따라 들어오는 이웃은 `appShellSwipePeek` 이 맡는다.
 *
 * ## 스크롤은 화면마다 제자리를 지킨다
 *
 * 예전에는 경로가 바뀌면 무조건 `scrollTo(0, 0)` 이었다. 손가락으로 넘기기 시작하면서 그
 * 규칙이 어긋났다 — 옆으로 민 화면이 매번 맨 위로 되감기면 나란히 떠 있는 것이 아니라 매번
 * 새로 여는 것이 된다. 그래서 **예외 없이 모든 화면이** 떠날 때의 자리를 기억했다가 돌아올 때
 * 되돌려 놓는다(`lib/appScroll.ts`). 목록에서 상세를 들렀다 나오면 보고 있던 항목이 다시
 * 보이는 것도 같은 규칙에서 나온다 — 상세를 예외로 두었을 때 함께 되감기던 것이 그 목록이었다.
 *
 * 맨 위에서 시작해야 하는 이동이 있으면 **그 이동을 하는 쪽**이 도착점 기억을 0 으로 적어
 * 말한다(둘러보기의 종류 전환). 여기서 주소를 보고 가르지 않는 이유는 `appScroll.ts` 에 있다.
 *
 * 자리는 스크롤 이벤트로 ref 에 받아 둔다. 경로가 바뀐 **뒤에** `window.scrollY` 를 읽으면
 * 이미 늦어서(이동 중에 0 이 되어 있을 수 있다) 떠날 때의 자리를 잃는다.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const kind = surfaceKindOf(pathname);
  /*
   * 검수 화면(`wide`)은 **앱의 길 밖에 있다** — 사이드바(홈·지도·…)도 뒤로가기도 거기서는 갈 곳을 말하지 못한다.
   * 사이드바는 PC 표에서 260px 을 먹고, 뒤로가기(`/`)는 어디로 가는지 모를 화살표였다. 둘 다 빼고 표에 폭을 준다.
   */
  const bare = kind === 'wide';
  const showBack = !bare && !isRootRoute(pathname);
  const surface = mainSurfaceProps(kind);

  const { peek, finish, slideTo, enabled, surfaceRef, mainRef, leftRef, rightRef, surfaceProps } =
    useAppShellSwipe(pathname);

  /** 지금 화면에서 마지막으로 본 세로 위치. 경로가 바뀔 때 이 값을 그 화면의 몫으로 적는다. */
  const lastScrollY = useRef(0);
  const previousPath = useRef(pathname);
  useEffect(() => {
    const onScroll = () => {
      lastScrollY.current = window.scrollY;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useLayoutEffect(() => {
    if (previousPath.current !== pathname) {
      rememberScroll(previousPath.current, lastScrollY.current);
      previousPath.current = pathname;
    }

    const target = arrivalScrollOf(pathname);
    window.scrollTo(0, target);
    lastScrollY.current = target;

    // 밀어내 둔 화면을 제자리에 앉히고 엿보기를 치운다. 그리기 전에 해야 한 프레임도 비지 않는다.
    finish();

    // 상세의 뒤로가기가 앱 밖으로 나가도 되는지 판단하는 근거. lib/appHistory.ts 참고.
    stampHistoryDepth();

    if (target === 0 || window.scrollY === target) return;
    // 도착한 화면이 아직 그만큼 길지 않으면 브라우저가 잘라 버린다 — 다음 프레임에 한 번만 더.
    const retry = requestAnimationFrame(() => window.scrollTo(0, target));
    return () => cancelAnimationFrame(retry);
  }, [pathname, finish]);

  return (
    <div className="min-h-dvh bg-secondary">
      {/* 키보드·스위치 사용자가 사이드바·탭 줄을 매번 지나지 않게. 포커스가 올 때만 보인다. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-3 focus:text-sm focus:font-semibold focus:text-primary focus:shadow-lg"
      >
        본문으로 건너뛰기
      </a>
      {!bare && <AppSidebar />}

      <div className={cx(!bare && 'md:pl-64')}>
        {/*
          스와이프의 표면. `touch-pan-y` 라 세로는 브라우저가 스크롤로 가져가고 가로만 여기로
          온다(`pinch-zoom` 은 pan-y 만 적으면 같이 꺼지므로 되살린다). `overflow-x-clip` 은
          끌려 나가는 `<main>` 이 가로 스크롤을 만들지 않게 막는다 — `hidden` 과 달리 스크롤
          컨테이너를 만들지 않아 화면 안의 sticky 헤더를 건드리지 않는다.

          폭을 재는 자리이기도 하다. 이 상자는 엿보기(`fixed inset-0 md:pl-64`)와 같은 폭이라,
          폭 하나로 나가는 화면과 들어오는 화면을 같이 움직일 수 있다.

          **`touch-action` 은 스와이프를 받는 화면에만 건다.** 지도는 화면 전체가 네이버
          캔버스라 가로로 끄는 동작이 지도의 것인데, 여기서 `pan-y` 를 걸어 두면 그 가로
          제스처를 브라우저가 우리 몫으로 넘겨주고 지도는 영영 움직이지 않는다. 지도에도 핸들러는
          달리지만 가장자리 띠에서만 시작한다(`canStartSwipeAt`, ADR-014 v3).
        */}
        <div
          ref={surfaceRef}
          {...surfaceProps}
          className={cx('overflow-x-clip', enabled && 'touch-pan-y touch-pinch-zoom')}
        >
          <main ref={mainRef} id="main-content" tabIndex={-1} {...surface} className={cx(surface.className, 'outline-hidden')}>
            {showBack && <AppBar backTo={parentRouteOf(pathname)} />}
            {children}
          </main>
        </div>
      </div>

      {peek?.left && <AppShellSwipePeek ref={leftRef} side="left" route={peek.left} width={peek.width} />}
      {peek?.right && <AppShellSwipePeek ref={rightRef} side="right" route={peek.right} width={peek.width} />}

      {/* 탭을 누르면 주소를 바로 바꾸지 않고 셸이 손가락과 같은 길로 미끄러뜨린다(ADR-014 v5). */}
      <AppTabBar onNavigate={slideTo} />

      {/* 잠깐 뜨는 상태 한 줄("링크를 복사했어요"). `<main>` 밖이어야 스와이프에 끌려가지 않는다 — appStatusToast 참고. */}
      <AppStatusToast />
      <AppShellUpdateNotice />
    </div>
  );
}
