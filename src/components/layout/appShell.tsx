'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { AppBar } from './appBar';
import { AppSidebar } from './appSidebar';
import { AppTabBar } from './appTabBar';
import { stampHistoryDepth } from '../../lib/appHistory';
import { isRootRoute, parentRouteOf } from '../../lib/appRoutes';

/**
 * 스크롤 화면의 아래 여백. 탭바 높이(appTabBar)에 여유를 더해
 * 마지막 줄이 탭바에 가리지 않게 한다.
 */
const CONTENT_BOTTOM_SPACE = 'calc(76px + env(safe-area-inset-bottom, 0px))';

/**
 * 앱 셸.
 *
 * 모바일은 [콘텐츠 + 하단 탭바], 데스크톱(md 이상)은 [좌측 사이드바 + 콘텐츠] 로 갈린다.
 * 지도 화면만 예외로 콘텐츠 폭을 제한하지 않고 아래 여백도 두지 않는다 —
 * 지도는 남는 공간을 전부 쓰는 편이 쓸모 있고, 아래 여백을 두면 타일이 안 깔린 띠가 남는다.
 *
 * 뒤로가기는 화면이 아니라 셸이 붙인다. 탭바에 없는 화면(= 무언가를 눌러 들어온 하위 화면)은
 * 모바일에서 되돌아갈 수단이 없기 때문이다 — 홈 화면에서 띄운 PWA 에는 브라우저 뒤로가기도
 * 없다. 루트 여부는 `lib/appRoutes.ts` 가 판정하므로, 화면을 새로 만들 때는 그 표에만
 * 손대면 되고 화면 쪽에서는 아무것도 하지 않는다.
 *
 * 상태바(safe-area-inset-top)도 같은 방식이다(ADR-010). `viewportFit: cover` 라 내용이 상태바
 * 밑까지 깔리는데, 그 자리를 화면마다 알아서 피하게 두면 하나만 빠져도 노치 기기에서만 깨진다.
 * 그래서 **여백은 여기 한 곳에서만 준다** — `<main>` 에 인셋만큼 위 여백. 화면 쪽에서
 * `pt-safe` 를 붙일 일이 없다.
 *
 * 그 여백은 아무도 칠하지 않아 페이지 바탕(크림)이 비친다. **맨 위 면은 전 화면 크림이므로
 * 그것으로 끝난다**(ADR-010 v3) — 셸은 어떤 화면의 맨 위가 무슨 색인지 알 필요가 없다.
 *
 * v1 은 셸이 인셋 높이의 띠를 fixed 로 깔고 경로표가 그 색을 복제했고, v2 는 그 띠를 버린
 * 대신 화면 첫 블록(`data-top-surface`)의 색을 읽어 `<html>` 배경에 옮겨 담았다. 둘 다 "화면마다
 * 맨 위 색이 다르다" 는 전제에서 나온 장치다. 그 전제를 없애니 장치도 함께 없어졌다 —
 * `<html>` 배경은 globals.css 가 크림으로 정적으로 칠하고, 아무도 덮어쓰지 않는다.
 *
 * 지도만 여백이 없다 — 타일이 상태바 밑까지 깔리는 편이 지도답다.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isMap = pathname.startsWith('/map');
  const showBack = !isRootRoute(pathname);

  useEffect(() => {
    // 화면을 옮기면 스크롤을 위로 되돌린다. 목록에서 상세로 갔다가 돌아올 때 위치가 튀지 않게.
    window.scrollTo(0, 0);

    // 상세의 뒤로가기가 앱 밖으로 나가도 되는지 판단하는 근거. lib/appHistory.ts 참고.
    stampHistoryDepth();
  }, [pathname]);

  return (
    <div className="min-h-dvh bg-secondary">
      <AppSidebar />

      <div className="md:pl-64">
        <main
          className={isMap ? '' : 'mx-auto w-full max-w-3xl'}
          style={
            isMap
              ? undefined
              : { paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: CONTENT_BOTTOM_SPACE }
          }
        >
          {showBack && <AppBar backTo={parentRouteOf(pathname)} />}
          {children}
        </main>
      </div>

      <AppTabBar />
    </div>
  );
}
