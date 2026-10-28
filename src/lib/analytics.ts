/**
 * Vercel Web Analytics(페이지뷰만, ADR-031)에 **무엇을 보낼까**. 보내기 자체는 `@vercel/analytics` 가 한다 —
 * 여기는 그 앞의 거름망(`beforeSend`)이 쓰는 순수 판단이다.
 *
 * 실사용 이벤트(`uiEvents.ts`)와 같은 선을 긋는다: **운영 주소의 사람 방문만** 센다. 로컬 `next dev`·LAN·프리뷰 배포·`/ux-eval`(webdriver)과
 * 운영자 화면(`/admin`)이 모수에 섞이면 19 §4 의 정량 go 가 부풀거나 흐려진다.
 */

import { isAdminRoute } from './uiEvents';

/** 페이지뷰 하나 — 보낼 주소를 돌려주고, 안 센다면 `null`. 주소는 **경로만**(쿼리·해시를 떼서) 보낸다. */
export function analyticsUrlOf({
  url,
  hostname,
  siteHostname,
  webdriver,
}: {
  url: string;
  hostname: string;
  siteHostname: string;
  webdriver: boolean;
}): string | null {
  if (webdriver || hostname !== siteHostname) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (isAdminRoute(parsed.pathname)) return null;
  return `${parsed.origin}${parsed.pathname}`;
}
