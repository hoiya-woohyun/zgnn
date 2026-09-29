import type { Metadata } from 'next';
import { AdminRouteClient } from './adminRouteClient';

export const metadata: Metadata = {
  title: '장소 검수',
  description: '블로그에서 찾은 장소를 확인하고 올려요',
  /*
   * 운영자 전용 화면이라 검색에 잡히지 않게 한다. **보안이 아니다** — `out/admin/index.html` 은 누구나 열 수 있는
   * 공개 파일이고, 경계는 Supabase 의 RLS·GRANT 뿐이다(ADR-018). 링크가 없는 화면이 검색 결과에 뜨면
   * 사용자가 검수 화면을 서비스의 일부로 오해하는 것, 그것만 막는다.
   */
  robots: { index: false, follow: false },
};

export default function Page() {
  return <AdminRouteClient />;
}
