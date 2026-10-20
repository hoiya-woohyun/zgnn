'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { PlacesPageChipRow } from './placesPageChipRow';
import { PlacesPageEligibilityToggles } from './placesPageEligibilityToggles';
import { PlacesPageFilters } from './placesPageFilters';
import { PlacesPageFilterSheet } from './placesPageFilterSheet';
import { PlacesPageResults } from './placesPageResults';
import { usePlacesPageResultsView } from './placesPageResultsView';
import { PlacesPageSearchField } from './placesPageSearchField';
import { PlacesPageSortSheet } from './placesPageSortSheet';
import { usePlacesPageSwipe } from './placesPageSwipe';
import { PlacesPageSwipePeek } from './placesPageSwipePeek';
import { PlacesPageTypeTabs } from './placesPageTypeTabs';
import { usePlaceTypeSwitch } from './placesPageTypeSwitch';
import { TYPE_META, type TPlaceEntry } from '../lib/places';
import type { TPetFilterKey, TPlaceSort } from '../lib/placeFilters';
import { placesPageSortLabel } from '../lib/placesPageFilter';
import { countByLevel, levelCountParts } from '../lib/eligibilityCounts';
import { landmarkOfQuery } from '../lib/placeSearch';
import { NEAR_PARAM, nearPlaceOf } from '../lib/distanceSort';
import { LOCATE_NOTICE, locateMe } from '../lib/myLocation';
import { showAppStatus } from '../lib/appStatus';
import { PlacesPageSuggest } from './placesPageSuggest';
import { useAppStore, useDog } from '../store/useAppStore';
import { usePlacesPageFilterStore } from '../store/usePlacesPageFilterStore';
import { recordUiEvent } from '../lib/uiEventsSend';
import { cx } from '../utils/cx';
import type { TDirection, TPlaceType } from '../types';

const useBeforePaint = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/**
 * 종류는 라우트가 정해 준다(`app/places/[type]/page.tsx`).
 * generateStaticParams 가 세 종류만 만들고 dynamicParams 도 꺼 두었으므로
 * 여기까지 온 type 은 항상 유효하다.
 */
export function PlacesPage({ type }: { type: TPlaceType }) {
  /*
   * 검색어·방향·'어려운 곳 숨기기'·종류별 반려동물 조건·종류별 '어려움 N곳' 펼침은 스토어(`usePlacesPageFilterStore`)에 살아 종류를 바꿔도 남는다(07 U3).
   * 정렬·기준점·시트 열림은 종류마다 처음부터다 — 가격순은 숙소에서만, 가까운 순은 위치를 받아야 의미가 있어서 따라오면
   * 칩과 숫자만 있고 아무 일도 안 하는 조건이 된다. 리셋을 useEffect 로 하면 이전 값이 한 프레임 먼저 그려지므로
   * key 로 그 로컬 상태를 통째로 새로 만든다 — 들어오는 애니메이션도 마운트마다 한 번이다.
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
  const needsIndoor = useAppStore((state) => state.needsIndoor);
  const setNeedsIndoor = useAppStore((state) => state.setNeedsIndoor);
  const query = usePlacesPageFilterStore((state) => state.query);
  const setQuery = usePlacesPageFilterStore((state) => state.setQuery);
  const directions = usePlacesPageFilterStore((state) => state.directions);
  const toggleDirection = usePlacesPageFilterStore((state) => state.toggleDirection);
  const petKeysByType = usePlacesPageFilterStore((state) => state.petKeysByType);
  const petKeys = petKeysByType[type];
  const togglePetKeyOfType = usePlacesPageFilterStore((state) => state.togglePetKey);
  const hideHard = usePlacesPageFilterStore((state) => state.hideHard);
  const onlyReachable = usePlacesPageFilterStore((state) => state.onlyReachable);
  const setHideHard = usePlacesPageFilterStore((state) => state.setHideHard);
  const toggleHideHard = usePlacesPageFilterStore((state) => state.toggleHideHard);
  const resetStoredConditions = usePlacesPageFilterStore((state) => state.resetConditions);
  const area = usePlacesPageFilterStore((state) => state.area);
  const clearArea = usePlacesPageFilterStore((state) => state.clearArea);
  const clearOnlyReachable = usePlacesPageFilterStore((state) => state.clearOnlyReachable);
  const toggleOnlyReachable = usePlacesPageFilterStore((state) => state.toggleOnlyReachable);
  const releaseAreaCarried = usePlacesPageFilterStore((state) => state.releaseAreaCarried);
  const [sort, setSort] = useState<TPlaceSort>('none');
  /** 가까운 순의 기준점 — 고를 때 한 번 받는다. 저장하지 않는다(ADR-012 대상 아님). */
  const [origin, setOrigin] = useState<{ lat: number; lng: number } | null>(null);
  /**
   * 기준점이 내 위치가 아니라 **장소**일 때 그 장소(상세 「근처 장소」 의 '더 보기', `?near=`, 14 W261013.14o). 주소가 정본이고 여기는 그 읽은 값이다.
   * 정적 HTML 은 쿼리를 모르고(`useSearchParams` 는 Suspense 경계를 요구한다 — `savedPage` 와 같은 까닭) 상세에서 돌아오면 새로 마운트되므로
   * 마운트마다 주소에서 다시 읽는다. 칠하기 전에 읽어 정렬 전 목록이 한 번 그려졌다 바뀌지 않게.
   */
  const [nearPlace, setNearPlace] = useState<TPlaceEntry | null>(null);
  useBeforePaint(() => {
    const from = nearPlaceOf(window.location.search);
    if (!from?.geo) return;
    setNearPlace(from);
    setOrigin(from.geo);
    setSort('near');
  }, []);
  // hideHard 는 강아지 프로필이 없으면 hard 판정 개념이 없어 애초에 토글이 보이지 않는다.
  /*
   * 모바일 필터 시트의 열림 상태. 시트 안이 아니라 여기에 두는 이유는 빈 상태의 버튼이
   * 시트를 열어야 하기 때문이다 — "다른 읍면을 골라 보세요" 라고 써 놓고 버튼은 읍면을
   * *지우기만* 하면 글과 동작이 반대를 말한다. 종류를 바꾸면 `key={type}` 로 함께 리셋된다.
   */
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  // 정렬 시트(모바일 칩 줄의 '정렬 ▾', 22 D-3). 종류를 바꾸면 정렬과 함께 처음부터다(`key={type}`).
  const [isSortSheetOpen, setIsSortSheetOpen] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(false);
  /**
   * 이 화면에서 마지막으로 알려 준 곳과 그때의 검색어(14 W261019.16) — 목록 끝이 "알려 주셨어요" 로, 같은 검색어의 0곳 안내가 '알려 주기' 를
   * 거둔다(haeun-18b). 기록에 남기지 않는 것은 제안에 하루 한도가 없어서다 — 화면을 떠나면 다시 처음 꼴이다.
   */
  const [suggested, setSuggested] = useState<{ query: string; name: string } | null>(null);

  /*
   * '가까운 순' 의 기준점 — 들어온 장소(`?near=`) → 검색어의 관광지·동(14 W261019.11, '중문' 이면 중문 중심이라 위치를 묻지 않는다) → 내 위치(누를 때 받는다).
   * 칩 이름(`placesPageResultsView` 의 `nearFrom`)도 같은 차례다. 검색어를 지워 기준이 사라지면 정렬도 기본으로 보인다 — 눌린 칩에 기준이 없는 때가 없게.
   */
  const queryLandmark = useMemo(() => landmarkOfQuery(query), [query]);
  const nearOrigin = nearPlace?.geo ?? queryLandmark?.landmark.center ?? origin;
  /*
   * 기준이 사라지면 정렬도 **놓는다**(렌더 중 상태 조정 — `dogProfilePage` 와 같은 패턴). 보이는 모양만 기본으로 두면 값은 'near' 로 남아,
   * 나중에 다른 관광지('성산')를 치는 순간 누르지 않은 '성산에서 가까운 순' 이 눌린 채 살아난다. 지우기 링크가 정렬을 안 건드리게 되며(14 W261019.13a)
   * 그 길이 드러났다 — 전에는 링크가 정렬을 함께 되돌려 가려졌을 뿐, 검색창에서 글자를 지울 때도 같았다.
   */
  if (sort === 'near' && !nearOrigin) setSort('none');
  const shownSort: TPlaceSort = sort === 'near' && !nearOrigin ? 'none' : sort;

  /*
   * 본문(`PlacesPageResults`)이 그리는 값 전부 — 목록과 순서·켜진 조건 칩·0곳 갈래·가까운 곳을 한 함수(`placesPageResultsView`)가 낸다(14 W261019.11g).
   * 엿보기(`placesPageSwipePeek`)도 같은 훅을 순서 없이 불러 손을 놓는 순간 목록·줄이 튀지 않는다. 시트 버튼 숫자(`activeFilterCount`)도 같은 값이라
   * "필터 3" 인데 칩이 둘이라 셋째를 찾아 시트를 뒤지는 일이 없다.
   */
  const view = usePlacesPageResultsView(type, { sort: shownSort, origin: nearOrigin, nearPlace });

  /*
   * 검색이 멈춘 뒤 결과 수 한 줄(ADR-029) — 검색어는 보내지 않는다. 글자마다 적지 않게 1.5초 조용할 때만, **검색어가 바뀌었을 때만**:
   * 조건 칩·종류를 바꿔 수가 달라지거나 이 화면에 돌아온 것(저장된 검색어)은 새 검색이 아니다. 1.5초 안에 결과를 눌러 떠나면 떠날 때 적는다 —
   * 안 그러면 결과가 있는 검색만 빠져서 '0건' 비율이 부풀어 보인다.
   */
  const resultCount = view.results.length;
  const settledQuery = useRef(query);
  const pendingSearch = useRef<{ n: number; pathname: string } | null>(null);
  useEffect(() => {
    if (!query.trim()) {
      settledQuery.current = '';
      pendingSearch.current = null;
      return;
    }
    if (query === settledQuery.current) return;
    pendingSearch.current = { n: resultCount, pathname: window.location.pathname };
    const settle = setTimeout(() => {
      settledQuery.current = query;
      pendingSearch.current = null;
      recordUiEvent('search', { n: resultCount });
    }, 1500);
    return () => clearTimeout(settle);
  }, [query, resultCount]);
  useEffect(
    () => () => {
      const pending = pendingSearch.current;
      if (pending) recordUiEvent('search', pending);
    },
    [],
  );

  // 남는 곳의 판정 셈(목록 머리와 같은 셈) — 판정만 바꾸는 '실내 자리 필요' 의 결과를 시트가 보이게(14 W261013.8).
  const levelParts = useMemo(
    () => (dog ? levelCountParts(countByLevel(view.results, dog, { needsIndoor })) : []),
    [view.results, dog, needsIndoor],
  );

  /*
   * 가까운 순은 고르는 순간 위치를 **한 번** 묻는다(10 F7). 거절·실패면 정렬을 바꾸지 않고 이유를 한 줄로 말한다 —
   * 거절한 사람에게 다시 묻지 않는다(브라우저가 이미 기억한다). 받은 좌표는 이 화면 state 에만 있고 저장하지 않는다.
   */
  const changeSort = async (next: TPlaceSort) => {
    // 장소 기준은 들어올 때 한 번이다 — 다른 정렬로 바꾸면 놓고, 다시 '가까운 순' 을 누르면 내 위치를 묻는다.
    // 주소에서도 지운다: 남겨 두면 상세를 보고 돌아올 때 마운트가 다시 읽어 고른 정렬을 되돌린다.
    if (next !== 'near' && nearPlace) {
      setNearPlace(null);
      setOrigin(null);
      const url = new URL(window.location.href);
      url.searchParams.delete(NEAR_PARAM);
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
      setSort(next);
      return;
    }
    if (next !== 'near' || nearOrigin) {
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

  const trimmedQuery = query.trim();
  /*
   * 시트 안의 "모두 지우기" 는 검색어를 건드리지 않는다 — 검색창은 시트 밖에 그대로
   * 보이는데 여기서 같이 지우면 시트를 닫고 나서야 글자가 사라진 걸 알게 된다.
   * 칩 줄 끝 '초기화'(모바일, 22 D-4 — md 부터는 목록 위 지우기 링크 "필터·검색·모두 지우기")는 검색칸 바로 밑이라 무엇이 지워졌는지 바로 보이므로 검색어까지 지운다.
   *
   * **정렬은 둘 다 건드리지 않는다**(14 W261019.13a). 정렬은 시트에 없고(W261019.13) 칩 수에도 안 들어, 시트 버튼이 보이지 않는 것을
   * 바꾸는 꼴이었다 — 숙소를 '가격 낮은 순' 으로 보다가 시트에서 조건을 지우면 순서가 말없이 돌아갔다. 지우기 링크도 같다: 문구가
   * 필터·검색을 지운다고 말하고, 정렬만 남았을 땐 링크가 서지도 않으며, 지금 순서는 바로 옆 '정렬 ▾' 칩(모바일)·셀렉트(md)가 말한다.
   */
  const resetConditions = () => {
    setTown(null);
    // 방향·조건·숨기기는 다른 종류 것까지 푼다 — 이 탭에서 "모두 지우기" 를 눌렀는데 옆 탭에 안 보이는 조건이 남으면 안 된다.
    resetStoredConditions();
    // activeFilterCount 가 세는 것은 여기서 전부 풀어야 한다 — 숫자는 1 인데 눌러도 안 바뀌면 고장으로 보인다.
    // 숙소 탭은 세지도 보이지도 않으므로 건드리지 않는다 — 보이지 않는 전역 값을 몰래 끄면 식당·카페 판정이 말없이 바뀐다(12 U0.3).
    if (type !== 'stay') setNeedsIndoor(false);
  };

  // 칩 줄의 '초기화'(md 는 목록 위 지우기 링크)는 시트에 없는 것(검색어·권역)까지 지운다 — 칩 줄에 보이는 것을 전부 지우는 것이 그 말이다(14 W261019.11f).
  // '갈 수 있는 곳만' 은 시트에 칩이 생겨(14 W261013.14d) `resetConditions` 가 푼다.
  const resetFilters = () => {
    setQuery('');
    clearArea();
    resetConditions();
  };

  // 읍면을 고르면 권역을 대신한다(14 W261010.33i) — 권역 진입(`usePlacesPageAreaEntry`)이 읍면을 푸는 것과 짝. 둘 다 "어디" 라
  // 겹치면 '서부' 안의 '구좌읍' 처럼 이유 없이 0곳이다. 권역 안 읍면이면 지워도 목록이 같아서 가리지 않고 지운다 — 칩 수(`townChipCounts`)도 권역을 빼고 센다.
  const selectTown = (next: string | null) => {
    setTown(next);
    if (next !== null) clearArea();
  };

  const enterAnimationClass = typeSwitch.enterFrom
    ? cx(
        'duration-300 ease-out animate-in fade-in motion-reduce:animate-none',
        typeSwitch.enterFrom === 'right' ? 'slide-in-from-right-4' : 'slide-in-from-left-4',
      )
    : undefined;

  const togglePetKey = (key: TPetFilterKey) => togglePetKeyOfType(type, key);

  const removeChip = (key: string) => {
    if (key === 'area') clearArea();
    else if (key === 'onlyReachable') clearOnlyReachable();
    else if (key === 'town') setTown(null);
    else if (key === 'indoor') setNeedsIndoor(false);
    else if (key === 'hideHard') setHideHard(false);
    else if (key === 'query') setQuery('');
    else if (key.startsWith('dir-')) toggleDirection(key.slice(4) as TDirection);
    else if (key.startsWith('pet-')) togglePetKey(key.slice(4) as TPetFilterKey);
  };

  /*
   * 검색칸 밑 칩 줄(모바일)의 켠 조건 — 평범한 검색어 칩은 빼고 반경을 말하는 것(`"중문" · 3km 안`)만 남긴다(14 W261019.11a — 검색어는 바로 위 검색칸이 말한다).
   * md 부터는 줄이 없고 본문의 켜진 조건 줄(`PlacesPageActiveChips`)이 그대로 선다 — 그 줄은 0곳 안내의 "풀면 N곳" 버튼과 같은 키를 쓴다.
   */
  const rowChips = view.chips
    .filter((chip) => chip.key !== 'query' || chip.notInHeader)
    .map((chip) => ({ ...chip, onRemove: () => removeChip(chip.key) }));

  return (
    <div>
      {/* 상태바 인셋 위로 번져(bleed-top-4) 자기 블러 배경이 그 자리를 덮으므로 top-safe 가
          아니라 top-0 에 붙는다 — 사이에 다른 색 띠가 끼지 않는다(ADR-010 v2). 색은 바탕과 같은
          크림이고 **불투명**이다(v4) — 흰색이면 이 화면에서만 상태바 자리가 흰 띠가 되고, 반투명이면
          밑을 지나는 카드 글씨가 상태바 뒤로 흐리게 비친다. */}
      <div ref={headerRef} className="sticky top-0 z-30 border-b border-secondary bg-secondary">
        <div className="bleed-top-4 px-4 pb-1 md:px-6 md:pb-2">
          <h1 className="sr-only">{TYPE_META[type].label} 둘러보기</h1>

          <PlacesPageTypeTabs
            type={type}
            fromIndex={typeSwitch.fromIndex}
            toIndex={typeSwitch.toIndex}
            pillRef={pillRef}
          />

          {/* 검색칸은 전폭이다(22 D-2) — '필터' 는 밑 칩 줄 맨 앞으로 내려갔다. 검색어만 지우는 ✕ 가 칸 안에 있다(14 W261019.11e). */}
          <PlacesPageSearchField query={query} onChange={setQuery} className="mt-3" />
        </div>

        {/* 조건은 모바일에서만 접는다 — 아래 펼친 판이 md 부터 대신 나온다. 줄 높이 44px 라 머리 높이가 켠 조건 수와 상관없다. */}
        <PlacesPageChipRow
          className="mb-1 md:hidden"
          activeFilterCount={view.activeFilterCount}
          chips={rowChips}
          sortLabel={placesPageSortLabel(shownSort, { hasDog: Boolean(dog), nearFrom: view.nearFrom })}
          isFilterOpen={isFilterSheetOpen}
          onOpenFilters={() => setIsFilterSheetOpen(true)}
          isSortOpen={isSortSheetOpen}
          onOpenSort={() => setIsSortSheetOpen(true)}
          showReset={area !== null || view.activeFilterCount > 0}
          resetLabel={view.resetLabel}
          onReset={resetFilters}
        />
        <PlacesPageSortSheet
          isOpen={isSortSheetOpen}
          onOpenChange={setIsSortSheetOpen}
          type={type}
          sort={shownSort}
          hasDog={Boolean(dog)}
          nearFrom={view.nearFrom}
          onChangeSort={(next) => void changeSort(next)}
        />
              <PlacesPageFilterSheet
                isOpen={isFilterSheetOpen}
                onOpenChange={setIsFilterSheetOpen}
                type={type}
                town={town}
                area={area}
                directions={directions}
                petKeys={petKeys}
                onSelectTown={selectTown}
                onToggleDirection={toggleDirection}
                onTogglePetKey={togglePetKey}
                eligibility={
                  dog
                    ? {
                        onlyReachable,
                        onToggleOnlyReachable: toggleOnlyReachable,
                        hideHard,
                        onToggleHideHard: toggleHideHard,
                        needsIndoor,
                        onToggleNeedsIndoor: () => setNeedsIndoor(!needsIndoor),
                        levelParts,
                      }
                    : null
                }
                activeCount={view.activeFilterCount}
                resultCount={view.results.length}
                onReset={resetConditions}
              />

        {/*
          펼친 조건 판. `hidden` 은 display:none 이라 모바일에서는 탭 순서·스크린리더에서도
          함께 빠진다 — 시트 안의 같은 조건과 둘 다 읽히지 않는다.
          간격은 판이 갖는다 — 줄 사이 8px, 맨 아래 12px. 아래 여백을 조건 묶음이 갖고 있을 땐 강아지 줄이 그 뒤에 붙어
          머리 경계선에 닿았다(14 W261013.10c). 위는 검색 줄의 `md:pb-2` 라 줄 사이와 같은 8px.
        */}
        <div className="hidden space-y-2 pb-3 md:block">
          <PlacesPageFilters
            variant="bar"
            type={type}
            town={town}
            area={area}
            directions={directions}
            petKeys={petKeys}
            sort={shownSort}
            onSelectTown={selectTown}
            onToggleDirection={toggleDirection}
            onTogglePetKey={togglePetKey}
            onChangeSort={(next) => void changeSort(next)}
            hasDog={Boolean(dog)}
            nearFrom={view.nearFrom}
          />

          {dog && (
            <PlacesPageEligibilityToggles
              variant="bar"
              type={type}
              onlyReachable={onlyReachable}
              onToggleOnlyReachable={toggleOnlyReachable}
              hideHard={hideHard}
              onToggleHideHard={toggleHideHard}
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
              view={view}
              actions={{
                onResetFilters: resetFilters,
                onClearQuery: () => setQuery(''),
                onClearTown: () => setTown(null),
                onOpenFilters: () => setIsFilterSheetOpen(true),
                onSuggest: () => setSuggestOpen(true),
                onReleaseHidden: () => {
                  setHideHard(false);
                  clearOnlyReachable();
                },
                onClearArea: clearArea,
                onClearOnlyReachable: clearOnlyReachable,
                onReleaseAreaCarried: () => {
                  setTown(null);
                  releaseAreaCarried(type);
                },
                onCityDowntown: selectTown,
                onRemoveChip: removeChip,
              }}
              suggestSent={suggested !== null && suggested.query === trimmedQuery}
            />
            <PlacesPageSuggest
              type={type}
              query={trimmedQuery}
              open={suggestOpen}
              onOpenChange={setSuggestOpen}
              sentName={suggested?.name}
              onSent={(name) => setSuggested({ query: trimmedQuery, name })}
            />
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
