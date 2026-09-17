'use client';

import { useMemo, type RefObject } from 'react';
import { PlacesPageResults } from './placesPageResults';
import { placesOfType } from '../lib/places';
import { sortByEligibility } from '../lib/sortByEligibility';
import { useAppStore } from '../store/useAppStore';
import { useEligibilityMap } from '../store/useDogEligibility';
import type { TPlaceType } from '../types';

type TPlacesPageSwipePeekProps = {
  ref: RefObject<HTMLDivElement | null>;
  type: TPlaceType;
  /** 어느 쪽에 대기하나. 왼쪽이면 -100%, 오른쪽이면 +100% 에서 출발한다. */
  side: 'left' | 'right';
  /** 무대 안에서의 세로 자리(px) — placesPageSwipe 가 지금 보이는 영역에 맞춰 잰다. */
  top: number;
  height: number;
};

const noop = () => undefined;

/**
 * 스와이프 중에 옆에서 따라 들어오는 이웃 종류의 본문.
 *
 * **새 화면이 마운트됐을 때와 같은 모습이어야 한다** — 종류를 바꾸면 조건이 리셋되므로
 * (placesPage 의 `key={type}`) 검색어·방향·조건·정렬은 기본값이고, 스토어에 있는 읍면과
 * 강아지 판정만 따라온다. placesPage 의 results 계산에서 그 기본값 경로만 남긴 것이다.
 *
 * 보여주기만 한다(`inert`) — 손가락이 지나가는 동안 카드 링크가 눌리거나 포커스가 옮겨가면 안 된다.
 * 높이를 화면에 맞춰 잘라 두어 문서 높이를 늘리지 않는다.
 */
export function PlacesPageSwipePeek({ ref, type, side, top, height }: TPlacesPageSwipePeekProps) {
  const town = useAppStore((state) => state.town);
  const eligibilityMap = useEligibilityMap();

  const byTown = useMemo(() => {
    const list = placesOfType(type);
    return town ? list.filter((place) => place.region.town === town) : list;
  }, [type, town]);

  const results = useMemo(
    () => (eligibilityMap ? sortByEligibility(byTown, eligibilityMap, (place) => place.id) : byTown),
    [byTown, eligibilityMap],
  );

  return (
    <div
      ref={ref}
      inert
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 overflow-hidden"
      style={{ top, height, transform: `translateX(${side === 'left' ? -100 : 100}%)` }}
    >
      <PlacesPageResults
        type={type}
        town={town}
        results={results}
        townHasNoPlaces={town !== null && byTown.length === 0}
        hasFilters={town !== null}
        onResetFilters={noop}
        onOpenFilters={noop}
      />
    </div>
  );
}
