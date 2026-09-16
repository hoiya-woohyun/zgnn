import type { Metadata } from 'next';
import { DogProfilePage } from '@/screens/dogProfilePage';

export const metadata: Metadata = {
  title: '우리 강아지 등록',
  description: '이름·몸무게·이동 수단을 등록하면 목록·지도·상세가 우리 강아지 기준으로 보입니다.',
};

export default function Page() {
  return <DogProfilePage />;
}
