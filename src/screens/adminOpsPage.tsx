'use client';

import { PageHeader } from '../components/layout/pageHeader';

/**
 * 운영 현황 화면(`/admin/ops`) — 파이프라인(수집·분석·검수·반영·재빌드)이 돌고 있는지를 한 화면에서 본다
 * (docs/features/ops-dashboard.md · ADR-023 · todo/15 T3).
 *
 * T3.1 은 라우트만 세운다 — 본체(세션·집계·다섯 칸)는 T3.4 에서 채운다.
 */
export function AdminOpsPage() {
  return (
    <div>
      <PageHeader title="운영 현황" description="파이프라인이 돌고 있는지 봐요" />
    </div>
  );
}
