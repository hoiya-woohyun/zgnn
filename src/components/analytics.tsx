'use client';

import { Analytics as VercelAnalytics } from '@vercel/analytics/next';
import { analyticsUrlOf } from '@/lib/analytics';
import { SITE_URL } from '@/lib/siteIndex';

const SITE_HOSTNAME = new URL(SITE_URL).hostname;

/**
 * Vercel Web Analytics — 페이지뷰만, 쿠키 없음, 같은 출처(`/_vercel/insights/*`)로 보낸다(ADR-031).
 *
 * 무엇을 셀지는 `analyticsUrlOf` 가 정한다(운영 주소의 사람 방문만). `beforeSend` 가 `null` 을 돌려주면 그 이벤트는 나가지 않는다.
 * 스크립트는 Vercel 이 서빙하는 경로라 로컬·프리뷰에선 애초에 404 이고, 오프라인이면 요청이 조용히 실패한다 — 어느 쪽도 화면은 모른다.
 */
export function Analytics() {
  return (
    <VercelAnalytics
      beforeSend={(event) => {
        const url = analyticsUrlOf({
          url: event.url,
          hostname: window.location.hostname,
          siteHostname: SITE_HOSTNAME,
          webdriver: navigator.webdriver === true,
        });
        return url === null ? null : { ...event, url };
      }}
    />
  );
}
