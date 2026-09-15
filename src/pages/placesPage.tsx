import { useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router';
import { SearchMd } from '@untitledui/icons';
import { PlacesPageFilters } from './placesPageFilters';
import { PlaceCard } from '../components/placeCard';
import { EmptyState } from '../components/layout/emptyState';
import { Button } from '../components/base/button';
import { Input } from '../components/base/input';
import { PLACE_TYPES, TYPE_META, isPlaceType, placesOfType } from '../lib/places';
import { PET_FILTERS, comparePrice, type TPetFilterKey, type TPriceSort } from '../lib/placeFilters';
import { cx } from '../utils/cx';
import type { TDirection, TPlaceType } from '../types';

export function PlacesPage() {
  const { type: typeParam } = useParams();
  const type = isPlaceType(typeParam) ? typeParam : undefined;

  if (!type) return <Navigate to="/places/stay" replace />;

  /*
   * 종류마다 조건 항목이 달라서, 종류를 바꾸면 조건은 처음부터 다시 고른다.
   * 리셋을 useEffect 로 하면 이전 조건이 적용된 목록이 한 프레임 먼저 그려진다.
   * key 로 조건 상태를 통째로 새로 만들면 그 중간 상태 자체가 생기지 않는다.
   */
  return <PlacesPageOfType key={type} type={type} />;
}

function PlacesPageOfType({ type }: { type: TPlaceType }) {
  const [query, setQuery] = useState('');
  const [directions, setDirections] = useState<TDirection[]>([]);
  const [petKeys, setPetKeys] = useState<TPetFilterKey[]>([]);
  const [sort, setSort] = useState<TPriceSort>('none');

  const results = useMemo(() => {
    let list = placesOfType(type);

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
  }, [type, query, directions, petKeys, sort]);

  const hasFilters =
    query.trim().length > 0 || directions.length > 0 || petKeys.length > 0 || sort !== 'none';

  const resetFilters = () => {
    setQuery('');
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
      <div className="sticky top-0 z-30 border-b border-secondary bg-secondary/95 backdrop-blur">
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
                      to={`/places/${candidate}`}
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
          directions={directions}
          petKeys={petKeys}
          sort={sort}
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
