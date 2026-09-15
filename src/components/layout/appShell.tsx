'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { AppSidebar } from './appSidebar';
import { AppTabBar } from './appTabBar';
import { markInAppNavigation } from '../../lib/appHistory';

/**
 * 탭바가 실제로 차지하는 높이. appTabBar 의 고정 높이와 같아야 한다.
 * 지도는 이 값을 빼서 높이를 잡고(아래에 빈 띠가 생기지 않게),
 * 스크롤 화면은 여기에 여유를 더해 마지막 줄이 탭바에 가리지 않게 한다.
 */
export const TAB_BAR_HEIGHT = 'calc(60px + env(safe-area-inset-bottom, 0px))';
const CONTENT_BOTTOM_SPACE = 'calc(76px + env(safe-area-inset-bottom, 0px))';

/**
 * 앱 셸.
 *
 * 모바일은 [콘텐츠 + 하단 탭바], 데스크톱(md 이상)은 [좌측 사이드바 + 콘텐츠] 로 갈린다.
 * 지도 화면만 예외로 콘텐츠 폭을 제한하지 않고 아래 여백도 두지 않는다 —
 * 지도는 남는 공간을 전부 쓰는 편이 쓸모 있고, 아래 여백을 두면 타일이 안 깔린 띠가 남는다.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isMap = pathname.startsWith('/map');
  const entryPathname = useRef(pathname);

  useEffect(() => {
    // 화면을 옮기면 스크롤을 위로 되돌린다. 목록에서 상세로 갔다가 돌아올 때 위치가 튀지 않게.
    window.scrollTo(0, 0);

    // 상세의 뒤로가기가 앱 밖으로 나가도 되는지 판단하는 근거. lib/appHistory.ts 참고.
    if (pathname !== entryPathname.current) markInAppNavigation();
  }, [pathname]);

  return (
    <div className="min-h-dvh bg-secondary">
      <AppSidebar />

      <div className="md:pl-64">
        <main
          className={isMap ? '' : 'mx-auto w-full max-w-3xl'}
          style={isMap ? undefined : { paddingBottom: CONTENT_BOTTOM_SPACE }}
        >
          {children}
        </main>
      </div>

      <AppTabBar />
    </div>
  );
}
