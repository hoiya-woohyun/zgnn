'use client';

import { useEffect } from 'react';
import { useAppStore } from '@/store/useAppStore';

/**
 * localStorage 에 저장해 둔 상태를 마운트 뒤에 한 번 읽어들인다.
 *
 * 정적 내보내기라 HTML 은 빌드 때 만들어지고, 그 안에는 저장 개수가 0 으로 박혀 있다.
 * zustand persist 가 첫 렌더에서 localStorage 를 읽어버리면 서버 HTML 과 값이 달라져
 * 하이드레이션 경고가 난다. 그래서 store 쪽은 skipHydration 으로 두고 여기서 깨운다.
 */
export function StoreHydration() {
  useEffect(() => {
    void useAppStore.persist.rehydrate();
  }, []);

  return null;
}
