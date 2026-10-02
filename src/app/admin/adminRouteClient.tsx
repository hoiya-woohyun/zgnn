'use client';

import dynamic from 'next/dynamic';
import { recoverFromChunkError } from '@/lib/appUpdate';
import '../../styles/adminDensity.css';

/**
 * 검수 화면은 서버에서 미리 그릴 수 없다 — 첫 화면이 로그인 여부로 갈리는데 그 세션은 localStorage 에만 있다.
 * 정적 HTML 에 "로그인하세요" 를 구워 두면 이미 로그인한 운영자가 매번 그 화면을 한 번 보고 지나간다.
 * 그래서 `ssr: false` 로 붙인다 — 그 옵션은 클라이언트 컴포넌트 안에서만 쓸 수 있어서 이 파일이 따로 있다
 * (`map/mapRouteClient.tsx` 와 같은 이유·같은 모양).
 */
const AdminPage = dynamic(() => import('@/screens/adminPage').then((module) => module.AdminPage, recoverFromChunkError), {
  ssr: false,
  loading: () => <p className="px-5 pt-10 text-sm text-tertiary">불러오는 중이에요</p>,
});

/**
 * `data-admin-dense` 는 **스타일 스위치 하나**다 — `styles/adminDensity.css` 가 이 표식을 보고
 * 크기 축(`--spacing`)을 기준값에 못 박는다(ADR-006 의 예외). 화면 본체가 아니라 여기 붙이는 이유:
 * 늦게 불러오는 동안 뜨는 `loading` 줄까지 같은 크기여야 첫 프레임이 한 번 커졌다 줄어들지 않는다.
 */
export function AdminRouteClient() {
  return (
    <div data-admin-dense>
      <AdminPage />
    </div>
  );
}
