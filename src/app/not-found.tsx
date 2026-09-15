import type { Metadata } from 'next';
import { NotFoundPage } from '@/screens/notFoundPage';

/** 제목은 layout 의 `%s | 강아지랑 제주` 템플릿을 거쳐 완성된다. */
export const metadata: Metadata = {
  title: '페이지를 찾을 수 없어요',
  description: '주소가 바뀌었거나 없는 장소일 수 있어요. 홈에서 다시 찾아보세요.',
};

export default function NotFound() {
  return <NotFoundPage />;
}
