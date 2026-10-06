import type { MetadataRoute } from 'next';
import { SITE_BLURB } from '@/lib/places';

export const dynamic = 'force-static';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '강아지랑 제주',
    short_name: '강아지랑제주',
    description: `${SITE_BLURB} 안내`,
    lang: 'ko',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    // 맨 위 면이 전 화면 크림이라 스플래시 바탕과 같은 값이다(ADR-010 v3).
    // layout.tsx 의 viewport.themeColor 와 짝이다 — 한쪽만 바꾸면 어긋난다.
    theme_color: '#faf8f4',
    background_color: '#faf8f4',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
