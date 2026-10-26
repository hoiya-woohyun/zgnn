'use client';

import { Edit03 } from '@untitledui/icons';
import { useState } from 'react';
import { NaverLinkButton } from '../components/naverLinkButton';
import { PlaceCard } from '../components/placeCard';
import { SavedNoteForm } from '../components/savedNoteForm';
import { useReplay } from '../hooks/useReplay';
import { naverDirectionsUrl } from '../lib/naverPlaceLink';
import type { TPlaceEntry } from '../lib/places';
import { useIsSaved, useSavedNote } from '../store/useAppStore';
import { cx } from '../utils/cx';

/**
 * 내 저장 목록의 카드 한 장 — 메모 연필과 길찾기가 붙는다(docs/todo/10 F5).
 *
 * 메모는 **하트 왼쪽 연필**로 연다. 예전엔 카드 밑에 "메모 남기기" 회색 줄이 따로 있어, 적어 둔 메모(카드 안 이름 밑)와
 * 고치는 곳(카드 밖 밑)이 갈렸다. 지금은 연필을 누르면 메모가 보이던 그 자리가 입력 칸이 되고(`PlaceCard` 의 `noteEditor`),
 * 그동안 카드는 링크가 아니다. 기기 안에만 저장되고 공유에는 싣지 않는다. 길찾기 S 버튼은 카드 안 오른쪽 아래(`cornerAction`).
 *
 * 날짜·순서는 카드에서 고르지 않는다 — 카드마다 날짜 select 와 ↑↓ 를 달던 임시안(16 T1.4)은 「날짜별로 정리」(`/saved/plan`) 한 화면으로 옮겼다.
 */
export function SavedPageCard({ place }: { place: TPlaceEntry }) {
  const saved = useIsSaved(place.id);
  const note = useSavedNote(place.id);
  const [editing, setEditing] = useState(false);
  // 열 때만 연필이 끄적인다(`styles/microMotion.css`). 닫을 때는 입력 칸이 사라지는 것으로 충분하다.
  const [scribble, replayScribble] = useReplay();
  // 저장한 곳은 "갈 곳" 이다 — 카드마다 길찾기(현재 위치 → 여기)를 바로 준다. 좌표 없는 곳(5곳)은 버튼 대신 이유 한 줄.
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
      cornerAction={
        directions ? (
          // 작은 중립 테두리(S) — 카드마다 반복되는 버튼이 판정 배지보다 세면 안 된다(22 D-12). 저장한 곳은 당일 쓰는 목록이라 카드에 남긴다.
          // 아이콘은 뺐다 — 18px 가 늘면 배지 줄 자리(`PlaceCard` 의 `pr-25`)가 줄어 390 에서 카드 다섯 중 셋의 배지가 두 줄로 꺾였다.
          <NaverLinkButton href={directions} size="sm">
            네이버 길찾기
          </NaverLinkButton>
        ) : (
          // 좌표 없는 곳(5곳)도 같은 자리를 채워 카드 모양을 맞춘다 — 버튼이 없으면 이유가 없어 빠진 것인지 알 수 없다(14 W261010.20).
          <span className="inline-flex h-8 items-center text-sm text-tertiary">지도 좌표가 없어요</span>
        )
      }
    />
  );
}
