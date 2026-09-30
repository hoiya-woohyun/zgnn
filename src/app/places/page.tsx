import type { Metadata } from 'next';
import { PlacesIndexPage } from '@/screens/placesIndexPage';

/**
 * `/places` 는 종류가 빠진 주소다. 정적 내보내기라 서버 리다이렉트가 없어(`vercel.json` 에 넣지
 * 않는다 — BUG-005 와 같은 파일이라 손대지 않는다), 페이지를 하나 두고 브라우저에서 숙소로 보낸다.
 */
export const metadata: Metadata = {
  title: '둘러보기',
  description: '반려견과 갈 수 있는 제주 숙소·식당·카페를 둘러보세요.',
};

export default function Page() {
  return <PlacesIndexPage />;
}
