import type { Metadata } from 'next';
import { SettingsPage } from '@/screens/settingsPage';

export const metadata: Metadata = {
  title: '설정',
  description: '우리 강아지 프로필, 저장한 곳, 자료 출처.',
};

export default function Page() {
  return <SettingsPage />;
}
