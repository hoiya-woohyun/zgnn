'use client';

import { SearchMd } from '@untitledui/icons';
import { Button } from '../components/base/button';
import { EmptyState } from '../components/layout/emptyState';

/**
 * 없는 주소. 사용자는 주소를 고칠 수 없다(PWA 엔 주소창도 없다) — "주소를 확인해 주세요" 대신
 * 갈 수 있는 곳 두 개를 준다: 홈과, 가장 많이 찾는 둘러보기.
 */
export function NotFoundPage() {
  return (
    <div className="px-4 pt-20 md:px-6">
      <EmptyState
        Icon={SearchMd}
        title="찾는 화면이 없어요"
        description="주소가 바뀌었거나 없어진 곳일 수 있어요."
        action={
          <div className="flex gap-2">
            <Button color="primary" size="lg" href="/">
              홈으로
            </Button>
            <Button color="secondary" size="lg" href="/places/stay">
              둘러보기로
            </Button>
          </div>
        }
      />
    </div>
  );
}
