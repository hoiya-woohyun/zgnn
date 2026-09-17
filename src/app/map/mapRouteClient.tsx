'use client';

import dynamic from 'next/dynamic';

/**
 * 지도는 Kakao SDK 를 `document.head` 에 스크립트로 붙여 받는다 — 서버에는 그 DOM 이 없다.
 * 서버에서 미리 그릴 수 없으므로 `ssr: false` 로 붙인다 —
 * 그 옵션은 클라이언트 컴포넌트 안에서만 쓸 수 있어서 이 파일이 따로 있다.
 */
const MapPage = dynamic(() => import('@/screens/mapPage').then((module) => module.MapPage), {
  ssr: false,
  loading: () => <p className="px-5 pt-10 text-sm text-tertiary">지도를 불러오는 중이에요</p>,
});

export function MapRouteClient() {
  return <MapPage />;
}
