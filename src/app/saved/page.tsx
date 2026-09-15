import type { Metadata } from 'next';
import { SavedPage } from '@/screens/savedPage';

export const metadata: Metadata = {
  title: '저장한 곳',
  description: '하트를 눌러 모아둔 장소. 지도에서 한 번에 볼 수 있어요.',
};

export default function Page() {
  return <SavedPage />;
}
