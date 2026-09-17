'use client';

import { useEffect, useSyncExternalStore } from 'react';
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

/**
 * localStorage 를 이미 읽어들였는지. **없는 것을 근거로 말을 거는 화면**이 쓴다.
 *
 * 저장 개수처럼 "0 에서 실제 값으로 채워지는" 것은 이 훅이 필요 없다 — 정보가 늘어날 뿐이라
 * 첫 프레임이 틀려도 해가 없다. 하지만 "아직 안 챙겼어요" 같은 경고는 반대다. 읽기 전에는
 * 체크한 것이 하나도 없어 보이므로 **다 챙긴 사람에게도 경고가 떴다가 사라진다.** 없던 정보가
 * 생기는 것이 아니라 한 말을 무르는 것이라, 읽고 나서 말하는 편이 맞다.
 *
 * 서버 스냅샷은 `false` 로 고정한다. 빌드 때 만든 HTML 에는 localStorage 가 없으므로
 * 그것이 사실이고, 여기서 `true` 를 주면 하이드레이션이 어긋난다.
 */
export const useStoreHydrated = (): boolean =>
  useSyncExternalStore(
    (onStoreChange) => useAppStore.persist.onFinishHydration(onStoreChange),
    () => useAppStore.persist.hasHydrated(),
    () => false,
  );
