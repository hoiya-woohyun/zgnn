'use client';

import { useEffect, useMemo } from 'react';
import { selectSavedPlaces, type TPlaceEntry } from '../lib/places';
import { enterSavedPage, leaveSavedPage, listSavedPage, useSavedPageSnapshot } from '../lib/savedPageSession';
import { useStoreHydrated } from '../providers/storeHydration';
import { useAppStore } from '../store/useAppStore';

/**
 * 저장 화면이 **그리는** 목록 — 들어올 때 있던 카드는 하트를 꺼도 이번 방문 동안 자리에 남는다(`lib/savedPageSession.ts`).
 * 세는 쪽(머리글의 "N곳", 홈 카드)은 이것이 아니라 하트가 켜진 `useSavedPlaces` 를 쓴다.
 *
 * 정적 HTML 이라 저장소는 마운트 뒤에 읽히므로 목록은 하이드레이션이 끝난 뒤에 찍는다 — 먼저 찍으면 빈 목록이 되어
 * 모든 카드가 "그 사이 새로 저장된 것" 으로 뒤에 붙는다. 화면을 나가면(언마운트) 버린다.
 */
export function useSavedPageListed(): TPlaceEntry[] {
  const hydrated = useStoreHydrated();
  useEffect(() => {
    if (!hydrated) return;
    enterSavedPage(useAppStore.getState().savedIds);
    return leaveSavedPage;
  }, [hydrated]);

  const savedIds = useAppStore((state) => state.savedIds);
  const snapshot = useSavedPageSnapshot();
  return useMemo(() => selectSavedPlaces(listSavedPage(snapshot ?? savedIds, savedIds)), [snapshot, savedIds]);
}
