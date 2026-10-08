import { useMemo } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { sanitizeDog } from '../lib/dogProfile';
import { ALL_TOWNS, countUnlistedSaved, selectSavedPlaces } from '../lib/places';
import { sanitizeSavedNotes, withSavedNote } from '../lib/savedNotes';
import {
  sanitizeTripDays,
  sanitizeTripOrder,
  withDayOrder,
  withoutDayOrder,
  withTripDay,
  type TTripDay,
  type TTripDays,
  type TTripOrder,
} from '../lib/tripPlan';
import type { TDogProfile } from '../types';

/** 사계절 항목은 항상 보이므로, 계절 선택은 여름/겨울 둘 중 하나이거나 선택 안 함(null)이다. */
export type TSeasonFilter = '여름' | '겨울' | null;

type TAppState = {
  savedIds: string[];
  /** 저장한 곳의 한 줄 메모(id → 메모, ≤80자). 하트를 지우면 같이 지워진다. 공유에는 싣지 않는다(10 F5). */
  savedNotes: Record<string, string>;
  /** 저장한 곳의 날짜 라벨(id → 1~4일, 없으면 미정). 메모와 같이 하트를 지우면 빠진다(16 P1, lib/tripPlan.ts). */
  tripDays: TTripDays;
  /** 하루 → 사용자가 끌어 바꾼 순서. 손댄 날만 있고, 없는 날은 화면이 제안한다(16 P2). */
  tripOrder: TTripOrder;
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
  /**
   * 이 기기에서 앱을 연 횟수(페이지 로드마다 1, `StoreHydration` 이 읽기가 끝난 뒤 센다).
   * "첫 방문에만" · "두 번째 방문부터" 를 가르는 유일한 신호다 — 홈 인사말 접기(07 U2), 설치 안내(07 U9).
   * 읽기 전(0)과 첫 방문(1)을 구별해야 하는 화면은 `useStoreHydrated` 와 함께 본다.
   */
  visitCount: number;
  toggleSaved: (id: string) => void;
  /** 저장 해제를 되돌린다 — 원래 자리(`index`)와 메모·날짜 라벨까지(12 U2.2, 16 T1.4). 손 순서는 돌리지 않는다. 이미 저장돼 있으면 아무것도 안 한다. */
  restoreSaved: (id: string, index: number, note?: string, day?: TTripDay) => void;
  /**
   * 공유받은 목록을 내 저장에 합친다(07 P1). 이미 있는 곳은 그대로 두고(자리·메모 유지) 새 곳만 뒤에 붙인다 —
   * `toggleSaved` 를 돌리면 이미 저장한 곳의 하트가 꺼지고 메모가 지워진다. 넣는 쪽이 지금 데이터에 있는 id 로 거른 값만 준다.
   */
  addSaved: (ids: readonly string[]) => void;
  setSavedNote: (id: string, note: string) => void;
  /** 저장한 곳의 날을 바꾼다(`null` = 미정). 저장하지 않은 곳에는 달지 않는다. */
  setTripDay: (id: string, day: TTripDay | null) => void;
  setTripDayOrder: (day: TTripDay, ids: readonly string[]) => void;
  /** "순서 다시 제안" — 그 날의 손 순서를 지운다. */
  resetTripDayOrder: (day: TTripDay) => void;
  toggleChecked: (id: string) => void;
  /** 준비물 체크를 모두 푼다 — 다음 여행 준비(12 U2.6). */
  clearChecked: () => void;
  /** 저장을 모두 비운다 — 메모·날짜 라벨도 함께(저장한 곳의 것이다, 12 U2.6). */
  clearSaved: () => void;
  setSeason: (season: TSeasonFilter) => void;
  setDog: (dog: TDogProfile) => void;
  clearDog: () => void;
  setNeedsIndoor: (needsIndoor: boolean) => void;
  setTown: (town: string | null) => void;
  countVisit: () => void;
};

const toggle = (list: string[], id: string) =>
  list.includes(id) ? list.filter((value) => value !== id) : [...list, id];

const STORAGE_NAME = 'zgnn-jeju';

/** 저장된 목록 값을 믿지 않는다 — 배열이 아니면 빈 배열, 문자열이 아닌 원소는 버린다. */
const stringList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

const SEASONS: readonly TSeasonFilter[] = ['여름', '겨울', null];
const seasonOf = (value: unknown): TSeasonFilter =>
  SEASONS.includes(value as TSeasonFilter) ? (value as TSeasonFilter) : null;

/** 방문 수는 0 이상의 정수만 믿는다 — 깨진 값이면 0(= 아직 한 번도 안 열었다)으로 돌아가 인사말이 한 번 더 펼쳐질 뿐이다. */
const visitCountOf = (value: unknown): number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : 0;

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
      savedNotes: {},
      tripDays: {},
      tripOrder: {},
      checkedItemIds: [],
      season: null,
      dog: null,
      needsIndoor: false,
      town: null,
      visitCount: 0,
      // 하트를 지우면 메모·날짜 라벨도 지운다 — "저장한 곳의 것" 이라 저장이 없으면 붙을 데가 없다.
      toggleSaved: (id) =>
        set((state) => {
          const savedIds = toggle(state.savedIds, id);
          if (savedIds.includes(id)) return { savedIds };
          const savedNotes = { ...state.savedNotes };
          delete savedNotes[id];
          const trip = withTripDay({ days: state.tripDays, order: state.tripOrder }, id, null);
          return { savedIds, savedNotes, tripDays: trip.days, tripOrder: trip.order };
        }),
      restoreSaved: (id, index, note, day) =>
        set((state) => {
          if (state.savedIds.includes(id)) return {};
          const savedIds = [...state.savedIds];
          savedIds.splice(Math.max(0, Math.min(index, savedIds.length)), 0, id);
          const trip = day ? withTripDay({ days: state.tripDays, order: state.tripOrder }, id, day) : null;
          return {
            savedIds,
            ...(note ? { savedNotes: { ...state.savedNotes, [id]: note } } : {}),
            ...(trip ? { tripDays: trip.days, tripOrder: trip.order } : {}),
          };
        }),
      addSaved: (ids) =>
        set((state) => {
          const added = ids.filter((id, index) => !state.savedIds.includes(id) && ids.indexOf(id) === index);
          return added.length > 0 ? { savedIds: [...state.savedIds, ...added] } : {};
        }),
      // 저장하지 않은 곳에는 메모를 달지 않는다(화면도 저장한 곳에서만 입력 칸을 연다).
      setSavedNote: (id, note) =>
        set((state) => (state.savedIds.includes(id) ? { savedNotes: withSavedNote(state.savedNotes, id, note) } : {})),
      setTripDay: (id, day) =>
        set((state) => {
          if (!state.savedIds.includes(id)) return {};
          const trip = withTripDay({ days: state.tripDays, order: state.tripOrder }, id, day);
          return { tripDays: trip.days, tripOrder: trip.order };
        }),
      setTripDayOrder: (day, ids) =>
        set((state) => ({ tripOrder: withDayOrder({ days: state.tripDays, order: state.tripOrder }, day, ids).order })),
      resetTripDayOrder: (day) =>
        set((state) => ({ tripOrder: withoutDayOrder({ days: state.tripDays, order: state.tripOrder }, day).order })),
      toggleChecked: (id) => set((state) => ({ checkedItemIds: toggle(state.checkedItemIds, id) })),
      clearChecked: () => set({ checkedItemIds: [] }),
      clearSaved: () => set({ savedIds: [], savedNotes: {}, tripDays: {}, tripOrder: {} }),
      setSeason: (season) => set({ season }),
      setDog: (dog) => set({ dog }),
      clearDog: () => set({ dog: null }),
      setNeedsIndoor: (needsIndoor) => set({ needsIndoor }),
      setTown: (town) => set({ town }),
      countVisit: () => set((state) => ({ visitCount: state.visitCount + 1 })),
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
        // 신호 **앞**에서 센다 — 뒤에서 세면 신호를 받은 화면이 옛 수(두 번째 방문인데 1)로 한 프레임 그린다.
        countVisitOnce();
        markHydrationSettled();
      },
      /**
       * 저장해 둔 장소가 데이터에서 빠져도(운영자가 내렸다) **id 와 메모를 지우지 않는다**(12 U2.3).
       * 내린 곳은 되살릴 수 있어서(ADR-018 결정 6~8), 여기서 거르면 다음 아무 set 에 걸러진 목록이
       * 덮어써져 되살려도 하트가 안 돌아온다. 거르는 것은 보여 줄 때 한 곳 — `useSavedPlaces` 다.
       *
       * **칸마다 모양을 검사한다**(12 U0.1). `...persisted` 로 펼친 값을 그대로 믿으면 깨진 한 칸
       * (`checkedItemIds: "x"`)이 `.includes` 에서 터져 앱 전체가 에러 화면이 된다 — JSON 은 멀쩡해서
       * `onRehydrateStorage` 의 지우기도 안 걸린다. 깨진 칸은 기본값으로, 나머지 칸은 살린다.
       */
      merge: (persistedState, currentState) => {
        const persisted = (persistedState ?? {}) as Partial<Record<keyof TAppState, unknown>>;
        const savedIds = stringList(persisted.savedIds);
        const tripDays = sanitizeTripDays(persisted.tripDays, savedIds);
        return {
          ...currentState,
          savedIds,
          checkedItemIds: stringList(persisted.checkedItemIds),
          season: seasonOf(persisted.season),
          // 하트가 없는 id 의 메모는 버린다 — 남겨 두면 다시 저장했을 때 옛 메모가 되살아난다. 내린 곳의 하트는 남으므로 메모도 남는다.
          savedNotes: sanitizeSavedNotes(persisted.savedNotes, savedIds),
          // 라벨·순서도 같은 규칙 — 칸이 없던 옛 저장값은 빈 값으로 읽혀 전부 미정이 된다(그래서 version 을 올리지 않는다).
          tripDays,
          tripOrder: sanitizeTripOrder(persisted.tripOrder, tripDays),
          // 옛 모양(`{ name, weightsKg }`)은 여기서 올려 변환된다 — lib/dogProfile.ts 참고.
          dog: sanitizeDog(persisted.dog),
          needsIndoor: typeof persisted.needsIndoor === 'boolean' ? persisted.needsIndoor : false,
          town:
            typeof persisted.town === 'string' && ALL_TOWNS.has(persisted.town) ? persisted.town : null,
          visitCount: visitCountOf(persisted.visitCount),
        };
      },
    },
  ),
);

/** 이 페이지 로드의 방문을 이미 셌는지. 개발 모드 StrictMode 가 `rehydrate` 를 두 번 불러도 한 번만 센다. */
let visitCounted = false;

/**
 * 이 페이지 로드의 방문을 **한 번** 센다. 읽기가 끝난 뒤, 하이드레이션 신호 전에 — 그래야 저장된 수 위에 더해지고(읽기 전에
 * 올리면 곧 읽어온 값에 덮인다), 신호를 받은 화면이 이미 오른 수를 본다. 저장소가 없거나 깨졌으면 0 위에 더해져 1 이 된다 —
 * "첫 방문" 으로 보이는 것이 맞다, 이 기기엔 기록이 없으니.
 */
export const countVisitOnce = () => {
  if (visitCounted) return;
  visitCounted = true;
  useAppStore.getState().countVisit();
};

export const useDog = () => useAppStore((state) => state.dog);

export const useIsSaved = (id: string) => useAppStore((state) => state.savedIds.includes(id));

/** 저장한 곳의 한 줄 메모. 없으면 undefined. */
export const useSavedNote = (id: string) => useAppStore((state) => state.savedNotes[id]);

/** 저장한 장소. 데이터에 없는 id(내린 곳)는 저장소에 남아 있어도 여기서 빠진다. */
export const useSavedPlaces = () => {
  const savedIds = useAppStore((state) => state.savedIds);
  return useMemo(() => selectSavedPlaces(savedIds), [savedIds]);
};

/** 홈 카드와 설정 화면의 "저장한 곳" 행이 쓰는 개수. 저장 화면의 목록 길이와 반드시 같다. */
export const useSavedCount = () => useSavedPlaces().length;

/** 저장해 뒀지만 지금 안내하지 않는 곳의 수. 되살아나면 목록으로 돌아온다. */
export const useUnlistedSavedCount = () => useAppStore((state) => countUnlistedSaved(state.savedIds));
