import { PLACES, PLACE_TYPES } from './places';

/**
 * 배포 주소. 정적 내보내기라 요청 호스트를 알 길이 없어 `robots.txt`·`sitemap.xml` 의 절대 주소를 여기 하나에 둔다.
 * 도메인을 옮기면 이 줄과 NCP 콘솔의 Web 서비스 URL(ADR-008)을 함께 바꾼다.
 */
export const SITE_URL = 'https://zgnn.vercel.app';

/**
 * 검색에 내보낼 경로 — 누구에게나 같은 내용을 보여주는 화면만(07 P1).
 *
 * 빼는 것: `/admin`(운영자 화면 — robots 에서도 막는다), `/saved`·`/dog`·`/settings`(내 기기의 저장값을 그리는
 * 화면이라 크롤러에게는 빈 화면), `/places`(브라우저에서 `/places/stay/` 로 보내는 빈 주소).
 * `trailingSlash: true` 라 전부 슬래시로 끝낸다 — 슬래시 없는 주소는 리다이렉트를 한 번 거친다.
 */
export const sitemapPaths = (): string[] => [
  '/',
  ...PLACE_TYPES.map((type) => `/places/${type}/`),
  '/map/',
  '/checklist/',
  ...PLACES.map((place) => `/place/${place.id}/`),
];

/** robots 에서 막는 경로. 메타 `noindex`(`app/admin/page.tsx`)와 둘 다 둔다 — 막아도 링크로 색인될 수 있어서. */
export const ROBOTS_DISALLOW = ['/admin/'];
