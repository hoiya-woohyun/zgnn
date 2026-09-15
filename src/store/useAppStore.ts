import { useMemo } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { PLACES_BY_ID, selectSavedPlaces } from '../lib/places';

/** 사계절 항목은 항상 보이므로, 계절 선택은 여름/겨울 둘 중 하나이거나 선택 안 함(null)이다. */
export type TSeasonFilter = '여름' | '겨울' | null;

type TAppState = {
  savedIds: string[];
  checkedItemIds: string[];
  season: TSeasonFilter;
  /** 준비물 화면에서 '숙소 용품 반영'에 쓰는 숙소. */
  amenityStayId: string | null;
  toggleSaved: (id: string) => void;
  toggleChecked: (id: string) => void;
  setSeason: (season: TSeasonFilter) => void;
  setAmenityStayId: (id: string | null) => void;
};

const toggle = (list: string[], id: string) =>
  list.includes(id) ? list.filter((value) => value !== id) : [...list, id];

export const useAppStore = create<TAppState>()(
  persist(
    (set) => ({
      savedIds: [],
      checkedItemIds: [],
      season: null,
      amenityStayId: null,
      toggleSaved: (id) => set((state) => ({ savedIds: toggle(state.savedIds, id) })),
      toggleChecked: (id) => set((state) => ({ checkedItemIds: toggle(state.checkedItemIds, id) })),
      setSeason: (season) => set({ season }),
      setAmenityStayId: (amenityStayId) => set({ amenityStayId }),
    }),
    {
      name: 'zgnn-jeju',
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
          amenityStayId:
            persisted.amenityStayId && exists(persisted.amenityStayId)
              ? persisted.amenityStayId
              : null,
        };
      },
    },
  ),
);

export const useIsSaved = (id: string) => useAppStore((state) => state.savedIds.includes(id));

/** 저장한 장소. 존재하지 않는 id 는 빠진다. */
export const useSavedPlaces = () => {
  const savedIds = useAppStore((state) => state.savedIds);
  return useMemo(() => selectSavedPlaces(savedIds), [savedIds]);
};

/** 탭바 배지와 홈이 쓰는 개수. 저장 화면의 목록 길이와 반드시 같다. */
export const useSavedCount = () => useSavedPlaces().length;
