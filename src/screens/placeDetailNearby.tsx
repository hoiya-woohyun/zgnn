import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Button } from '../components/base/button';
import { FilterChip } from '../components/filterChip';
import { PlaceTypeMark } from '../components/placeTypeMark';
import { VerdictLine } from '../components/verdictLine';
import { distanceLabel, pickNearby, placesNearHref } from '../lib/distanceSort';
import { verdictHidesBadge, verdictLeadBadges } from '../lib/eligibility';
import { dogCallNames, withJosa } from '../lib/korean';
import { nearbyPlaces, TYPE_META, type TPlaceEntry } from '../lib/places';
import { PLACE_DETAIL_NEARBY_NO_GEO, placeDetailLocationOf } from '../lib/placeDetailLocation';
import { placeMetaLine } from '../lib/placeMetaLine';
import { useAppStore } from '../store/useAppStore';
import { useDogCount, useDogMaxWeightKg, useEligibilityMap } from '../store/useDogEligibility';
import { usePlacesPageFilterStore } from '../store/usePlacesPageFilterStore';
import type { TPlaceType } from '../types';

type TNearbyFilter = 'all' | TPlaceType;

const NEARBY_FILTERS: { id: TNearbyFilter; label: string }[] = [
  { id: 'all', label: '전체' },
  { id: 'stay', label: TYPE_META.stay.label },
  { id: 'restaurant', label: TYPE_META.restaurant.label },
  { id: 'cafe', label: TYPE_META.cafe.label },
];

/** 근처 장소. 좌표가 있는 장소만 계산되므로(nearbyPlaces) 좌표가 없으면 이유 한 줄, 같은 섬에 다른 곳이 없으면 섹션째 숨긴다. */
export function PlaceDetailNearby({ place }: { place: TPlaceEntry }) {
  const [filter, setFilter] = useState<TNearbyFilter>('all');
  const [withHard, setWithHard] = useState(false);
  const dog = useAppStore((state) => state.dog);
  // 카드마다 개별 useEligibility 를 부를 수 없으니(훅은 반복문에서 못 부른다) 한 번에 계산해 둔다.
  const eligibilityMap = useEligibilityMap();
  const weightKg = useDogMaxWeightKg();
  const dogCount = useDogCount();
  const enterNear = usePlacesPageFilterStore((state) => state.enterNear);
  const setTown = useAppStore((state) => state.setTown);

  // 같은 섬 전부를 거리순으로 받고 종류로 거른 뒤 고른다 — 순서는 거리 하나, 어려운 곳은 빼고 센다(`pickNearby`, 14 ↪ 12 U1.4).
  // 가까운 20곳에서 자르던 때는 종류 칩보다 자르기가 먼저라, 식당 상세 넷에서 '숙소' 칩이 30곳 중 2장만 그렸다(14 W261013.14o). 122곳이라 비용은 없다.
  const candidates = useMemo(() => nearbyPlaces(place, Infinity), [place]);

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
  // 카드 너머가 남은 종류만 '더 보기' 를 단다 — 우도처럼 같은 섬 곳이 다 보이면 목록으로 보낼 곳이 없다. '전체' 에선 달지 않는다(종류 칩을 켜면 목록 끝에 선다).
  const hasMore =
    filter !== 'all' &&
    candidates.filter(({ place: other }) => other.type === filter).length >
      nearby.filter(({ place: other }) => other.type === filter).length;

  // 좌표가 없어 못 찾은 것은 이유를 말한다 — 그 숙소를 거점으로 주변 식당을 찾던 사람에게 말없이 빈 자리는 "근처에 없다" 로 읽힌다(14 W261013.7).
  // 같은 섬에 다른 곳이 없어 빈 것(우도·추자)은 위치를 아는 것이라 이 말이 아니다 — 그건 아래에서 절째 뺀다.
  if (placeDetailLocationOf(place) === 'noGeo') {
    return (
      <section className="mt-8 px-4 md:px-6">
        <h2 className="text-md font-bold text-primary">근처 장소</h2>
        <p className="mt-2 text-sm text-tertiary">{PLACE_DETAIL_NEARBY_NO_GEO}</p>
      </section>
    );
  }
  if (candidates.length === 0) return null;

  return (
    <section className="mt-8">
      <h2 className="px-4 text-md font-bold text-primary md:px-6">근처 장소</h2>

      <div
        className="no-scrollbar mt-1 flex min-h-11 items-center gap-2 overflow-x-auto px-4 md:px-6"
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
        // 세로 줄이다 — 많아야 3곳(`pickNearby`)인데 176px 카드를 옆으로 세우면 390px 폰에서 셋째가 2px, 375px 에선 0px 라
        // 밀 수 있다는 것조차 안 보였다(14 W261013.14p · youngja-06-s3). 줄 셋이 카드 셋보다 낮고, 셸의 좌우 끌기와도 안 겹친다.
        <ul className="mx-4 mt-3 divide-y divide-secondary border-y border-secondary md:mx-6">
          {nearby.map(({ place: other, km }) => {
            const eligibility = eligibilityMap?.get(other.id);
            const lead = eligibility ? verdictLeadBadges(eligibility, other.policy) : undefined;
            return (
              <li key={other.id}>
                <Link
                  href={`/place/${other.id}`}
                  className="flex min-h-11 items-start gap-3 py-3 transition-colors hover:bg-tertiary"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="flex min-w-0 items-start gap-1.5 text-md font-semibold text-primary">
                        <PlaceTypeMark type={other.type} className="mt-1" />
                        <span className="clamp-2 min-w-0">{other.name}</span>
                      </p>
                      <span className="shrink-0 text-sm text-secondary">{distanceLabel(km)}</span>
                    </div>
                    {/* 줄 순서는 목록 행과 같다 — 이름(+ 거리) → 판정 줄 → 메타(22 R27.3 · design-audit D-4). 근처만 메타가 판정보다 먼저였다.
                        판정 옆 조건도 목록 카드와 같은 거르기 — 어려움 옆 '중형견 OK'·요금이 서지 않게(14 W261013.1a). 이유 줄은 없다.
                        그래서 판정 옆 칩은 이유로 읽힌다 — 판정을 정한 조건을 맨 앞에(14 W261013.1c), 거르기엔 넘기지 않는다(유일한 단서다).
                        목록 카드와 같은 `verdictLeadBadges`(14 W261027.1a) — 어려움 근거가 둘이면(무게 + 마릿수) 둘 다 앞서고, 앞선 칩은 `limit` 자리를 늘려 접히지 않는다. */}
                    <VerdictLine
                      eligibility={eligibility}
                      policy={other.policy}
                      limit={Math.max(1, lead?.length ?? 0)}
                      hide={eligibility ? verdictHidesBadge(eligibility, other.policy, undefined) : undefined}
                      lead={lead}
                      weightKg={weightKg}
                      dogCount={dogCount}
                      className="mt-0.5"
                    />
                    <p className="mt-0.5 truncate text-sm text-tertiary">{placeMetaLine(other)}</p>
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

      {/* 카드 너머는 목록으로 — 이 장소에서 잰 '가까운 순'(`?near=`). 숙소 근처 식당을 보려고 목록의 '가까운 순' 을 골랐다가
          "위치 권한이 꺼져 있어요" 에서 막혔다(14 W261013.14o · seongho-28). 들어가며 다른 "어디"(검색어·권역·방향·읍면)는 푼다(`enterNear`).
          종류 링크는 칩 줄과 합쳤다 — '숙소·식당·카페' 글자 링크 셋은 폭 23.7 이라 가로 히트가 모자랐다(22 R27.7 · D-16). 종류 칩을 켜면 목록 끝에 한 줄(전폭 44). */}
      {filter !== 'all' && hasMore && (
        <Link
          href={placesNearHref(filter, place.id)}
          onClick={() => {
            enterNear();
            setTown(null);
          }}
          data-ev="detail.nearMore"
          aria-label={`근처 ${TYPE_META[filter].label} 더 보기`}
          className="mx-4 flex min-h-11 items-center justify-between text-sm font-semibold text-brand-secondary hover:text-brand-secondary_hover md:mx-6"
        >
          {TYPE_META[filter].label} 더 보기
          <span aria-hidden="true">›</span>
        </Link>
      )}
    </section>
  );
}
