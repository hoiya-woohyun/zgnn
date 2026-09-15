import { SearchMd } from '@untitledui/icons';
import { Button } from '../components/base/button';
import { EmptyState } from '../components/layout/emptyState';

export function NotFoundPage() {
  return (
    <div className="px-4 pt-20 md:px-6">
      <EmptyState
        Icon={SearchMd}
        title="없는 페이지예요"
        description="주소를 다시 확인해 주세요."
        action={
          <Button color="primary" size="md" href="/">
            홈으로 가기
          </Button>
        }
      />
    </div>
  );
}
