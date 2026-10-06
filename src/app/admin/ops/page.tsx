import type { Metadata } from 'next';
import { AdminOpsRouteClient } from './adminOpsRouteClient';

export const metadata: Metadata = {
  title: '운영 현황',
  description: '수집·분석·검수·반영·재빌드가 돌고 있는지 봐요',
  // `/admin` 과 같다 — 검색에 안 잡히게 할 뿐 보안이 아니다(경계는 RLS·GRANT, ADR-018).
  robots: { index: false, follow: false },
};

export default function Page() {
  return <AdminOpsRouteClient />;
}
