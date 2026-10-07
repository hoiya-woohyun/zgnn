'use client';

import { Edit03 } from '@untitledui/icons';
import { useState } from 'react';
import { NaverLinkButton } from '../components/naverLinkButton';
import { PlaceCard } from '../components/placeCard';
import { SavedNoteForm } from '../components/savedNoteForm';
import { naverDirectionsUrl } from '../lib/naverPlaceLink';
import type { TPlaceEntry } from '../lib/places';
import { useIsSaved, useSavedNote } from '../store/useAppStore';
import { cx } from '../utils/cx';

/**
 * 내 저장 목록의 카드 한 장 — 메모 연필과 길찾기가 붙는다(docs/todo/10 F5).
 *
 * 메모는 **하트 왼쪽 연필**로 연다. 예전엔 카드 밑에 "메모 남기기" 회색 줄이 따로 있어, 적어 둔 메모(카드 안 이름 밑)와
 * 고치는 곳(카드 밖 밑)이 갈렸다. 지금은 연필을 누르면 메모가 보이던 그 자리가 입력 칸이 되고(`PlaceCard` 의 `noteEditor`),
 * 그동안 카드는 링크가 아니다. 기기 안에만 저장되고 공유에는 싣지 않는다.
 */
export function SavedPageCard({ place }: { place: TPlaceEntry }) {
  const saved = useIsSaved(place.id);
  const note = useSavedNote(place.id);
  const [editing, setEditing] = useState(false);
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
            onClick={() => setEditing((open) => !open)}
            className={cx(
              'grid size-11 place-items-center rounded-full transition-colors',
              note || editing ? 'text-camellia' : 'text-quaternary hover:text-tertiary',
            )}
          >
            <Edit03 size={20} aria-hidden="true" />
          </button>
        )
      }
      noteEditor={saved && editing ? <SavedNoteForm id={place.id} name={place.name} onClose={() => setEditing(false)} /> : undefined}
      footer={
        directions && (
          <div className="mt-1 flex justify-end">
            <NaverLinkButton href={directions} className="shrink-0">
              길찾기
            </NaverLinkButton>
          </div>
        )
      }
    />
  );
}
