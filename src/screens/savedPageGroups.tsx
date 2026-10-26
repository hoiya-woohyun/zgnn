'use client';

import { PlaceCard } from '../components/placeCard';
import { PLACE_TYPES, TYPE_META, type TPlaceEntry } from '../lib/places';
import { useAppStore } from '../store/useAppStore';
import { SavedPageCard } from './savedPageCard';

type TSavedPageGroupsProps = {
  places: readonly TPlaceEntry[];
  /** 내 목록에서만 메모 칸을 단다. 공유받은 목록은 남의 메모가 실리지 않고(10 F5), 아직 내 저장도 아니다. */
  withNotes: boolean;
};

/** 저장 화면의 종류별 묶음 — 내 목록과 공유받은 목록(07 P1)이 같은 모양으로 그린다. */
export function SavedPageGroups({ places, withNotes }: TSavedPageGroupsProps) {
  const savedIds = useAppStore((state) => state.savedIds);
  return PLACE_TYPES.map((type) => {
    const group = places.filter((place) => place.type === type);
    if (group.length === 0) return null;
    // 내 목록은 이번 방문에 하트를 끈 카드도 그리므로(savedPageListed) 제목의 수는 켜진 것만 센다. 공유받은 목록은 받은 그대로.
    const count = withNotes ? group.filter((place) => savedIds.includes(place.id)).length : group.length;
    return (
      <section key={type} className="mt-7 px-4 md:px-6">
        {/* 머리는 글자만 — 종류 색 상자를 걷었다(22 G3.1 · design-audit B-5). 묶음이 종류별이라 '숙소 3곳' 글자가 이미 종류를 말한다. */}
        <h2 className="text-md font-bold text-primary">
          {TYPE_META[type].label} {count}곳
        </h2>
        <ul className="mt-1 divide-y divide-secondary">
          {group.map((place) => (withNotes ? <SavedPageCard key={place.id} place={place} /> : <PlaceCard key={place.id} place={place} />))}
        </ul>
      </section>
    );
  });
}
