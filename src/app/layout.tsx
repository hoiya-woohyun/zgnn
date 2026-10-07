import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import { AppShell } from '@/components/layout/appShell';
import { siteOpenGraph } from '@/lib/ogImage';
import { PLACES, SITE_BLURB } from '@/lib/places';
import { SITE_URL } from '@/lib/siteIndex';
import { RouteProvider } from '@/providers/routerProvider';
import { StoreHydration } from '@/providers/storeHydration';
import '@/styles/globals.css';

/**
 * 본문 글꼴 — Pretendard(SIL OFL 1.1)를 서브셋한 파생본. 파일·글꼴 이름이 `Zgnn Sans` 인 것은
 * Pretendard 가 OFL 의 **예약 글꼴 이름(RFN)** 이라, 고친 파생본(서브셋)은 그 이름을 쓸 수 없어서다.
 * 원본·라이선스 전문은 app/fonts/ 에 있다.
 *
 * 나눔스퀘어 네오에서 옮겼다(ADR-006 v6). 네모난 글꼴이라 한글이 글자 칸의 91% 를 채워, 토큰이 표준
 * 크기(16·14·12px)인데도 "다른 앱보다 크다" 로 읽혔다. Pretendard 는 85% 라 같은 px 에서 한 치수
 * 작게 보이고, 글자 폭도 9% 좁아 한 줄에 더 들어간다. 크기 토큰은 그대로 두고 글꼴만 바꾼 것이다.
 *
 * CDN 대신 self-host 한다. 이 앱은 오프라인 프리캐시가 기능의 일부라
 * (비행기 모드·제주 산간에서 열어보는 앱이다) 외부 도메인에 기대면 그때 글꼴이 시스템 폰트로
 * 떨어진다. 외부 요청이 0건이면 CSP·추적 문제도 같이 사라진다.
 *
 * 한글 완성형 11,172자 + 라틴 + 문장부호로 서브셋해 굵기당 약 620KB 다(재생성 절차는
 * docs/architecture/pwa-offline.md). 완성형 전체를 넣은 것은 강아지 이름처럼 **사용자가 직접 치는
 * 글자**가 있기 때문이다 — 상용 2350자로 줄이면 "똠", "쀼" 같은 이름에서 그 글자만 시스템 폰트로 튄다.
 *
 * 굵기는 400·600 둘이다. font-medium(500)은 400 에, font-bold(700)는 CSS 폰트 매칭 규칙상 600 에
 * 붙는다 — 700 을 따로 싣지 않은 것은 용량(+620KB)과, 굵은 글씨가 과하게 무거워 크게 읽히던 것을 함께
 * 줄이기 위해서다.
 */
const appSans = localFont({
  src: [
    { path: './fonts/ZgnnSans-Regular.woff2', weight: '400', style: 'normal' },
    { path: './fonts/ZgnnSans-SemiBold.woff2', weight: '600', style: 'normal' },
  ],
  variable: '--font-app',
  display: 'swap',
});

const DESCRIPTION = `${SITE_BLURB} ${PLACES.length}곳. 실내 동반 조건과 추가 요금을 한눈에 확인하세요.`;

export const metadata: Metadata = {
  // 미리보기 이미지(`og:image`)는 절대 주소여야 카톡이 읽는다. 정적 내보내기라 요청 호스트 대신 배포 주소로 붙인다.
  metadataBase: new URL(SITE_URL),
  title: {
    default: '강아지랑 제주',
    template: '%s | 강아지랑 제주',
  },
  description: DESCRIPTION,
  openGraph: siteOpenGraph('강아지랑 제주'),
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
    <html lang="ko" className={appSans.variable}>
      <body>
        <RouteProvider>
          <StoreHydration />
          <AppShell>{children}</AppShell>
        </RouteProvider>
      </body>
    </html>
  );
}
