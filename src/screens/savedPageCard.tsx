'use client';

import { ArrowDown, ArrowUp, Edit03 } from '@untitledui/icons';
import { useState } from 'react';
import { NaverLinkButton } from '../components/naverLinkButton';
import { PlaceCard } from '../components/placeCard';
import { SavedNoteForm } from '../components/savedNoteForm';
import { useReplay } from '../hooks/useReplay';
import { naverDirectionsUrl } from '../lib/naverPlaceLink';
import type { TPlaceEntry } from '../lib/places';
import { isTripDay, TRIP_DAYS } from '../lib/tripPlan';
import { useAppStore, useIsSaved, useSavedNote } from '../store/useAppStore';
import { cx } from '../utils/cx';

/**
 * 내 저장 목록의 카드 한 장 — 메모 연필과 길찾기가 붙는다(docs/todo/10 F5).
 *
 * 메모는 **하트 왼쪽 연필**로 연다. 예전엔 카드 밑에 "메모 남기기" 회색 줄이 따로 있어, 적어 둔 메모(카드 안 이름 밑)와
 * 고치는 곳(카드 밖 밑)이 갈렸다. 지금은 연필을 누르면 메모가 보이던 그 자리가 입력 칸이 되고(`PlaceCard` 의 `noteEditor`),
 * 그동안 카드는 링크가 아니다. 기기 안에만 저장되고 공유에는 싣지 않는다. 길찾기 알약은 카드 안 오른쪽 아래(`cornerAction`).
 */
type TSavedPageCardOrder = {
  /** 1부터 세는 하루 안의 번호. */
  position: number;
  count: number;
  onMove: (delta: -1 | 1) => void;
};

const PILL = 'h-11 rounded-full bg-secondary px-3 text-sm font-bold text-secondary';
const MOVE_BUTTON = 'grid size-11 place-items-center rounded-full text-tertiary transition-colors hover:text-primary disabled:text-quaternary';

/** 날짜 라벨 고르기(16 T1.4 임시안) — 네이티브 select 를 알약으로. `order` 가 있으면(날짜별 보기) 번호와 ↑ ↓ 가 붙는다. */
function SavedPageCardDayFooter({ place, order }: { place: TPlaceEntry; order?: TSavedPageCardOrder }) {
  const day = useAppStore((state) => state.tripDays[place.id]);
  const setTripDay = useAppStore((state) => state.setTripDay);
  return (
    <div className="mt-1 flex items-center gap-1 px-1">
      {order && <span className="min-w-6 text-center text-sm font-bold text-brand-secondary">{order.position}</span>}
      <select
        aria-label={`${place.name} 날짜`}
        value={day ?? ''}
        onChange={(event) => {
          const next = Number(event.target.value);
          setTripDay(place.id, isTripDay(next) ? next : null);
        }}
        className={PILL}
      >
        <option value="">미정</option>
        {TRIP_DAYS.map((value) => (
          <option key={value} value={value}>
            {value}일차
          </option>
        ))}
      </select>
      {order && (
        <span className="ml-auto flex">
          <button type="button" aria-label={`${place.name} 위로`} disabled={order.position <= 1} onClick={() => order.onMove(-1)} className={MOVE_BUTTON}>
            <ArrowUp size={20} aria-hidden="true" />
          </button>
          <button type="button" aria-label={`${place.name} 아래로`} disabled={order.position >= order.count} onClick={() => order.onMove(1)} className={MOVE_BUTTON}>
            <ArrowDown size={20} aria-hidden="true" />
          </button>
        </span>
      )}
    </div>
  );
}

export function SavedPageCard({ place, order }: { place: TPlaceEntry; order?: TSavedPageCardOrder }) {
  const saved = useIsSaved(place.id);
  const note = useSavedNote(place.id);
  const [editing, setEditing] = useState(false);
  // 열 때만 연필이 끄적인다(`styles/microMotion.css`). 닫을 때는 입력 칸이 사라지는 것으로 충분하다.
  const [scribble, replayScribble] = useReplay();
  // 저장한 곳은 "갈 곳" 이다 — 카드마다 길찾기(현재 위치 → 여기)를 바로 준다. 좌표 없는 곳(5곳)은 알약이 없다.
  const directions = naverDirectionsUrl(place);

  return (
    <PlaceCard
      place={place}
      // 하트를 끈 카드는 이번 방문 동안 자리에 남는다(savedPageSession) — 저장 없는 곳엔 메모를 못 다니 연필도 입력도 감춘다.
      actions={
        saved && (
          <button
            type="button"
            aria-label={note ? `${place.name} 메모 고치기: ${note}` : `${place.name}에 메모 남기기`}
            aria-expanded={editing}
            onClick={() => {
              if (!editing) replayScribble();
              setEditing(!editing);
            }}
            className={cx(
              'grid size-11 place-items-center rounded-full transition-colors',
              note || editing ? 'text-camellia' : 'text-quaternary hover:text-tertiary',
            )}
          >
            <Edit03 key={scribble} size={20} aria-hidden="true" className={cx(scribble > 0 && 'motion-scribble')} />
          </button>
        )
      }
      noteEditor={saved && editing ? <SavedNoteForm id={place.id} name={place.name} onClose={() => setEditing(false)} /> : undefined}
      // 카드 밖 밑에 따로 서면 카드 사이 간격이 들쭉날쭉하고 어느 카드의 것인지 흐려졌다 — 배지 줄 끝, 카드 안에 둔다.
      footer={saved && <SavedPageCardDayFooter place={place} order={order} />}
      cornerAction={directions && <NaverLinkButton href={directions}>길찾기</NaverLinkButton>}
    />
  );
}
