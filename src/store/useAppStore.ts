import { useMemo } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ALL_TOWNS, PLACES_BY_ID, selectSavedPlaces } from '../lib/places';
import type { TCarrier, TDogProfile, TDogSize } from '../types';

/** 사계절 항목은 항상 보이므로, 계절 선택은 여름/겨울 둘 중 하나이거나 선택 안 함(null)이다. */
export type TSeasonFilter = '여름' | '겨울' | null;

type TAppState = {
  savedIds: string[];
  checkedItemIds: string[];
  season: TSeasonFilter;
  /** 준비물 화면에서 '숙소 용품 반영'에 쓰는 숙소. */
  amenityStayId: string | null;
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
  setAmenityStayId: (id: string | null) => void;
  setDog: (dog: TDogProfile) => void;
  clearDog: () => void;
  setNeedsIndoor: (needsIndoor: boolean) => void;
  setTown: (town: string | null) => void;
};

const toggle = (list: string[], id: string) =>
  list.includes(id) ? list.filter((value) => value !== id) : [...list, id];

const CARRIERS: TCarrier[] = ['none', 'bag', 'cage', 'stroller'];
const SIZES: TDogSize[] = ['small', 'medium', 'large'];

/**
 * localStorage 에 남아 있던 값이 스펙과 어긋나면(예전 버전이 남긴 형태, 수동 편집 등)
 * 조용히 잘못 판정하는 대신 프로필을 통째로 비운다 — 절반만 맞는 강아지 정보가 더 위험하다.
 */
const sanitizeDog = (value: unknown): TDogProfile | null => {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<TDogProfile>;
  if (typeof candidate.name !== 'string') return null;
  const weights = candidate.weightsKg;
  if (
    !Array.isArray(weights) ||
    weights.length < 1 ||
    weights.length > 3 ||
    !weights.every((w) => typeof w === 'number' && w > 0)
  ) {
    return null;
  }
  if (!CARRIERS.includes(candidate.carrier as TCarrier)) return null;
  const sizeOverride = SIZES.includes(candidate.sizeOverride as TDogSize)
    ? (candidate.sizeOverride as TDogSize)
    : undefined;
  return { name: candidate.name, weightsKg: weights, carrier: candidate.carrier as TCarrier, sizeOverride };
};

export const useAppStore = create<TAppState>()(
  persist(
    (set) => ({
      savedIds: [],
      checkedItemIds: [],
      season: null,
      amenityStayId: null,
      dog: null,
      needsIndoor: false,
      town: null,
      toggleSaved: (id) => set((state) => ({ savedIds: toggle(state.savedIds, id) })),
      toggleChecked: (id) => set((state) => ({ checkedItemIds: toggle(state.checkedItemIds, id) })),
      setSeason: (season) => set({ season }),
      setAmenityStayId: (amenityStayId) => set({ amenityStayId }),
      setDog: (dog) => set({ dog }),
      clearDog: () => set({ dog: null }),
      setNeedsIndoor: (needsIndoor) => set({ needsIndoor }),
      setTown: (town) => set({ town }),
    }),
    {
      name: 'zgnn-jeju',
      /*
       * 서버에서 미리 그려 둔 HTML 과 첫 렌더가 어긋나지 않게, localStorage 읽기는
       * 마운트 뒤로 미룬다(providers/storeHydration.tsx 가 rehydrate 를 부른다).
       * 그 잠깐 동안 저장 개수가 0 으로 보이는 것은 의도한 동작이다.
       */
      skipHydration: true,
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

/** 탭바 배지와 홈이 쓰는 개수. 저장 화면의 목록 길이와 반드시 같다. */
export const useSavedCount = () => useSavedPlaces().length;
