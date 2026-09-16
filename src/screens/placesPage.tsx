'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { SearchMd } from '@untitledui/icons';
import { PlacesPageFilters } from './placesPageFilters';
import { PlaceCard } from '../components/placeCard';
import { EmptyState } from '../components/layout/emptyState';
import { Button } from '../components/base/button';
import { Input } from '../components/base/input';
import { PLACE_TYPES, TYPE_META, placesOfType } from '../lib/places';
import { PET_FILTERS, comparePrice, type TPetFilterKey, type TPriceSort } from '../lib/placeFilters';
import { useAppStore } from '../store/useAppStore';
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
  const [query, setQuery] = useState('');
  const [directions, setDirections] = useState<TDirection[]>([]);
  const [petKeys, setPetKeys] = useState<TPetFilterKey[]>([]);
  const [sort, setSort] = useState<TPriceSort>('none');

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
    if (type === 'stay' && sort !== 'none') {
      list = [...list].sort(comparePrice(sort));
    }
    return list;
  }, [byTown, type, query, directions, petKeys, sort]);

  const hasFilters =
    query.trim().length > 0 ||
    town !== null ||
    directions.length > 0 ||
    petKeys.length > 0 ||
    sort !== 'none';

  const resetFilters = () => {
    setQuery('');
    setTown(null);
    setDirections([]);
    setPetKeys([]);
    setSort('none');
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

          <div className="mt-3">
            <Input
              aria-label="장소 검색"
              icon={SearchMd}
              placeholder="이름·특징·읍면 검색"
              value={query}
              onChange={setQuery}
            />
          </div>
        </div>

        <PlacesPageFilters
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
      </div>

      <div className="flex items-center justify-between px-4 pt-4 md:px-6">
        <p className="text-sm text-tertiary">{results.length}곳</p>
        {hasFilters && (
          <Button color="link-color" size="sm" onClick={resetFilters}>
            조건 지우기
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
            title="조건에 맞는 곳이 없어요"
            description="검색어나 방향, 반려동물 조건을 조금 줄여보세요."
            action={
              <Button color="primary" size="md" onClick={resetFilters}>
                조건 지우기
              </Button>
            }
          />
        </div>
      )}
    </div>
  );
}
