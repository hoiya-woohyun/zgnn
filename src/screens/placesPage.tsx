'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { SearchMd } from '@untitledui/icons';
import { PlacesPageEligibilityToggles } from './placesPageEligibilityToggles';
import { PlacesPageFilters } from './placesPageFilters';
import { PlacesPageFilterSheet } from './placesPageFilterSheet';
import { PlaceCard } from '../components/placeCard';
import { EmptyState } from '../components/layout/emptyState';
import { Button } from '../components/base/button';
import { Input } from '../components/base/input';
import { PLACE_TYPES, TYPE_META, placesOfType } from '../lib/places';
import { PET_FILTERS, comparePrice, type TPetFilterKey, type TPriceSort } from '../lib/placeFilters';
import { sortByEligibility } from '../lib/sortByEligibility';
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
  const town = useAppStore((state) => state.town);
  const setTown = useAppStore((state) => state.setTown);
  const dog = useDog();
  const eligibilityMap = useEligibilityMap();
  const needsIndoor = useAppStore((state) => state.needsIndoor);
  const setNeedsIndoor = useAppStore((state) => state.setNeedsIndoor);
  const [query, setQuery] = useState('');
  const [directions, setDirections] = useState<TDirection[]>([]);
  const [petKeys, setPetKeys] = useState<TPetFilterKey[]>([]);
  const [sort, setSort] = useState<TPriceSort>('none');
  // 화면 로컬 상태 — 강아지 프로필이 없으면 hard 판정 개념이 없어 애초에 토글이 보이지 않는다.
  const [hideHard, setHideHard] = useState(false);

  // 다른 조건과 별개로 먼저 걸러 둔다 — 이 종류에 그 읍면 자체가 없으면(0곳) 전용 빈 상태를 보여줘야 한다.
  const byTown = useMemo(() => {
    const list = placesOfType(type);
    return town ? list.filter((place) => place.region.town === town) : list;
  }, [type, town]);
  const townHasNoPlaces = town !== null && byTown.length === 0;

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
    const activeTests = PET_FILTERS[type].filter((filter) => petKeys.includes(filter.key));
    if (activeTests.length > 0) {
      list = list.filter((place) => activeTests.every((filter) => filter.test(place.policy)));
    }
    // "실내 자리 필요"(needsIndoor)는 이미 judgeEligibility(opts) 를 통해 야외 전용 장소를
    // 어려움으로 밀어 올린다 — 그 결과를 hideHard 가 걸러낸다. 여기서 policy.indoor 를
    // 직접 다시 걸러내지 않는 이유는 판정 로직을 화면에서 중복하지 않기 위해서다.
    if (hideHard && eligibilityMap) {
      list = list.filter((place) => eligibilityMap.get(place.id)?.level !== 'hard');
    }
    if (type === 'stay' && sort !== 'none') {
      // 가격 정렬을 고르면 가격이 우선이다(2026-09-15 리뷰 후속 B3 결정).
      list = [...list].sort(comparePrice(sort));
    } else if (eligibilityMap) {
      // 프로필이 있으면 기본 정렬은 ok → cond → unknown → hard(갈 수 있어요 → 확인이 필요해요 → 정보가 없어요 → 이용하기 어려워요).
      list = sortByEligibility(list, eligibilityMap, (place) => place.id);
    }
    return list;
  }, [byTown, type, query, directions, petKeys, sort, hideHard, eligibilityMap]);

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

  const hasFilters = query.trim().length > 0 || activeFilterCount > 0;

  /*
   * 시트 안의 "필터 모두 지우기" 는 검색어를 건드리지 않는다 — 검색창은 시트 밖에 그대로
   * 보이는데 여기서 같이 지우면 시트를 닫고 나서야 글자가 사라진 걸 알게 된다.
   * 목록 위의 "필터 지우기" 는 검색창 옆에 있어 무엇이 지워졌는지 바로 보이므로 검색어까지 지운다.
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

  const toggleDirection = (direction: TDirection) =>
    setDirections((prev) =>
      prev.includes(direction) ? prev.filter((value) => value !== direction) : [...prev, direction],
    );

  const togglePetKey = (key: TPetFilterKey) =>
    setPetKeys((prev) => (prev.includes(key) ? prev.filter((value) => value !== key) : [...prev, key]));

  return (
    <div>
      <div className="sticky top-0 z-30 border-b border-secondary bg-secondary/95 pt-safe backdrop-blur">
        <div className="px-4 pt-4 pb-3 md:px-6">
          <h1 className="sr-only">{TYPE_META[type].label} 둘러보기</h1>

          {/*
            생김새는 탭이지만 실제로는 주소를 바꾸는 링크다.

            react-aria Tabs 에 href 를 주면 <a> 로 그려주긴 하는데, 고른 탭에 aria-controls 가
            붙은 채 짝이 되는 TabPanel 이 없어서 존재하지 않는 영역을 가리키게 된다.
            여기는 탭마다 패널이 바뀌는 게 아니라 주소 자체가 바뀌는 자리라 패널을 만들 수도 없다.
            그래서 그냥 링크로 두고, 현재 위치는 aria-current 로만 알린다.
          */}
          <nav aria-label="장소 종류">
            <ul className="flex gap-1 rounded-lg border border-secondary bg-primary p-1">
              {PLACE_TYPES.map((candidate) => {
                const active = candidate === type;
                return (
                  <li key={candidate} className="flex-1">
                    <Link
                      href={`/places/${candidate}`}
                      aria-current={active ? 'page' : undefined}
                      className={cx(
                        'flex h-11 items-center justify-center rounded-md text-sm font-semibold transition-colors',
                        active
                          ? 'bg-brand-primary text-brand-secondary'
                          : 'text-tertiary hover:bg-secondary',
                      )}
                    >
                      {TYPE_META[candidate].label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

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
                type={type}
                town={town}
                directions={directions}
                petKeys={petKeys}
                sort={sort}
                onSelectTown={setTown}
                onToggleDirection={toggleDirection}
                onTogglePetKey={togglePetKey}
                onChangeSort={setSort}
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
            onChangeSort={setSort}
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

      <div className="flex items-center justify-between px-4 pt-4 md:px-6">
        <div>
          <p className="text-sm text-tertiary">{results.length}곳</p>
          {/* 조건을 여러 개 겹쳐 0~1곳만 남았을 때 "왜 이렇게 적지" 하고 이탈하지 않도록
              조건을 하나 풀어보라고 먼저 알려준다(2026-09-15 리뷰 §1 — 세 필터 켜면 0~1곳 안내 없음). */}
          {hasFilters && results.length === 1 && (
            <p className="mt-0.5 text-xs text-tertiary">필터를 하나 풀어 보면 더 볼 수 있어요.</p>
          )}
        </div>
        {hasFilters && (
          <Button color="link-color" size="sm" className="min-h-11" onClick={resetFilters}>
            필터 지우기
          </Button>
        )}
      </div>

      {results.length > 0 ? (
        <ul className="mt-3 space-y-3 px-4 md:px-6">
          {results.map((place) => (
            <PlaceCard key={place.id} place={place} />
          ))}
        </ul>
      ) : townHasNoPlaces ? (
        <div className="px-4 pt-6 md:px-6">
          <EmptyState
            Icon={SearchMd}
            title={`${town}엔 ${TYPE_META[type].label}가 없어요`}
            description="다른 읍면을 골라 보세요."
            action={
              <Button color="primary" size="md" onClick={() => setTown(null)}>
                읍면 해제
              </Button>
            }
          />
        </div>
      ) : (
        <div className="px-4 pt-6 md:px-6">
          <EmptyState
            Icon={SearchMd}
            title="필터에 맞는 곳이 없어요"
            description="필터를 하나 풀어 보세요."
            action={
              <Button color="primary" size="md" onClick={resetFilters}>
                필터 지우기
              </Button>
            }
          />
        </div>
      )}
    </div>
  );
}
