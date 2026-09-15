import type { Metadata, Viewport } from 'next';
import { AppShell } from '@/components/layout/appShell';
import { RouteProvider } from '@/providers/routerProvider';
import { StoreHydration } from '@/providers/storeHydration';
import '@/styles/globals.css';

const DESCRIPTION =
  '짱구누나가 직접 다녀온 반려견 동반 가능한 제주 숙소·식당·카페 86곳. 실내 동반 조건과 추가 요금을 한눈에 확인하세요.';

export const metadata: Metadata = {
  title: {
    default: '강아지랑 제주',
    template: '%s | 강아지랑 제주',
  },
  description: DESCRIPTION,
  applicationName: '강아지랑 제주',
  appleWebApp: {
    capable: true,
    title: '강아지랑제주',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    icon: [{ url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
    apple: [{ url: '/icons/icon-180.png' }],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#2e2327',
  // 다크 모드는 범위 밖이다. 토큰은 준비돼 있지만 .dark-mode 를 켜지 않는다.
  colorScheme: 'light',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <RouteProvider>
          <StoreHydration />
          <AppShell>{children}</AppShell>
        </RouteProvider>
      </body>
    </html>
  );
}
