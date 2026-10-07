import type { Metadata } from 'next';
import { SavedPage } from '@/screens/savedPage';

export const metadata: Metadata = {
  title: '저장한 곳',
  // 공유 링크(`?ids=`, 07 P1)의 카톡 미리보기 문구도 된다 — 받는 사람이 읽어도 어색하지 않게 "누가 모았나" 를 말하지 않는다.
  description: '모아 둔 반려견 동반 제주 장소. 지도에서 한 번에 볼 수 있어요.',
};

export default function Page() {
  return <SavedPage />;
}
