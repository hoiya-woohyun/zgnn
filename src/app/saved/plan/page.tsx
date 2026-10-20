import type { Metadata } from 'next';
import { SavedPlanPage } from '@/screens/savedPlanPage';

export const metadata: Metadata = {
  title: '날짜별로 정리',
  description: '저장한 곳을 1~4일차로 나누고 하루 순서를 정해요.',
};

export default function Page() {
  return <SavedPlanPage />;
}
