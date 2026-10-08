'use client';

import { useState } from 'react';
import { NaverLinkButton } from '../components/naverLinkButton';
import { Button } from '../components/base/button';
import { showAppStatus } from '../lib/appStatus';
import { LOCATE_NOTICE, locateMe } from '../lib/myLocation';
import { routeUrl, splitStops } from '../lib/naverRouteLink';
import type { TPlaceEntry } from '../lib/places';
import { TRIP_DAYS, type TTripDay, type TTripPlan } from '../lib/tripPlan';
import { JEJU_AIRPORT } from '../lib/tripRoute';
import { JEJU_AIRPORT_NAME, movedStop, tripDayStart, tripDayStops } from '../lib/tripDayView';
import type { TGeo } from '../types';
import { useAppStore } from '../store/useAppStore';
import { SavedPageCard } from './savedPageCard';

/**
 * 저장 화면의 「날짜별」 보기(16 T1.4, 임시안) — 1~4일차 중 곳이 있는 날마다 한 묶음, 끝에 미정.
 * 하루의 순서·시작점은 `lib/tripDayView.ts` 가 정한다. 길찾기는 순서대로 묶음(`splitStops`)마다 알약 하나.
 */
export function SavedPageDays({ places }: { places: readonly TPlaceEntry[] }) {
  const savedIds = useAppStore((state) => state.savedIds);
  const tripDays = useAppStore((state) => state.tripDays);
  const tripOrder = useAppStore((state) => state.tripOrder);
  // 하트가 꺼진 카드는 라벨이 이미 지워졌으므로 미정에 남는다. 날짜별에는 켜진 곳만 넣는다.
  const savedPlaces = places.filter((place) => savedIds.includes(place.id));
  const plan: TTripPlan = { days: tripDays, order: tripOrder };
  const undecided = places.filter((place) => !(place.id in tripDays) || !savedIds.includes(place.id));
  return (
    <>
      {TRIP_DAYS.map((day) =>
        savedPlaces.some((place) => tripDays[place.id] === day) ? (
          <SavedPageDay key={day} day={day} plan={plan} places={savedPlaces} />
        ) : null,
      )}
      {undecided.length > 0 && (
        <section className="mt-7 px-4 md:px-6">
          <h2 className="text-lg font-bold text-primary">미정 {undecided.length}곳</h2>
          <ul className="mt-3 space-y-3">
            {undecided.map((place) => (
              <SavedPageCard key={place.id} place={place} />
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function SavedPageDay({ day, plan, places }: { day: TTripDay; plan: TTripPlan; places: readonly TPlaceEntry[] }) {
  const setTripDayOrder = useAppStore((state) => state.setTripDayOrder);
  const resetTripDayOrder = useAppStore((state) => state.resetTripDayOrder);
  // 내 위치는 이번 화면 동안만 들고 있는다 — 저장하지 않는다(16 P3).
  const [here, setHere] = useState<TGeo | null>(null);
  const [locating, setLocating] = useState(false);

  const start = tripDayStart(plan, places, day);
  const stops = tripDayStops(plan, places, day, here ?? undefined);
  const ids = stops.map((stop) => stop.id);
  const routeStart = here
    ? null
    : start.kind === 'airport'
      ? { name: JEJU_AIRPORT_NAME, geo: JEJU_AIRPORT }
      : start.kind === 'prevStay'
        ? { name: start.place.name, geo: start.place.geo }
        : null;
  const { legs, missing } = splitStops(stops, { start: routeStart });
  const startLabel = here
    ? '내 위치에서 출발'
    : start.kind === 'airport'
      ? `${JEJU_AIRPORT_NAME}에서 출발`
      : start.kind === 'prevStay'
        ? `${start.place.name}에서 출발`
        : '첫 곳에서 출발';

  const locate = async () => {
    setLocating(true);
    const result = await locateMe();
    setLocating(false);
    if (result.kind === 'ok') setHere({ lat: result.lat, lng: result.lng });
    else showAppStatus(LOCATE_NOTICE[result.kind]);
  };

  return (
    <section className="mt-7 px-4 md:px-6">
      <h2 className="text-lg font-bold text-primary">
        {day}일차 · {stops.length}곳
      </h2>
      <p className="mt-1 text-sm text-tertiary">{startLabel}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button color="secondary" size="md" onClick={locate} isLoading={locating}>
          내 위치에서
        </Button>
        {plan.order[day] && (
          <Button color="secondary" size="md" onClick={() => resetTripDayOrder(day)}>
            순서 다시 제안
          </Button>
        )}
      </div>
      <ul className="mt-3 space-y-3">
        {stops.map((place, index) => (
          <SavedPageCard
            key={place.id}
            place={place}
            order={{
              position: index + 1,
              count: stops.length,
              onMove: (delta) => setTripDayOrder(day, movedStop(ids, place.id, delta)),
            }}
          />
        ))}
      </ul>
      {legs.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {legs.map((leg, index) => (
            <NaverLinkButton key={leg.goal.id} href={routeUrl(leg)}>
              {legs.length === 1 ? '이 날 길찾기' : `길찾기 ${index + 1}/${legs.length}`}
            </NaverLinkButton>
          ))}
        </div>
      )}
      {missing.length > 0 && <p className="mt-2 text-sm text-tertiary">지도에 없는 {missing.length}곳은 길찾기에서 빠져요</p>}
    </section>
  );
}
