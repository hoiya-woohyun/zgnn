import type { Metadata } from 'next';
import { Suspense } from 'react';
import { MapRouteClient } from './mapRouteClient';

export const metadata: Metadata = {
  title: '지도',
  description: '반려견 동반 가능한 제주 숙소·식당·카페를 지도에서 한눈에. 종류와 방향으로 걸러볼 수 있어요.',
};

export default function Page() {
  /*
   * 지도 화면은 `?saved=1` 을 읽으려고 useSearchParams 를 쓴다.
   * 정적 내보내기에서는 그 훅이 Suspense 경계 안에 있어야 하고,
   * 그 경계는 클라이언트 컴포넌트 바깥, 즉 여기에 있어야 한다.
   */
  return (
    <Suspense fallback={<p className="px-5 pt-10 text-sm text-tertiary">지도를 불러오는 중이에요</p>}>
      <MapRouteClient />
    </Suspense>
  );
}
