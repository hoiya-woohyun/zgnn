import { useMemo } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { sanitizeDog } from '../lib/dogProfile';
import { ALL_TOWNS, PLACES_BY_ID, selectSavedPlaces } from '../lib/places';
import type { TDogProfile } from '../types';

/** 사계절 항목은 항상 보이므로, 계절 선택은 여름/겨울 둘 중 하나이거나 선택 안 함(null)이다. */
export type TSeasonFilter = '여름' | '겨울' | null;

type TAppState = {
  savedIds: string[];
  checkedItemIds: string[];
  season: TSeasonFilter;
  /** 우리 강아지 프로필. 없으면(null) 판정 없이 v0 화면 그대로. */
  dog: TDogProfile | null;
  /** 이번 여행에 실내 자리가 꼭 필요한지 — 강아지 정보가 아니라 여행 정보라 따로 둔다. */
  needsIndoor: boolean;
  /**
   * 지금 둘러보는 읍면. 한 번 고르면 둘러보기·지도·홈을 넘나들어도 유지된다(2026-09-15 리뷰 P1 —
   * "하나만 고치면: 읍면 한 번 고르면 숙소·식당·카페·지도 모두 유지").
   */
  town: string | null;
  toggleSaved: (id: string) => void;
  toggleChecked: (id: string) => void;
  setSeason: (season: TSeasonFilter) => void;
  setDog: (dog: TDogProfile) => void;
  clearDog: () => void;
  setNeedsIndoor: (needsIndoor: boolean) => void;
  setTown: (town: string | null) => void;
};

const toggle = (list: string[], id: string) =>
  list.includes(id) ? list.filter((value) => value !== id) : [...list, id];

const STORAGE_NAME = 'zgnn-jeju';

/**
 * localStorage 읽기가 **끝났는지**. 성공했는지가 아니다.
 *
 * zustand 의 `persist.hasHydrated()` 는 "성공했는지" 를 답한다 — 저장된 값이 깨져 있으면
 * (JSON.parse 실패) `rehydrate()` 는 그대로 resolve 하면서도 `hasHydrated()` 는 **영원히
 * false** 로 남는다. 그것을 "아직 읽는 중" 으로 읽은 화면은 로딩 문구에 갇힌다
 * (강아지 등록 화면이 그랬다 → docs/bugs/BUG-002-hydration-deadlock.md).
 *
 * 화면이 실제로 묻고 싶은 것은 "더 기다리면 값이 달라지나" 다. 실패를 성공으로 치자는 게
 * 아니라, **실패도 결말**이라 그 뒤로는 기다릴 이유가 없다는 뜻이다. 실패했으면 저장된 값이
 * 없는 것과 같은 상태(기본값)로 화면을 그리면 된다.
 */
let hydrationSettled = false;
const hydrationListeners = new Set<() => void>();

export const isHydrationSettled = () => hydrationSettled;

export const subscribeHydrationSettled = (listener: () => void) => {
  hydrationListeners.add(listener);
  return () => {
    hydrationListeners.delete(listener);
  };
};

/** 두 곳에서 불린다(아래 `onRehydrateStorage`, providers/storeHydration.tsx). 먼저 온 쪽이 이긴다. */
export const markHydrationSettled = () => {
  if (hydrationSettled) return;
  hydrationSettled = true;
  for (const listener of [...hydrationListeners]) listener();
};

export const useAppStore = create<TAppState>()(
  persist(
    (set) => ({
      savedIds: [],
      checkedItemIds: [],
      season: null,
      dog: null,
      needsIndoor: false,
      town: null,
      toggleSaved: (id) => set((state) => ({ savedIds: toggle(state.savedIds, id) })),
      toggleChecked: (id) => set((state) => ({ checkedItemIds: toggle(state.checkedItemIds, id) })),
      setSeason: (season) => set({ season }),
      setDog: (dog) => set({ dog }),
      clearDog: () => set({ dog: null }),
      setNeedsIndoor: (needsIndoor) => set({ needsIndoor }),
      setTown: (town) => set({ town }),
    }),
    {
      name: STORAGE_NAME,
      /*
       * 서버에서 미리 그려 둔 HTML 과 첫 렌더가 어긋나지 않게, localStorage 읽기는
       * 마운트 뒤로 미룬다(providers/storeHydration.tsx 가 rehydrate 를 부른다).
       * 그 잠깐 동안 저장 개수가 0 으로 보이는 것은 의도한 동작이다.
       */
      skipHydration: true,
      /**
       * 읽기가 끝난 뒤 한 번. 성공하면 `error` 가 undefined, 실패하면 거기에 이유가 담긴다.
       *
       * **실패한 값은 지운다.** zustand 는 읽다 실패해도 그 값을 그대로 둬서, 손대지 않으면
       * 다음 로드에서도 같은 자리에서 또 실패한다 — 한 번 깨지면 앱이 영구히 저장 기능을
       * 잃는다(저장 0곳·프로필 없음·판정 없음). 깨진 JSON 은 통째로 못 읽는 값이라
       * 일부만 건져낼 것도 없다.
       */
      onRehydrateStorage: () => (_state, error) => {
        if (error) {
          try {
            localStorage.removeItem(STORAGE_NAME);
          } catch {
            // 지울 수조차 없는 환경(사파리 시크릿 등)이면 그대로 둔다 — 아래 신호는 어차피 올린다.
          }
        }
        markHydrationSettled();
      },
      /**
       * 저장해 둔 장소가 데이터에서 빠지면 그 id 는 localStorage 에 그대로 남는다.
       * 불러오는 시점에 한 번 걸러내지 않으면 화면마다 다른 숫자가 나온다.
       */
      merge: (persistedState, currentState) => {
        const persisted = (persistedState ?? {}) as Partial<TAppState>;
        const exists = (id: string) => PLACES_BY_ID.has(id);
        return {
          ...currentState,
          ...persisted,
          savedIds: (persisted.savedIds ?? []).filter(exists),
          // 옛 모양(`{ name, weightsKg }`)은 여기서 올려 변환된다 — lib/dogProfile.ts 참고.
          dog: sanitizeDog(persisted.dog),
          needsIndoor: typeof persisted.needsIndoor === 'boolean' ? persisted.needsIndoor : false,
          town:
            typeof persisted.town === 'string' && ALL_TOWNS.has(persisted.town) ? persisted.town : null,
        };
      },
    },
  ),
);

export const useDog = () => useAppStore((state) => state.dog);

export const useIsSaved = (id: string) => useAppStore((state) => state.savedIds.includes(id));

/** 저장한 장소. 존재하지 않는 id 는 빠진다. */
export const useSavedPlaces = () => {
  const savedIds = useAppStore((state) => state.savedIds);
  return useMemo(() => selectSavedPlaces(savedIds), [savedIds]);
};

/** 홈 카드와 설정 화면의 "저장한 곳" 행이 쓰는 개수. 저장 화면의 목록 길이와 반드시 같다. */
export const useSavedCount = () => useSavedPlaces().length;
