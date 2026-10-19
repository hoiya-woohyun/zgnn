import { useMemo } from 'react';
import { PLACES_PAGE_DEFAULT_ORDER, placesPageResultsView, type TPlacesPageOrder, type TPlacesPageResultsView } from '../lib/placesPageFilter';
import { useAppStore, useDog } from '../store/useAppStore';
import { useEligibilityMap } from '../store/useDogEligibility';
import { usePlacesPageFilterStore } from '../store/usePlacesPageFilterStore';
import type { TPlaceType } from '../types';

/**
 * 종류 하나의 둘러보기 본문 값(`placesPageResultsView`) — 본 화면(`placesPage`)과 스와이프 엿보기(`placesPageSwipePeek`)가 이 훅 하나로 받는다(14 W261019.11g).
 * 조건은 전부 스토어에서 읽는다 — 읍면·'실내 자리 필요'·강아지는 `useAppStore`, 검색어·방향·조건 칩·판정 토글·권역은 `usePlacesPageFilterStore`.
 * 순서(`order`)만 화면 로컬 상태라 본 화면이 넘기고 엿보기는 빼서 기본 순서다(`key={type}` 로 새로 마운트된 화면이 그 모양이다).
 */
export function usePlacesPageResultsView(type: TPlaceType, order: TPlacesPageOrder = PLACES_PAGE_DEFAULT_ORDER): TPlacesPageResultsView {
  const town = useAppStore((state) => state.town);
  const needsIndoor = useAppStore((state) => state.needsIndoor);
  const dog = useDog();
  const eligibilityMap = useEligibilityMap();
  const query = usePlacesPageFilterStore((state) => state.query);
  const directions = usePlacesPageFilterStore((state) => state.directions);
  const hideHard = usePlacesPageFilterStore((state) => state.hideHard);
  const onlyReachable = usePlacesPageFilterStore((state) => state.onlyReachable);
  const petKeysByType = usePlacesPageFilterStore((state) => state.petKeysByType);
  const area = usePlacesPageFilterStore((state) => state.area);
  const { sort, origin, nearPlace } = order;

  return useMemo(
    () =>
      placesPageResultsView(
        { type, town, area, query, directions, hideHard, onlyReachable, eligibilityMap, petKeysByType, dog, needsIndoor },
        { sort, origin, nearPlace },
      ),
    [type, town, area, query, directions, hideHard, onlyReachable, eligibilityMap, petKeysByType, dog, needsIndoor, sort, origin, nearPlace],
  );
}
