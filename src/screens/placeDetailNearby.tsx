import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Button } from '../components/base/button';
import { EligibilityBadge } from '../components/eligibilityBadge';
import { FilterChip } from '../components/filterChip';
import { PetBadges } from '../components/petBadges';
import { PlaceThumb } from '../components/placeThumb';
import { TownChip } from '../components/townChip';
import { pickNearby } from '../lib/distanceSort';
import { formatKm } from '../lib/format';
import { dogCallNames, withJosa } from '../lib/korean';
import { nearbyPlaces, TYPE_META, type TPlaceEntry } from '../lib/places';
import { useAppStore } from '../store/useAppStore';
import { useDogCount, useDogMaxWeightKg, useEligibilityMap } from '../store/useDogEligibility';
import type { TPlaceType } from '../types';
import { CARD_SURFACE } from '../components/cardSurface';

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
  const [withHard, setWithHard] = useState(false);
  const dog = useAppStore((state) => state.dog);
  // 카드마다 개별 useEligibility 를 부를 수 없으니(훅은 반복문에서 못 부른다) 한 번에 계산해 둔다.
  const eligibilityMap = useEligibilityMap();
  const weightKg = useDogMaxWeightKg();
  const dogCount = useDogCount();

  // 종류로 걸러도 3곳을 채울 여유가 있게 넉넉히 가져온 뒤 고른다 — 순서는 거리 하나, 어려운 곳은 빼고 센다(`pickNearby`, 14 ↪ 12 U1.4).
  const candidates = useMemo(() => nearbyPlaces(place, 20), [place]);

  const { nearby, hiddenHard } = useMemo(() => {
    const filtered =
      filter === 'all' ? candidates : candidates.filter(({ place: other }) => other.type === filter);
    const isHard = ({ place: other }: (typeof filtered)[number]) => eligibilityMap?.get(other.id)?.level === 'hard';
    // '함께 보기' 를 눌러도 몇 곳을 뺐었는지는 알아야 '다시 빼기' 를 띄운다.
    const without = pickNearby(filtered, { isHard });
    return {
      nearby: withHard ? pickNearby(filtered, { isHard, withHard: true }).shown : without.shown,
      hiddenHard: without.hiddenHard,
    };
  }, [candidates, filter, eligibilityMap, withHard]);

  const dogNames = dog ? dogCallNames(dog.dogs.map((entry) => entry.name)) : '';
  const filterLabel = NEARBY_FILTERS.find((option) => option.id === filter)?.label ?? '';

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
        hiddenHard === 0 && (
          <p className="mt-3 px-4 text-sm text-tertiary md:px-6">근처에 {withJosa(filterLabel, '이/가')} 없어요.</p>
        )
      ) : (
        <ul className="no-scrollbar mt-3 flex gap-2.5 overflow-x-auto px-4 pb-1 md:px-6">
          {nearby.map(({ place: other, km }) => {
            const eligibility = eligibilityMap?.get(other.id);
            return (
              <li key={other.id} className="w-44 shrink-0">
                <Link
                  href={`/place/${other.id}`}
                  className={`flex h-full flex-col ${CARD_SURFACE} p-3 transition-colors hover:bg-secondary`}
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
                    {eligibility && <EligibilityBadge eligibility={eligibility} />}
                    <PetBadges policy={other.policy} limit={1} hideNoInfo={Boolean(eligibility)} weightKg={weightKg} dogCount={dogCount} />
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {/* 어려운 곳은 말없이 사라지지 않는다 — 몇 곳을 뺐는지 말하고 함께 볼 수 있게(14 2026-10-06 ↪ 12 U1.4). */}
      {hiddenHard > 0 && (
        <div className="mt-1 flex items-center justify-between gap-2 px-4 md:px-6">
          <p className="text-sm text-tertiary">
            {withHard
              ? `${dogNames}에게 어려운 곳도 함께 보여요.`
              : nearby.length === 0
                ? `근처 ${filter === 'all' ? '' : `${filterLabel} `}${hiddenHard}곳은 모두 ${dogNames}에게 어려워요.`
                : `${dogNames}에게 어려운 ${hiddenHard}곳은 뺐어요.`}
          </p>
          <Button color="link-color" size="sm" className="min-h-11 shrink-0" onClick={() => setWithHard((on) => !on)}>
            {withHard ? '다시 빼기' : '함께 보기'}
          </Button>
        </div>
      )}
    </section>
  );
}
