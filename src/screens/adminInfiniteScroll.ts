'use client';

import { useEffect, useRef } from 'react';

/**
 * 목록 아래쪽에 다다르면 다음 묶음을 더 그린다. 두 칸('확인할 장소'·'올린 장소')이 같이 쓴다.
 *
 * **`cursor` 가 의존성에 있는 것이 이 훅의 전부다.** IntersectionObserver 는 "안 보이다가 보이는"
 * 순간에만 부르므로, 감시판이 계속 보이는 상태면 한 번 부르고 조용해진다 — PC 는 화면이 길어서
 * 30줄을 그려도 감시판이 여전히 보이는 일이 흔하다. 그러면 목록이 30줄에서 말없이 멈추고, 운영자는
 * 그것을 "다 봤다" 로 읽는다(이 화면이 곳곳에서 막으려는 바로 그 오독이다). `cursor` 가 바뀔 때마다
 * 감시자를 새로 걸면 첫 콜백이 지금 보이는지를 다시 답해 주고, 화면이 찰 때까지 스스로 이어진다.
 *
 * `showMore` 는 `useCallback` 으로 고정된 것을 받는다 — 매 렌더 새 함수를 받으면 렌더마다 감시자를
 * 다시 걸어 같은 일을 훨씬 자주 한다.
 *
 * 미리 부르는 여유(`rootMargin`)를 크게 두는 이유: 바닥에 닿은 **뒤에** 그리기 시작하면 끊긴 느낌이 난다.
 *
 * @param hasMore  아직 더 그릴 것이 남았는가. false 면 감시자를 아예 걸지 않는다.
 * @param cursor   지금 몇 줄까지 그렸나. 이 값이 바뀔 때마다 감시자를 다시 건다.
 * @param showMore 다음 묶음을 더 그린다.
 * @returns 목록 끝에 붙일 감시판의 ref.
 */
export function useAdminInfiniteScroll(hasMore: boolean, cursor: number, showMore: () => void) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) showMore();
      },
      { rootMargin: '600px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [cursor, hasMore, showMore]);

  return sentinelRef;
}
