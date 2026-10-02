'use client';

import { useSyncExternalStore } from 'react';
import { SearchMd, WifiOff } from '@untitledui/icons';
import { Button } from '../components/base/button';
import { EmptyState } from '../components/layout/emptyState';

const subscribeOnline = (listener: () => void) => {
  window.addEventListener('online', listener);
  window.addEventListener('offline', listener);
  return () => {
    window.removeEventListener('online', listener);
    window.removeEventListener('offline', listener);
  };
};

/**
 * 없는 주소. 사용자는 주소를 고칠 수 없다(PWA 엔 주소창도 없다) — "주소를 확인해 주세요" 대신
 * 갈 수 있는 곳 두 개를 준다: 홈과, 가장 많이 찾는 둘러보기.
 *
 * **오프라인이면 다른 말을 한다**(12 U2.5). 서비스워커는 프리캐시에 없는 문서를 오프라인에서 열면 이 화면(`/404.html`)을
 * 돌려주는데, 그때는 없는 곳이 아니라 **아직 못 받은 곳**이다 — 공유받은 신규 장소가 그렇다. "없어진 곳일 수 있어요" 라고 하면
 * 연결이 돌아와도 다시 열어 볼 생각을 안 한다. 서버 스냅샷은 온라인이다 — 정적 HTML 은 원래 문구로 그려지고 하이드레이션 뒤에 갈린다.
 */
export function NotFoundPage() {
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);

  if (!online) {
    return (
      <div className="px-4 pt-20 md:px-6">
        <EmptyState
          Icon={WifiOff}
          title="오프라인이라 열 수 없어요"
          description="이 화면은 아직 받아 두지 않았어요. 연결되면 다시 시도해 주세요."
          action={
            <div className="flex gap-2">
              <Button color="primary" size="lg" onClick={() => window.location.reload()}>
                다시 시도
              </Button>
              <Button color="secondary" size="lg" href="/">
                홈으로
              </Button>
            </div>
          }
        />
      </div>
    );
  }

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
