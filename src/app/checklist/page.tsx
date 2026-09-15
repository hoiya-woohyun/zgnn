import type { Metadata } from 'next';
import { ChecklistPage } from '@/screens/checklistPage';

export const metadata: Metadata = {
  title: '여행 준비물',
  description: '반려견과 제주를 다녀오며 챙겼던 물건들. 계절과 묵을 숙소에 맞춰 목록이 줄어듭니다.',
};

export default function Page() {
  return <ChecklistPage />;
}
