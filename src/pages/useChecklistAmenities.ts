import { useMemo } from 'react';
import { resolveProvidedItemIds } from '../lib/amenities';
import { ITEMS, placesOfType } from '../lib/places';
import { useAppStore, useSavedPlaces } from '../store/useAppStore';

/**
 * 준비물 화면의 '숙소 용품 반영'.
 *
 * 저장한 숙소는 고르기 쉽도록 앞쪽에 따로 묶어 주기만 하고, 전체 목록에서 빼지 않는다.
 * 예전에는 저장한 숙소가 하나라도 생기는 순간 선택지가 전체에서 저장 숙소로 통째로 바뀌었고,
 * 그러면 이미 골라 둔 숙소가 목록에서 사라지면서 아무 말 없이 선택이 풀렸다.
 */
export const useChecklistAmenities = () => {
  const amenityStayId = useAppStore((state) => state.amenityStayId);
  const setAmenityStayId = useAppStore((state) => state.setAmenityStayId);
  const savedPlaces = useSavedPlaces();

  const allStays = useMemo(() => placesOfType('stay'), []);
  const savedStays = useMemo(
    () => savedPlaces.filter((place) => place.type === 'stay'),
    [savedPlaces],
  );

  // 선택은 언제나 전체 숙소에서 찾는다 — 저장 여부가 선택을 좌우하지 않는다.
  const selected = allStays.find((stay) => stay.id === amenityStayId) ?? null;

  const providedItemIds = useMemo(
    () => resolveProvidedItemIds(selected?.stay?.amenitiesText, ITEMS),
    [selected],
  );

  return { allStays, savedStays, selected, providedItemIds, setAmenityStayId };
};
