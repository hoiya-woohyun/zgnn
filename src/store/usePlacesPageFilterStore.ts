import { create } from 'zustand';
import type { TAreaId } from '../lib/areaGroups';
import type { TPetFilterKey } from '../lib/placeFilters';
import type { TDirection, TPlaceType } from '../types';

/**
 * 둘러보기의 검색어·방향·'어려운 곳 숨기기'·종류별 반려동물 조건 — 종류 탭을 넘겨도, 상세에 갔다 돌아와도 남는다(07 U3).
 *
 * **`persist` 를 붙이지 않는다.** `useAppStore` 는 통째로 localStorage 에 저장돼서(`zgnn-jeju`) 여기 두면 지난 방문의
 * 검색어가 다음 방문의 첫 화면을 걸러 버린다. 모듈 메모리라 SPA 안에서만 살고 새로고침하면 사라진다.
 *
 * 정렬(`sort`)·기준점(`origin`)은 일부러 **싣지 않는다** — 가격순은 숙소에서만 의미가 있고 가까운 순은 위치를 한 번 받아야
 * 해서, 따라오면 다른 탭에서 칩과 숫자만 있고 아무 일도 안 하는 조건이 된다. 읍면·'실내 자리 필요' 는 이미 `useAppStore` 에 있다.
 *
 * 권역(`area`, 19 T3)이 여기 사는 이유도 같다 — 읍면(`town`, 퍼시스트)은 카페 탭·다음 방문까지 샜다(ux-expert M-5).
 * 홈 동네 카드는 `enterArea` 하나로 권역·'어려운 곳 숨기기' 를 함께 걸고 검색어를 비운다. 관광지 칩(검색어)과 권역은 서로를 지운다 —
 * 홈에서 들어오는 길 둘이 겹쳐 이유 없이 0곳이 되지 않게.
 */
type TPlacesPageFilterState = {
  query: string;
  directions: TDirection[];
  hideHard: boolean;
  /** 6권역. 시트에는 없고 검색 줄 밑 한 줄로만 보인다(`PlacesPageAreaLine`). */
  area: TAreaId | null;
  /** 조건 항목이 종류마다 달라서(숙소엔 환경 조건) 종류별로 따로 둔다 — 숙소 → 식당 → 숙소 로 돌아오면 숙소 칩이 그대로다. */
  petKeysByType: Record<TPlaceType, TPetFilterKey[]>;
  setQuery: (query: string) => void;
  clearQuery: () => void;
  /** 홈 관광지 칩의 진입 — 검색어를 바꾸고 권역은 푼다. */
  enterLandmark: (word: string) => void;
  /** 홈 동네 카드의 진입 — 권역 + '어려운 곳 숨기기'(강아지가 없으면 거르지 않는다), 검색어는 비운다. 숙소 탭으로 가는 것은 부르는 쪽(`usePlacesPageAreaEntry`). */
  enterArea: (area: TAreaId) => void;
  clearArea: () => void;
  toggleDirection: (direction: TDirection) => void;
  toggleHideHard: () => void;
  setHideHard: (value: boolean) => void;
  togglePetKey: (type: TPlaceType, key: TPetFilterKey) => void;
  /** 검색어는 두고 조건만 푼다 — 다른 종류의 칩까지(보이지 않는 조건이 남지 않게). */
  resetConditions: () => void;
};

const emptyPetKeys = (): Record<TPlaceType, TPetFilterKey[]> => ({ stay: [], restaurant: [], cafe: [] });

export const usePlacesPageFilterStore = create<TPlacesPageFilterState>()((set) => ({
  query: '',
  directions: [],
  hideHard: false,
  area: null,
  petKeysByType: emptyPetKeys(),
  setQuery: (query) => set({ query }),
  clearQuery: () => set({ query: '' }),
  enterLandmark: (word) => set({ query: word, area: null }),
  enterArea: (area) => set({ area, hideHard: true, query: '' }),
  clearArea: () => set({ area: null }),
  toggleDirection: (direction) =>
    set((state) => ({
      directions: state.directions.includes(direction)
        ? state.directions.filter((value) => value !== direction)
        : [...state.directions, direction],
    })),
  toggleHideHard: () => set((state) => ({ hideHard: !state.hideHard })),
  setHideHard: (hideHard) => set({ hideHard }),
  togglePetKey: (type, key) =>
    set((state) => {
      const current = state.petKeysByType[type];
      const next = current.includes(key) ? current.filter((value) => value !== key) : [...current, key];
      return { petKeysByType: { ...state.petKeysByType, [type]: next } };
    }),
  resetConditions: () => set({ directions: [], hideHard: false, petKeysByType: emptyPetKeys() }),
}));
