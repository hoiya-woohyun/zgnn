'use client';

import dynamic from 'next/dynamic';
import { recoverFromChunkError } from '@/lib/appUpdate';

/**
 * 지도는 네이버 지도 SDK 를 `document.head` 에 스크립트로 붙여 받는다 — 서버에는 그 DOM 이 없다.
 * 서버에서 미리 그릴 수 없으므로 `ssr: false` 로 붙인다 —
 * 그 옵션은 클라이언트 컴포넌트 안에서만 쓸 수 있어서 이 파일이 따로 있다.
 *
 * 청크를 못 받으면(새 배포가 옛 청크 이름을 지웠다) 한 번만 새로고침한다 — `lib/appUpdate.ts`(12 U2.4).
 */
const MapPage = dynamic(() => import('@/screens/mapPage').then((module) => module.MapPage, recoverFromChunkError), {
  ssr: false,
  loading: () => <p className="px-5 pt-10 text-sm text-tertiary">지도를 불러오는 중이에요</p>,
});

export function MapRouteClient() {
  return <MapPage />;
}
