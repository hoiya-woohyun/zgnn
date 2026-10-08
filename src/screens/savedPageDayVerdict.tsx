'use client';

import Link from 'next/link';
import { distanceLabel } from '../lib/distanceSort';
import type { TPlaceEntry } from '../lib/places';
import { tripAlternatives } from '../lib/tripAlternatives';
import { tripDayVerdict, type TTripDayVerdict } from '../lib/tripDayVerdict';
import { useAppStore, useDog } from '../store/useAppStore';

/**
 * 「날짜별」 하루의 묶음 판정(16 T2.3, 임시안) — 머리 한 줄 + 어려운 곳 카드 밑 "대신 △△".
 *
 * 판정 입력은 카드 배지와 같다(프로필 · `needsIndoor`) — 머리·카드·대안이 서로 다른 강아지를 보면 "대신" 이 또 걸린다.
 * 대안은 **어려운 곳에만** 붙인다. '확인이 필요해요' 는 가서 물어보면 되는 곳이고, '정보가 없어요' 는 몇 마리를 데려가든 같은
 * 정책 공백이라 바꿔 끼울 이유가 판정에서 나오지 않는다(`subset` 이 어려운 곳만 푸는 것과 같은 선).
 * 강아지가 없으면 아무것도 그리지 않는다 — 카드에도 판정이 없다.
 */
export function useSavedPageDayVerdict(stops: readonly TPlaceEntry[]): TTripDayVerdict | null {
  const dog = useDog();
  const needsIndoor = useAppStore((state) => state.needsIndoor);
  // 메모하지 않는다 — `stops` 는 매 렌더 새로 만들어지는 배열이고(`tripDayStops`), 하루 몇 곳 × 조합 여섯이라 싸다.
  return dog ? tripDayVerdict(dog, stops, { needsIndoor }) : null;
}

export function SavedPageDayVerdict({ verdict }: { verdict: TTripDayVerdict | null }) {
  if (!verdict) return null;
  return (
    <div className="mt-2">
      <p className="text-sm font-bold text-primary">{verdict.headline}</p>
      {verdict.subsetLine && <p className="mt-0.5 text-sm text-secondary">{verdict.subsetLine}</p>}
    </div>
  );
}

/** 어려운 곳 카드 바로 밑 한 줄. 같은 종류·같은 읍면의 "갈 수 있어요" 를 가까운 순으로(`tripAlternatives`). 없으면 그리지 않는다. */
export function SavedPageDayAlternatives({ blocked, stops }: { blocked: TPlaceEntry; stops: readonly TPlaceEntry[] }) {
  const dog = useDog();
  const needsIndoor = useAppStore((state) => state.needsIndoor);
  const alternatives = dog
    ? tripAlternatives(blocked, dog, { needsIndoor, excludeIds: new Set(stops.map((stop) => stop.id)) })
    : [];
  if (alternatives.length === 0) return null;
  return (
    <li className="flex flex-wrap items-center gap-1.5 px-1">
      <span className="text-sm font-bold text-secondary">대신</span>
      {alternatives.map(({ place, km }) => (
        <Link
          key={place.id}
          href={`/place/${place.id}`}
          className="flex h-11 items-center gap-1 rounded-full bg-primary px-3 text-sm font-bold text-primary shadow-xs transition-colors hover:bg-tertiary"
        >
          {place.name}
          <span className="font-semibold text-tertiary">{distanceLabel(km)}</span>
        </Link>
      ))}
    </li>
  );
}
