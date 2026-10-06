'use client';

import dynamic from 'next/dynamic';
import { recoverFromChunkError } from '@/lib/appUpdate';
import '../../../styles/adminDensity.css';

/**
 * `/admin` 의 `adminRouteClient.tsx` 를 그대로 본뜬다 — 첫 화면이 로그인 여부로 갈리고 그 세션은 localStorage 에만 있어
 * 서버에서 미리 그릴 수 없다(`ssr: false`). 세션도 `/admin` 과 같은 것을 쓴다(ADR-023 결정 2).
 */
const AdminOpsPage = dynamic(() => import('@/screens/adminOpsPage').then((module) => module.AdminOpsPage, recoverFromChunkError), {
  ssr: false,
  loading: () => <p className="px-5 pt-10 text-sm text-tertiary">불러오는 중이에요</p>,
});

/** `data-admin-dense` 를 여기 붙이는 이유도 `/admin` 과 같다 — `loading` 줄까지 같은 크기여야 첫 프레임이 뛰지 않는다. */
export function AdminOpsRouteClient() {
  return (
    <div data-admin-dense>
      <AdminOpsPage />
    </div>
  );
}
