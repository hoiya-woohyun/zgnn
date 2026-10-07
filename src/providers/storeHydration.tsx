'use client';

import { useEffect, useSyncExternalStore } from 'react';
import {
  countVisitOnce,
  isHydrationSettled,
  markHydrationSettled,
  subscribeHydrationSettled,
  useAppStore,
} from '@/store/useAppStore';

/**
 * localStorage 에 저장해 둔 상태를 마운트 뒤에 한 번 읽어들인다.
 *
 * 정적 내보내기라 HTML 은 빌드 때 만들어지고, 그 안에는 저장 개수가 0 으로 박혀 있다.
 * zustand persist 가 첫 렌더에서 localStorage 를 읽어버리면 서버 HTML 과 값이 달라져
 * 하이드레이션 경고가 난다. 그래서 store 쪽은 skipHydration 으로 두고 여기서 깨운다.
 */
/**
 * 방문 수를 센 뒤 신호를 올린다. 보통은 store 의 `onRehydrateStorage` 가 둘 다 먼저 해서 여기선 둘 다 no-op 이다 —
 * 저장소를 열 수 없어 그 콜백이 아예 안 도는 경우(아래 `!persistApi`)를 위해 같은 순서로 한 번 더 둔다.
 */
const settleAndCountVisit = () => {
  countVisitOnce();
  markHydrationSettled();
};

export function StoreHydration() {
  useEffect(() => {
    /*
     * `rehydrate()` 는 성공이든 실패든 resolve 한다(측정). 그래서 여기서는 결과를 보지 않고
     * "끝났다" 는 것만 알린다 — 실패의 뒷정리는 store 쪽 `onRehydrateStorage` 가 맡는다.
     *
     * store 쪽에서도 같은 신호를 올리는데 여기서 한 번 더 찍는 이유: 먼저 온 쪽이 이기므로
     * 두 번 불려도 무해하고, 어느 한쪽이 빠져도 화면이 기다림에 갇히지 않는다.
     *
     * **localStorage 를 아예 열 수 없는 환경**(쿠키·사이트 데이터 차단 — 접근이 `SecurityError`)이면
     * zustand 는 저장소를 포기하면서 `persist` API 자체를 **붙이지 않는다**(타입은 늘 있다고 말한다).
     * 그대로 `.rehydrate()` 를 부르면 첫 화면이 통째로 에러가 된다(12 U0.1, 재현함). 그때는 읽을 것이
     * 없다는 것이 결말이므로 신호만 올린다 — 화면은 기본값(저장 0·프로필 없음)으로 그린다.
     */
    const persistApi = useAppStore.persist as typeof useAppStore.persist | undefined;
    if (!persistApi) {
      settleAndCountVisit();
      return;
    }
    Promise.resolve(persistApi.rehydrate()).then(settleAndCountVisit, settleAndCountVisit);
  }, []);

  return null;
}

/**
 * localStorage 읽기가 끝났는지. **없는 것을 근거로 말을 거는 화면**이 쓴다.
 *
 * 저장 개수처럼 "0 에서 실제 값으로 채워지는" 것은 이 훅이 필요 없다 — 정보가 늘어날 뿐이라
 * 첫 프레임이 틀려도 해가 없다. 하지만 "아직 안 챙겼어요" 같은 경고는 반대다. 읽기 전에는
 * 체크한 것이 하나도 없어 보이므로 **다 챙긴 사람에게도 경고가 떴다가 사라진다.** 없던 정보가
 * 생기는 것이 아니라 한 말을 무르는 것이라, 읽고 나서 말하는 편이 맞다.
 *
 * **`persist.hasHydrated()` 를 쓰지 않는다** — 그쪽은 "성공했는지" 라서 저장된 값이 깨져
 * 있으면 영원히 false 다. 여기 필요한 것은 "더 기다려도 소용없는가" 이므로 성공·실패를
 * 가리지 않는 신호를 본다(store/useAppStore.ts 의 `hydrationSettled`).
 *
 * 서버 스냅샷은 `false` 로 고정한다. 빌드 때 만든 HTML 에는 localStorage 가 없으므로
 * 그것이 사실이고, 여기서 `true` 를 주면 하이드레이션이 어긋난다.
 */
export const useStoreHydrated = (): boolean =>
  useSyncExternalStore(subscribeHydrationSettled, isHydrationSettled, () => false);
