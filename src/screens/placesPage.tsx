'use client';

import { useMemo, useRef, useState } from 'react';
import { SearchMd } from '@untitledui/icons';
import { PlacesPageEligibilityToggles } from './placesPageEligibilityToggles';
import type { TActiveChip } from './placesPageActiveChips';
import { PlacesPageFilters, SORT_OPTIONS } from './placesPageFilters';
import { PlacesPageFilterSheet } from './placesPageFilterSheet';
import { PlacesPageResults } from './placesPageResults';
import { usePlacesPageSwipe } from './placesPageSwipe';
import { PlacesPageSwipePeek } from './placesPageSwipePeek';
import { PlacesPageTypeTabs } from './placesPageTypeTabs';
import { usePlaceTypeSwitch } from './placesPageTypeSwitch';
import { Input } from '../components/base/input';
import { DIRECTION_LABEL, TYPE_META, placesOfType } from '../lib/places';
import { PET_FILTERS, comparePrice, envFiltersWithData, resetFiltersLabel, type TPetFilterKey, type TPlaceSort } from '../lib/placeFilters';
import { sortByEligibility } from '../lib/sortByEligibility';
import { distancesFrom, sortByDistance } from '../lib/distanceSort';
import { LOCATE_NOTICE, locateMe } from '../lib/myLocation';
import { showAppStatus } from '../lib/appStatus';
import { PlacesPageSuggest } from './placesPageSuggest';
import { useAppStore, useDog } from '../store/useAppStore';
import { useEligibilityMap } from '../store/useDogEligibility';
import { cx } from '../utils/cx';
import type { TDirection, TPlaceType } from '../types';

/**
 * 종류는 라우트가 정해 준다(`app/places/[type]/page.tsx`).
 * generateStaticParams 가 세 종류만 만들고 dynamicParams 도 꺼 두었으므로
 * 여기까지 온 type 은 항상 유효하다.
 */
export function PlacesPage({ type }: { type: TPlaceType }) {
  /*
   * 종류마다 조건 항목이 달라서, 종류를 바꾸면 조건은 처음부터 다시 고른다.
   * 리셋을 useEffect 로 하면 이전 조건이 적용된 목록이 한 프레임 먼저 그려진다.
   * key 로 조건 상태를 통째로 새로 만들면 그 중간 상태 자체가 생기지 않는다.
   */
  return <PlacesPageOfType key={type} type={type} />;
}

function PlacesPageOfType({ type }: { type: TPlaceType }) {
  // 읍면은 이 화면만의 조건이 아니라 지도·근처 장소와도 공유하는 스토어 값이라 로컬 상태로 두지 않는다.
  // 종류를 "어디서 어디로" 바꿨는지. 탭의 알약과 아래 목록이 같은 방향으로 움직이게 하는 값이다.
  const typeSwitch = usePlaceTypeSwitch(type);
  const headerRef = useRef<HTMLDivElement>(null);
  const { peek, stageRef, currentRef, leftRef, rightRef, pillRef, stageProps } = usePlacesPageSwipe(type, headerRef);
  const town = useAppStore((state) => state.town);
  const setTown = useAppStore((state) => state.setTown);
  const dog = useDog();
  const eligibilityMap = useEligibilityMap();
  const needsIndoor = useAppStore((state) => state.needsIndoor);
  const setNeedsIndoor = useAppStore((state) => state.setNeedsIndoor);
  const [query, setQuery] = useState('');
  const [directions, setDirections] = useState<TDirection[]>([]);
  const [petKeys, setPetKeys] = useState<TPetFilterKey[]>([]);
  const [sort, setSort] = useState<TPlaceSort>('none');
  /** 가까운 순의 기준점 — 고를 때 한 번 받는다. 저장하지 않는다(ADR-012 대상 아님). */
  const [origin, setOrigin] = useState<{ lat: number; lng: number } | null>(null);
  // 화면 로컬 상태 — 강아지 프로필이 없으면 hard 판정 개념이 없어 애초에 토글이 보이지 않는다.
  const [hideHard, setHideHard] = useState(false);
  /*
   * 모바일 필터 시트의 열림 상태. 시트 안이 아니라 여기에 두는 이유는 빈 상태의 버튼이
   * 시트를 열어야 하기 때문이다 — "다른 읍면을 골라 보세요" 라고 써 놓고 버튼은 읍면을
   * *지우기만* 하면 글과 동작이 반대를 말한다. 종류를 바꾸면 `key={type}` 로 함께 리셋된다.
   */
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);

  // 다른 조건과 별개로 먼저 걸러 둔다 — 이 종류에 그 읍면 자체가 없으면(0곳) 전용 빈 상태를 보여줘야 한다.
  const byTown = useMemo(() => {
    const list = placesOfType(type);
    return town ? list.filter((place) => place.region.town === town) : list;
  }, [type, town]);
  const townHasNoPlaces = town !== null && byTown.length === 0;

  /** 이 종류에서 고를 수 있는 조건 전부 — 반려동물 조건 + (숙소) 데이터가 있는 환경 조건(10 F6). 칩·걸러 내기가 같은 목록을 본다. */
  const filtersOfType = useMemo(
    () => (type === 'stay' ? [...PET_FILTERS.stay, ...envFiltersWithData(placesOfType('stay'))] : PET_FILTERS[type]),
    [type],
  );

  const results = useMemo(() => {
    let list = byTown;

    const normalizedQuery = query.trim().toLowerCase();
    if (normalizedQuery) {
      list = list.filter((place) =>
        [place.name, place.features, place.region.town].some((field) =>
          field.toLowerCase().includes(normalizedQuery),
        ),
      );
    }

    if (directions.length > 0) {
      list = list.filter((place) => directions.includes(place.region.direction));
    }
    const activeTests = filtersOfType.filter((filter) => petKeys.includes(filter.key));
    if (activeTests.length > 0) {
      list = list.filter((place) => activeTests.every((filter) => filter.test(place.policy, place)));
    }
    // "실내 자리 필요"(needsIndoor)는 이미 judgeEligibility(opts) 를 통해 야외 전용 장소를
    // 어려움으로 밀어 올린다 — 그 결과를 hideHard 가 걸러낸다. 여기서 policy.indoor 를
    // 직접 다시 걸러내지 않는 이유는 판정 로직을 화면에서 중복하지 않기 위해서다.
    if (hideHard && eligibilityMap) {
      list = list.filter((place) => eligibilityMap.get(place.id)?.level !== 'hard');
    }
    if (sort === 'near' && origin) {
      // 가까운 순을 고르면 거리가 우선이다 — 가격 정렬과 같은 결정(B3). 좌표 없는 곳은 뒤로.
      list = sortByDistance(list, origin);
    } else if (type === 'stay' && (sort === 'asc' || sort === 'desc')) {
      // 가격 정렬을 고르면 가격이 우선이다(2026-09-15 리뷰 후속 B3 결정).
      list = [...list].sort(comparePrice(sort));
    } else if (eligibilityMap) {
      // 프로필이 있으면 기본 정렬은 ok → cond → unknown → hard(갈 수 있어요 → 확인이 필요해요 → 정보가 없어요 → 이용하기 어려워요).
      list = sortByEligibility(list, eligibilityMap, (place) => place.id);
    }
    return list;
  }, [byTown, filtersOfType, query, directions, petKeys, sort, origin, type, hideHard, eligibilityMap]);

  const distances = useMemo(() => (sort === 'near' && origin ? distancesFrom(results, origin) : undefined), [origin, results, sort]);

  /*
   * 가까운 순은 고르는 순간 위치를 **한 번** 묻는다(10 F7). 거절·실패면 정렬을 바꾸지 않고 이유를 한 줄로 말한다 —
   * 거절한 사람에게 다시 묻지 않는다(브라우저가 이미 기억한다). 받은 좌표는 이 화면 state 에만 있고 저장하지 않는다.
   */
  const changeSort = async (next: TPlaceSort) => {
    if (next !== 'near' || origin) {
      setSort(next);
      return;
    }
    const located = await locateMe();
    if (located.kind !== 'ok') {
      showAppStatus(LOCATE_NOTICE[located.kind]);
      return;
    }
    setOrigin({ lat: located.lat, lng: located.lng });
    setSort('near');
  };

  /*
   * 접힌 시트 버튼에 붙는 숫자. 검색어는 빼고 센다 — 검색창은 시트 밖에 그대로 보이므로
   * 여기에 더하면 버튼의 숫자가 시트를 열었을 때 켜져 있는 조건 수와 어긋난다.
   */
  const activeFilterCount =
    (town !== null ? 1 : 0) +
    directions.length +
    petKeys.length +
    (sort !== 'none' ? 1 : 0) +
    (dog && hideHard ? 1 : 0) +
    (dog && type !== 'stay' && needsIndoor ? 1 : 0);

  const trimmedQuery = query.trim();
  const hasFilters = trimmedQuery.length > 0 || activeFilterCount > 0;

  /*
   * 시트 안의 "모두 지우기" 는 검색어를 건드리지 않는다 — 검색창은 시트 밖에 그대로
   * 보이는데 여기서 같이 지우면 시트를 닫고 나서야 글자가 사라진 걸 알게 된다.
   * 목록 위의 지우기 링크("필터·검색·모두 지우기")는 검색창 옆에 있어 무엇이 지워졌는지 바로 보이므로 검색어까지 지운다.
   */
  const resetConditions = () => {
    setTown(null);
    setDirections([]);
    setPetKeys([]);
    setSort('none');
    setHideHard(false);
    // activeFilterCount 가 세는 것은 여기서 전부 풀어야 한다 — 숫자는 1 인데 눌러도 안 바뀌면 고장으로 보인다.
    setNeedsIndoor(false);
  };

  const resetFilters = () => {
    setQuery('');
    resetConditions();
  };

  const enterAnimationClass = typeSwitch.enterFrom
    ? cx(
        'duration-300 ease-out animate-in fade-in motion-reduce:animate-none',
        typeSwitch.enterFrom === 'right' ? 'slide-in-from-right-4' : 'slide-in-from-left-4',
      )
    : undefined;

  const toggleDirection = (direction: TDirection) =>
    setDirections((prev) =>
      prev.includes(direction) ? prev.filter((value) => value !== direction) : [...prev, direction],
    );

  const togglePetKey = (key: TPetFilterKey) =>
    setPetKeys((prev) => (prev.includes(key) ? prev.filter((value) => value !== key) : [...prev, key]));

  // 켜진 조건을 이름으로(T2.4). activeFilterCount 가 세는 것과 같은 목록이어야 한다 — 버튼엔
  // "필터 3" 인데 칩이 둘이면 셋째를 찾아 시트를 뒤진다. 검색어는 시트 밖이라 숫자엔 없지만 칩엔 둔다.
  const activeChips: TActiveChip[] = [
    ...(town !== null ? [{ key: 'town', label: town, onRemove: () => setTown(null) }] : []),
    ...directions.map((direction) => ({
      key: `dir-${direction}`,
      label: DIRECTION_LABEL[direction],
      onRemove: () => toggleDirection(direction),
    })),
    ...filtersOfType
      .filter((filter) => petKeys.includes(filter.key))
      .map((filter) => ({ key: `pet-${filter.key}`, label: filter.label, onRemove: () => togglePetKey(filter.key) })),
    ...(sort !== 'none'
      ? [
          {
            key: 'sort',
            label: SORT_OPTIONS.find((option) => option.id === sort)?.label ?? '',
            onRemove: () => setSort('none'),
          },
        ]
      : []),
    ...(dog && hideHard ? [{ key: 'hideHard', label: '어려운 곳 숨김', onRemove: () => setHideHard(false) }] : []),
    ...(dog && type !== 'stay' && needsIndoor
      ? [{ key: 'indoor', label: '실내 자리 필요', onRemove: () => setNeedsIndoor(false) }]
      : []),
    ...(trimmedQuery ? [{ key: 'query', label: `"${trimmedQuery}"`, onRemove: () => setQuery('') }] : []),
  ];

  return (
    <div>
      {/* 상태바 인셋 위로 번져(bleed-top-4) 자기 블러 배경이 그 자리를 덮으므로 top-safe 가
          아니라 top-0 에 붙는다 — 사이에 다른 색 띠가 끼지 않는다(ADR-010 v2). 색은 바탕과 같은
          크림이고 **불투명**이다(v4) — 흰색이면 이 화면에서만 상태바 자리가 흰 띠가 되고, 반투명이면
          밑을 지나는 카드 글씨가 상태바 뒤로 흐리게 비친다. */}
      <div ref={headerRef} className="sticky top-0 z-30 border-b border-secondary bg-secondary">
        <div className="bleed-top-4 px-4 pb-3 md:px-6">
          <h1 className="sr-only">{TYPE_META[type].label} 둘러보기</h1>

          <PlacesPageTypeTabs
            type={type}
            fromIndex={typeSwitch.fromIndex}
            toIndex={typeSwitch.toIndex}
            pillRef={pillRef}
          />

          <div className="mt-3 flex items-center gap-2">
            <Input
              aria-label="장소 검색"
              icon={SearchMd}
              placeholder="이름·특징·읍면 검색"
              value={query}
              onChange={setQuery}
              className="min-w-0 flex-1"
              /* Input 의 기본 md 프리셋은 py-2 + text-md 라 input 자체가 40px 다.
                 wrapperClassName="h-11" 로 겉박스만 44px 로 키우면 위아래 2px 가 탭해도 포커스가
                 안 잡히는 죽은 띠로 남는다(측정으로 확인). lg 프리셋은 py-2.5 라 input 자체가 44px 다. */
              size="lg"
            />

            {/* 조건은 모바일에서만 접는다 — 아래 펼친 판이 md 부터 대신 나온다. */}
            <div className="md:hidden">
              <PlacesPageFilterSheet
                isOpen={isFilterSheetOpen}
                onOpenChange={setIsFilterSheetOpen}
                type={type}
                town={town}
                directions={directions}
                petKeys={petKeys}
                sort={sort}
                onSelectTown={setTown}
                onToggleDirection={toggleDirection}
                onTogglePetKey={togglePetKey}
                onChangeSort={(next) => void changeSort(next)}
                eligibility={
                  dog
                    ? {
                        hideHard,
                        onToggleHideHard: () => setHideHard((value) => !value),
                        needsIndoor,
                        onToggleNeedsIndoor: () => setNeedsIndoor(!needsIndoor),
                      }
                    : null
                }
                activeCount={activeFilterCount}
                resultCount={results.length}
                onReset={resetConditions}
              />
            </div>
          </div>
        </div>

        {/*
          펼친 조건 판. `hidden` 은 display:none 이라 모바일에서는 탭 순서·스크린리더에서도
          함께 빠진다 — 시트 안의 같은 조건과 둘 다 읽히지 않는다.
        */}
        <div className="hidden md:block">
          <PlacesPageFilters
            variant="bar"
            type={type}
            town={town}
            directions={directions}
            petKeys={petKeys}
            sort={sort}
            onSelectTown={setTown}
            onToggleDirection={toggleDirection}
            onTogglePetKey={togglePetKey}
            onChangeSort={(next) => void changeSort(next)}
          />

          {dog && (
            <PlacesPageEligibilityToggles
              variant="bar"
              type={type}
              hideHard={hideHard}
              onToggleHideHard={() => setHideHard((value) => !value)}
              needsIndoor={needsIndoor}
              onToggleNeedsIndoor={() => setNeedsIndoor(!needsIndoor)}
            />
          )}
        </div>
      </div>

      {/*
        무대: 손가락으로 좌우로 넘기는 표면(placesPageSwipe). `touch-pan-y` 라 세로는 브라우저가
        스크롤로 가져가고 가로만 여기로 온다. `pinch-zoom` 은 pan-y 만 적으면 같이 꺼지므로 되살린다.

        `overflow-x-clip` 은 끌려 나가는 목록과 옆에서 들어오는 엿보기가 가로 스크롤을 만들지
        않게 막는다. 요소는 자기 transform 을 자기 overflow 로 못 자르므로 움직이는 것들의
        **부모**에 건다(`hidden` 과 달리 스크롤 컨테이너를 만들지 않아 위의 sticky 를 안 건드린다).
      */}
      <div
        ref={stageRef}
        {...stageProps}
        className="relative touch-pan-y touch-pinch-zoom overflow-x-clip"
      >
        {/*
          종류를 바꿔 들어온 목록은 탭이 움직인 쪽에서 따라 들어온다 — 알약만 움직이고 아래가
          툭 바뀌면 둘이 다른 화면처럼 논다. 주소를 새로 열었을 때나 스와이프로 왔을 때는
          (enterFrom 이 null) 아무것도 하지 않는다. 필터를 바꿀 때도 다시 뛰지 않는다 — 이
          애니메이션은 마운트될 때 한 번이고, 필터는 같은 마운트 안에서 목록만 갈아끼우기 때문이다.

          들어오는 애니메이션과 손가락이 끄는 transform 은 다른 요소에 건다 — CSS 애니메이션이
          인라인 transform 을 덮어써서, 마운트 직후 바로 끌면 300ms 동안 손가락을 안 따라온다.
        */}
        <div ref={currentRef}>
          <div className={enterAnimationClass}>
            <PlacesPageResults
              type={type}
              town={town}
              results={results}
              townHasNoPlaces={townHasNoPlaces}
              hasFilters={hasFilters}
              resetLabel={resetFiltersLabel(trimmedQuery.length > 0, activeFilterCount)}
              activeChips={activeChips}
              onResetFilters={resetFilters}
              onOpenFilters={() => setIsFilterSheetOpen(true)}
              distances={distances}
            />
            <PlacesPageSuggest type={type} />
          </div>
        </div>

        {peek?.left && (
          <PlacesPageSwipePeek
            ref={leftRef}
            side="left"
            type={peek.left}
            top={peek.top}
            height={peek.height}
          />
        )}
        {peek?.right && (
          <PlacesPageSwipePeek
            ref={rightRef}
            side="right"
            type={peek.right}
            top={peek.top}
            height={peek.height}
          />
        )}
      </div>
    </div>
  );
}
