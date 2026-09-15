import type { Metadata } from 'next';
import { HomePage } from '@/screens/homePage';

/*
 * 제목은 layout 의 기본값("강아지랑 제주")을 그대로 쓴다. 홈에 따로 붙이면
 * 템플릿을 거쳐 "강아지랑 제주 | 강아지랑 제주" 처럼 겹친다.
 */
export const metadata: Metadata = {
  description:
    '강아지와 함께 갈 수 있는 제주 숙소·식당·카페 86곳과 여행 준비물. 실내 동반 조건과 추가 요금을 한눈에 확인하세요.',
};

export default function Page() {
  return <HomePage />;
}
