/**
 * 공식 홈페이지 카드의 **출처 표기**. 카드의 사진은 업체 사이트에 있는 것을 URL 로 띄울 뿐이라(ADR-002 v2)
 * "어디서 온 사진인가" 를 도메인으로 늘 적는다. `www.` 은 뗀다 — 사람이 읽는 이름이다.
 * 주소를 못 읽으면 원문 그대로 — 출처 줄이 비는 것보다 낫다.
 */
export function homepageHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
  } catch {
    return url;
  }
}
