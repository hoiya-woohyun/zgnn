'use client';

import { useMemo, type RefObject } from 'react';
import { PlacesPageResults } from './placesPageResults';
import { resetFiltersLabel } from '../lib/placeFilters';
import { otherTypeMatches } from '../lib/placeSearch';
import { areaCarriedRelease, areaReleaseCount, filterPlacesPage, placesByTown, placesOfTypeInArea, placesPageChips, reachableReleaseCount, townReleaseCount } from '../lib/placesPageFilter';
import { sortByEligibility } from '../lib/sortByEligibility';
import { useAppStore, useDog } from '../store/useAppStore';
import { useEligibilityMap } from '../store/useDogEligibility';
import { usePlacesPageFilterStore } from '../store/usePlacesPageFilterStore';
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
 * **새 화면이 마운트됐을 때와 같은 모습이어야 한다** — 검색어·방향·'어려운 곳 숨기기'·그 종류의 반려동물 조건은
 * 스토어(`usePlacesPageFilterStore`)에서, 읍면·'실내 자리 필요'·강아지 판정은 `useAppStore` 에서 따라오고
 * 정렬만 종류를 바꾸면 리셋된다(그래서 여기는 늘 기본 정렬). 목록과 칩은 placesPage 와 **같은 함수**
 * (`filterPlacesPage`·`placesPageChips`)로 만든다 — 따로 계산하면 손을 놓는 순간 목록이 튄다(ADR-013 v4).
 *
 * 보여주기만 한다(`inert`) — 손가락이 지나가는 동안 카드 링크가 눌리거나 포커스가 옮겨가면 안 된다.
 * 높이를 화면에 맞춰 잘라 두어 문서 높이를 늘리지 않는다.
 */
export function PlacesPageSwipePeek({ ref, type, side, top, height }: TPlacesPageSwipePeekProps) {
  const town = useAppStore((state) => state.town);
  const needsIndoor = useAppStore((state) => state.needsIndoor);
  const hasDog = Boolean(useDog());
  const eligibilityMap = useEligibilityMap();
  const query = usePlacesPageFilterStore((state) => state.query);
  const directions = usePlacesPageFilterStore((state) => state.directions);
  const hideHard = usePlacesPageFilterStore((state) => state.hideHard);
  const onlyReachable = usePlacesPageFilterStore((state) => state.onlyReachable);
  const petKeys = usePlacesPageFilterStore((state) => state.petKeysByType[type]);
  const area = usePlacesPageFilterStore((state) => state.area);

  const byTown = useMemo(() => placesByTown(type, town), [type, town]);

  const results = useMemo(() => {
    const filtered = filterPlacesPage({ type, town, area, query, directions, petKeys, hideHard, onlyReachable, eligibilityMap });
    return eligibilityMap ? sortByEligibility(filtered, eligibilityMap, (place) => place.id) : filtered;
  }, [type, town, area, query, directions, petKeys, hideHard, onlyReachable, eligibilityMap]);

  // 본 화면과 같이 결과가 있어도 센다 — 엿보기도 같은 줄을 그려야 손을 놓아도 안 튄다.
  const otherTypes = useMemo(
    () => otherTypeMatches(type, query, town, (other) => placesOfTypeInArea(other, area)),
    [type, query, town, area],
  );
  const released = useMemo(() => {
    if (results.length > 0) return { town: 0, area: 0, reachable: 0 };
    const conditions = { type, town, area, query, directions, petKeys, hideHard, onlyReachable, eligibilityMap };
    return { town: townReleaseCount(conditions), area: areaReleaseCount(conditions), reachable: reachableReleaseCount(conditions) };
  }, [results.length, type, town, area, query, directions, petKeys, hideHard, onlyReachable, eligibilityMap]);
  // 0곳이 아니어도 카드보다 적으면 — 동네 카드 진입에 따라온 읍면·방향·조건 칩(19 T4.2). 0곳이면 위 빈 상태 몫이다.
  const areaCarried = useMemo(
    () =>
      results.length > 0
        ? areaCarriedRelease({ type, town, area, query, directions, petKeys, hideHard, onlyReachable, eligibilityMap }, results.length)
        : null,
    [results.length, type, town, area, query, directions, petKeys, hideHard, onlyReachable, eligibilityMap],
  );

  const { chips, activeFilterCount, hasFilters } = placesPageChips({
    type,
    town,
    area,
    needsIndoor,
    hasDog,
    directions,
    petKeys,
    hideHard,
    onlyReachable,
    query,
  });

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
        hasFilters={hasFilters}
        resetLabel={resetFiltersLabel(query.trim().length > 0, activeFilterCount)}
        query={query.trim()}
        activeFilterCount={activeFilterCount}
        onClearQuery={noop}
        onClearTown={noop}
        activeChips={chips.map((chip) => ({ ...chip, onRemove: noop }))}
        onResetFilters={noop}
        onOpenFilters={noop}
        otherTypes={otherTypes}
        townReleaseCount={released.town}
        area={area}
        areaReleaseCount={released.area}
        onClearArea={noop}
        reachableReleaseCount={released.reachable}
        onClearOnlyReachable={noop}
        areaCarried={areaCarried}
        onReleaseAreaCarried={noop}
      />
    </div>
  );
}
