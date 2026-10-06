import type { MetadataRoute } from 'next';
import { ROBOTS_DISALLOW, SITE_URL } from '@/lib/siteIndex';

export const dynamic = 'force-static';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ROBOTS_DISALLOW },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
