'use client';

import { Edit03 } from '@untitledui/icons';
import { useState } from 'react';
import { PlaceCard } from '../components/placeCard';
import { SavedNoteForm } from '../components/savedNoteForm';
import { useReplay } from '../hooks/useReplay';
import type { TPlaceEntry } from '../lib/places';
import { useIsSaved, useSavedNote } from '../store/useAppStore';
import { cx } from '../utils/cx';

/**
 * 내 저장 목록의 카드 한 장 — 메모 연필이 붙는다(docs/todo/10 F5).
 *
 * 메모는 **하트 왼쪽 연필**로 연다. 예전엔 카드 밑에 "메모 남기기" 회색 줄이 따로 있어, 적어 둔 메모(카드 안 이름 밑)와
 * 고치는 곳(카드 밖 밑)이 갈렸다. 지금은 연필을 누르면 메모가 보이던 그 자리가 입력 칸이 되고(`PlaceCard` 의 `noteEditor`),
 * 그동안 카드는 링크가 아니다. 기기 안에만 저장되고 공유에는 싣지 않는다.
 *
 * 행마다 달던 '네이버 길찾기' 버튼은 뺐다(22 R27.1 D-9) — 4행에 같은 버튼 4개가 판정보다 눈에 띄었다. 길찾기는 위 '지도에서 보기'(저장 지도)와
 * 상세 액션 줄이, 날짜별에서는 하루 머리의 경로 버튼이 받는다. `typeMark` 는 종류가 섞이는 날짜별에서만(D-10).
 *
 * 날짜·순서는 카드에서 고르지 않는다 — 카드마다 날짜 select 와 ↑↓ 를 달던 임시안(16 T1.4)은 「날짜별로 정리」(`/saved/plan`) 한 화면으로 옮겼다.
 */
export function SavedPageCard({ place, typeMark = false }: { place: TPlaceEntry; typeMark?: boolean }) {
  const saved = useIsSaved(place.id);
  const note = useSavedNote(place.id);
  const [editing, setEditing] = useState(false);
  // 열 때만 연필이 끄적인다(`styles/microMotion.css`). 닫을 때는 입력 칸이 사라지는 것으로 충분하다.
  const [scribble, replayScribble] = useReplay();

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
      typeMark={typeMark}
    />
  );
}
