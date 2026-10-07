'use client';

import { PlaceCard } from '../components/placeCard';
import { PLACE_TYPE_ICON } from '../components/icons/placeTypeIcon';
import { PLACE_TYPES, TYPE_COLOR, TYPE_META, typeTint, type TPlaceEntry } from '../lib/places';
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
    const Icon = PLACE_TYPE_ICON[type];
    return (
      <section key={type} className="mt-7 px-4 md:px-6">
        {/* 그룹 제목은 Section 컴포넌트를 못 쓴다 — title 이 문자열만 받아
            아이콘을 함께 넣을 수 없어서 같은 스타일을 여기서 직접 맞췄다. */}
        <h2 className="flex items-center gap-2 text-lg font-bold text-primary">
          <span
            aria-hidden="true"
            className="grid size-7 shrink-0 place-items-center rounded-lg"
            style={{ background: typeTint(type, 14), color: TYPE_COLOR[type] }}
          >
            <Icon size={16} />
          </span>
          {TYPE_META[type].label} {count}곳
        </h2>
        <ul className="mt-3 space-y-3">
          {group.map((place) => (withNotes ? <SavedPageCard key={place.id} place={place} /> : <PlaceCard key={place.id} place={place} />))}
        </ul>
      </section>
    );
  });
}
