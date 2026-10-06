import type { MetadataRoute } from 'next';
import { SITE_URL, sitemapPaths } from '@/lib/siteIndex';

export const dynamic = 'force-static';

/** `lastModified` 는 적지 않는다 — 장소마다 믿을 만한 수정 시각이 없다(시드의 `verifiedAt` 은 null). 지어낸 날짜보다 없는 편이 낫다. */
export default function sitemap(): MetadataRoute.Sitemap {
  return sitemapPaths().map((path) => ({ url: `${SITE_URL}${path}` }));
}
