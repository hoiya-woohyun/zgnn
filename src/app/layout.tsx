import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import { AppShell } from '@/components/layout/appShell';
import { RouteProvider } from '@/providers/routerProvider';
import { StoreHydration } from '@/providers/storeHydration';
import '@/styles/globals.css';

/**
 * 나눔스퀘어 네오 — 네이버가 나눔글꼴 라이선스로 배포하는 무료 글꼴.
 *
 * CDN(hangeul.pstatic.net) 대신 self-host 한다. 이 앱은 오프라인 프리캐시가 기능의 일부라
 * (비행기 모드·제주 산간에서 열어보는 앱이다) 외부 도메인에 기대면 그때 글꼴이 시스템 폰트로
 * 떨어진다. 외부 요청이 0건이면 CSP·추적 문제도 같이 사라진다.
 *
 * 원본 TTF 는 굵기당 2.1MB 라 그대로 못 싣는다. 한글 완성형 11,172자 + 라틴 + 문장부호로
 * 서브셋해 woff2 로 구우면 굵기당 353KB 다(재생성 절차는 docs/architecture/pwa-offline.md).
 * 완성형 전체를 넣은 것은 강아지 이름처럼 **사용자가 직접 치는 글자**가 있기 때문이다 —
 * 상용 2350자로 줄이면 "똠", "쀼" 같은 이름에서 그 글자만 시스템 폰트로 튄다.
 *
 * 굵기는 400·700 둘뿐이다. 앱이 많이 쓰는 font-semibold(600)는 CSS 폰트 매칭 규칙상
 * 700 으로 붙는다(합성 볼드가 아니라 진짜 Bold 자족). 굵기를 하나 더 늘리면 +353KB 다.
 */
const nanumSquareNeo = localFont({
  src: [
    { path: './fonts/NanumSquareNeo-Regular.woff2', weight: '400', style: 'normal' },
    { path: './fonts/NanumSquareNeo-Bold.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-nanum',
  display: 'swap',
});

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
    /*
      맨 위 면이 전 화면 크림이 되면서(ADR-010 v3) 흰 글씨를 강제하는 `black-translucent` 는
      쓸 수 없다 — 크림 위의 흰 글씨는 읽히지 않는다. `default` 가 검정 글씨 쪽 값이다.

      **`viewport-fit: cover` 와 만났을 때 내용이 상태바 밑까지 깔리는지는 실기기 확인 대상이다**
      (iOS 버전마다 보고가 갈린다). 레이아웃이 안 깨지는 것까지만 단언할 수 있다 — 깔리면 셸이
      주는 인셋 여백(크림)이 그 자리를 쓰고, 안 깔리면 인셋이 0 이 되어 여백만 사라진다.

      안 깔리는 경우 그 띠는 우리 뷰포트 밖이라 iOS 가 칠한다. 아래 `themeColor`(크림)를 쓸지
      시스템 흰색으로 떨어질지는 **확인 전까지 모른다.** 글씨가 검정이 되는 것만 보장된다.
    */
    statusBarStyle: 'default',
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
  /*
    페이지 바탕(크림, `--color-neutral-50`). 예전에는 잉크(#2e2327)였다 — 홈 히어로가 맨 위
    면이던 시절의 값이라 나머지 화면에서는 어두운 띠가 됐다. 맨 위 면을 전 화면 크림으로
    통일하면서(ADR-010 v3) 한 값으로 맞는다. manifest.ts 의 `theme_color` 와 같이 움직인다.
  */
  themeColor: '#faf8f4',
  // 다크 모드는 범위 밖이다. 토큰은 준비돼 있지만 .dark-mode 를 켜지 않는다.
  colorScheme: 'light',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={nanumSquareNeo.variable}>
      <body>
        <RouteProvider>
          <StoreHydration />
          <AppShell>{children}</AppShell>
        </RouteProvider>
      </body>
    </html>
  );
}
