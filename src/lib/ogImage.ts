import type { Metadata } from 'next';

/**
 * 링크 미리보기(카톡·문자) 카드 이미지 — 07 P1. 빌드 때 `app/og/[file]/route.ts` 가 PNG 로 굽는다.
 *
 * 주소가 `.png` 로 끝나야 한다. Next 의 `opengraph-image` 관례는 정적 내보내기에서 확장자 없는 파일
 * (`/place/<id>/opengraph-image`)을 만드는데, `trailingSlash: true` 인 Vercel 은 점 없는 경로를
 * 파일을 찾기 **전에** `…/opengraph-image/` 로 308 보내 404 가 난다. 빌드·로컬 미리보기는 통과한다.
 */
export const OG_IMAGE_SIZE = { width: 1200, height: 630 } as const;

/** 사이트 공통 카드(홈·목록·저장·지도 …). 장소 상세만 제 카드를 쓴다. */
export const OG_SITE_FILE = 'site.png';

export const ogImageFile = (placeId?: string): string => (placeId ? `${placeId}.png` : OG_SITE_FILE);

export const ogImagePath = (placeId?: string): string => `/og/${ogImageFile(placeId)}`;

/** `ogImageFile` 의 역. 사이트 카드면 `null`, 모양이 다르면 `undefined`. */
export const placeIdOfOgImageFile = (file: string): string | null | undefined => {
  if (file === OG_SITE_FILE) return null;
  const match = /^(.+)\.png$/.exec(file);
  return match ? match[1] : undefined;
};

/**
 * 모든 화면이 받는 Open Graph 칸. 자식의 `openGraph` 는 부모 것을 **통째로 대체**한다(칸끼리 합쳐지지
 * 않는다) — 그래서 상세처럼 제 카드를 쓰는 화면은 `placeId` 를 주고 이것을 펼친 뒤 제목·설명을 더한다.
 * `url` 은 적지 않는다: 저장 목록 공유(`/saved/?ids=…`)의 쿼리를 지우게 된다.
 */
export const siteOpenGraph = (alt: string, placeId?: string): NonNullable<Metadata['openGraph']> => ({
  siteName: '강아지랑 제주',
  locale: 'ko_KR',
  type: 'website',
  images: [{ url: ogImagePath(placeId), ...OG_IMAGE_SIZE, alt }],
});
