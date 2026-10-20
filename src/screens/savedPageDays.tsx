'use client';

import { NavigationPointer01 } from '@untitledui/icons';
import { Fragment, useState } from 'react';
import { NaverLinkButton } from '../components/naverLinkButton';
import { Button } from '../components/base/button';
import { showAppStatus } from '../lib/appStatus';
import { LOCATE_NOTICE, locateMe } from '../lib/myLocation';
import { routeUrl, splitStops } from '../lib/naverRouteLink';
import type { TPlaceEntry } from '../lib/places';
import { TRIP_DAYS, type TTripDay, type TTripPlan } from '../lib/tripPlan';
import { JEJU_AIRPORT } from '../lib/tripRoute';
import { JEJU_AIRPORT_NAME, tripDayStart, tripDayStops } from '../lib/tripDayView';
import type { TGeo } from '../types';
import { useAppStore } from '../store/useAppStore';
import { SavedPageCard } from './savedPageCard';
import { SavedPageDayAlternatives, SavedPageDayVerdict, useSavedPageDayVerdict } from './savedPageDayVerdict';

/**
 * 저장 화면의 「날짜별」 보기(16 T1.4) — 1~4일차 중 곳이 있는 날마다 한 묶음, 끝에 미정.
 * 하루의 순서·시작점은 `lib/tripDayView.ts` 가 정한다. 길찾기는 순서대로 묶음(`splitStops`)마다 버튼 하나, 하루 머리에.
 * 여기는 **읽는 자리**다 — 날짜·순서를 바꾸는 것은 「날짜별로 정리」(`/saved/plan`, 끌어 놓기)에서만 한다. 남은 동작은 출발점('내 위치에서')뿐이다.
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
  // 내 위치는 이번 화면 동안만 들고 있는다 — 저장하지 않는다(16 P3).
  const [here, setHere] = useState<TGeo | null>(null);
  const [locating, setLocating] = useState(false);

  const start = tripDayStart(plan, places, day);
  const stops = tripDayStops(plan, places, day, here ?? undefined);
  // 묶음 판정(16 T2.3) — 손 순서든 제안이든 화면에 보이는 그 순서로 판정한다.
  const verdict = useSavedPageDayVerdict(stops);
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
      <SavedPageDayVerdict verdict={verdict} />
      <p className="mt-1 text-sm text-tertiary">{startLabel}</p>
      {/* md 버튼은 41px(py-2.5 + 줄 21) — 44px 바닥만 깐다. lg 로 올리면 글자가 16px 이 되어 출발 줄보다 커진다. */}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button color="secondary" size="md" onClick={locate} isLoading={locating} className="min-h-11">
          내 위치에서
        </Button>
      </div>
      {/*
        하루 경로는 **묶음 머리, 출발 줄 바로 밑**이다(22 D-13). 묶음 끝에 두던 동안 마지막 카드의 버튼으로 읽혔고, 출발을 고르는 칸
        ('제주국제공항에서 출발' · '내 위치에서')과 그 출발로 여는 버튼이 카드 목록을 사이에 두고 갈려 있었다.
        여러 묶음이면 번호(1/2)를 단 전폭 버튼을 쌓는다 — 그 묶음이 들르는 곳 수는 버튼 안 조용한 글자로.
        '경유' 수(도착지를 뺀 수)로 적으면 머리의 '2곳' 옆에 '1곳 경유' 가 서서 한 곳이 빠진 줄 안다(22 review R-5) — 도착지까지 센다.
      */}
      {legs.length > 0 && (
        <div className="mt-2 flex flex-col gap-2">
          {legs.map((leg, index) => (
            <NaverLinkButton key={leg.goal.id} href={routeUrl(leg)} size="lg" icon={NavigationPointer01} className="w-full">
              {legs.length === 1 ? '네이버 길찾기' : `네이버 길찾기 ${index + 1}/${legs.length}`}
              {leg.via.length > 0 && <span className="text-sm font-normal text-quaternary">{leg.via.length + 1}곳 순서대로</span>}
            </NaverLinkButton>
          ))}
        </div>
      )}
      {missing.length > 0 && <p className="mt-2 text-sm text-tertiary">지도에 없는 {missing.length}곳은 길찾기에서 빠져요</p>}
      {/* 머리 → 첫 카드는 카드 사이(12px)보다 넓게 — 같으면 머리 끝의 길찾기가 다시 카드 쪽으로 읽힌다(22 review R-2). */}
      <ul className="mt-5 space-y-3">
        {stops.map((place) => (
          <Fragment key={place.id}>
            <SavedPageCard place={place} />
            {verdict?.hardIds.includes(place.id) && <SavedPageDayAlternatives blocked={place} stops={stops} />}
          </Fragment>
        ))}
      </ul>
    </section>
  );
}
