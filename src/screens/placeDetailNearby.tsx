import { useMemo, useState } from 'react';
import Link from 'next/link';
import { EligibilityBadge } from '../components/eligibilityBadge';
import { FilterChip } from '../components/filterChip';
import { PetBadges } from '../components/petBadges';
import { PlaceThumb } from '../components/placeThumb';
import { TownChip } from '../components/townChip';
import { sortNearby } from '../lib/distanceSort';
import { formatKm } from '../lib/format';
import { withJosa } from '../lib/korean';
import { nearbyPlaces, TYPE_META, type TPlaceEntry } from '../lib/places';
import { useEligibilityMap } from '../store/useDogEligibility';
import type { TPlaceType } from '../types';

type TNearbyFilter = 'all' | TPlaceType;

const NEARBY_FILTERS: { id: TNearbyFilter; label: string }[] = [
  { id: 'all', label: '전체' },
  { id: 'stay', label: TYPE_META.stay.label },
  { id: 'restaurant', label: TYPE_META.restaurant.label },
  { id: 'cafe', label: TYPE_META.cafe.label },
];

/** 근처 장소. 좌표가 있는 장소만 계산되므로(nearbyPlaces), 아예 없으면 섹션째 숨긴다. */
export function PlaceDetailNearby({ place }: { place: TPlaceEntry }) {
  const [filter, setFilter] = useState<TNearbyFilter>('all');
  // 카드마다 개별 useEligibility 를 부를 수 없으니(훅은 반복문에서 못 부른다) 한 번에 계산해 둔다.
  const eligibilityMap = useEligibilityMap();

  // 종류로 걸러도 3곳을 채울 여유가 있게 넉넉히 가져온 뒤 다시 정렬한다 — 못 가는 곳은 뒤로, 그다음 거리순(`sortNearby`, 12 U1.4).
  const candidates = useMemo(() => nearbyPlaces(place, 20), [place]);

  const nearby = useMemo(() => {
    const filtered =
      filter === 'all' ? candidates : candidates.filter(({ place: other }) => other.type === filter);
    return sortNearby(filtered, {
      isSameTown: ({ place: other }) => other.region.town === place.region.town,
      isHard: ({ place: other }) => eligibilityMap?.get(other.id)?.level === 'hard',
    }).slice(0, 3);
  }, [candidates, filter, place.region.town, eligibilityMap]);

  if (candidates.length === 0) return null;

  return (
    <section className="mt-8">
      <h2 className="px-4 text-lg font-bold text-primary md:px-6">근처 장소</h2>

      <div
        className="no-scrollbar mt-2 flex gap-2 overflow-x-auto px-4 md:px-6"
        role="group"
        aria-label="근처 장소 종류"
      >
        {NEARBY_FILTERS.map((option) => (
          <FilterChip key={option.id} pressed={filter === option.id} onClick={() => setFilter(option.id)}>
            {option.label}
          </FilterChip>
        ))}
      </div>

      {nearby.length === 0 ? (
        <p className="mt-3 px-4 text-sm text-tertiary md:px-6">
          근처에 {withJosa(NEARBY_FILTERS.find((option) => option.id === filter)?.label ?? '', '이/가')} 없어요.
        </p>
      ) : (
        <ul className="no-scrollbar mt-3 flex gap-2.5 overflow-x-auto px-4 pb-1 md:px-6">
          {nearby.map(({ place: other, km }) => {
            const level = eligibilityMap?.get(other.id)?.level;
            return (
              <li key={other.id} className="w-44 shrink-0">
                <Link
                  href={`/place/${other.id}`}
                  className="flex h-full flex-col rounded-2xl border border-secondary bg-primary p-3 transition-colors hover:bg-secondary"
                >
                  <div className="flex items-center justify-between">
                    <PlaceThumb src={other.cover ?? other.images[0]} type={other.type} variant="compact" />
                    <span className="text-sm font-bold text-secondary">{formatKm(km)}</span>
                  </div>
                  <p className="clamp-2 mt-2 text-sm font-bold text-primary">{other.name}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-1">
                    <TownChip town={other.region.town} type={other.type} />
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1">
                    {level && <EligibilityBadge level={level} />}
                    <PetBadges policy={other.policy} limit={1} hideNoInfo={Boolean(level)} />
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
