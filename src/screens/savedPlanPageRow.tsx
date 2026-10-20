'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { DotsGrid } from '@untitledui/icons';
import type { ComponentPropsWithoutRef, Ref } from 'react';
import { CARD_SURFACE } from '../components/cardSurface';
import { PlaceThumb } from '../components/placeThumb';
import { TYPE_META, type TPlaceEntry } from '../lib/places';
import { cx } from '../utils/cx';

/**
 * 「날짜별로 정리」 의 줄 한 칸 — 저장 카드(`SavedPageCard`)를 줄인 것이 아니라 **옮기기 전용**이다.
 *
 * 카드 그대로(배지·메모·길찾기, 한 장 ~150px)면 열 곳만 돼도 1일차에서 4일차까지 화면 서너 장을 끌고 내려가야 한다 — 그래서 이름·읍면·종류만 남겨
 * 한 줄 ~64px 로 줄였다. 끄는 것은 **오른쪽 손잡이**뿐이다: 줄 전체를 끌게 하면 목록을 스크롤하려던 손가락이 줄을 집는다. 손잡이에만
 * `touch-action: none` 을 줘 누르자마자 끌린다(길게 누르기 없음). 본문 왼쪽 0~48px 는 셸의 뒤로 끌기 띠라 손잡이를 거기 두지 않는다(ADR-025).
 *
 * 줄의 나머지(이름 쪽)를 누르면 날을 고르는 시트가 열린다 — 끌기를 못 쓰는 사람의 길(WCAG 2.5.7)이자, 4일차 곳을 1일차로 보낼 때 끄는 것보다 빠른 길.
 */

type TSavedPlanPageRowFaceProps = {
  place: TPlaceEntry;
  /** 이름 쪽을 누르면 — 날 고르는 시트. 끄는 그림(`DragOverlay`)에는 없다. */
  onOpenMove?: () => void;
  /** 손잡이에 붙는 dnd-kit 의 리스너·속성. */
  handleProps?: ComponentPropsWithoutRef<'button'>;
  handleRef?: Ref<HTMLButtonElement>;
  /** 손가락에 붙어 다니는 그림 — 떠 있게 그린다. */
  lifted?: boolean;
};

/** 줄의 생김새 — 목록 안의 줄(`SavedPlanPageRow`)과 손가락에 붙은 그림이 같은 모양이어야 해서 따로 둔다. */
export function SavedPlanPageRowFace({ place, onOpenMove, handleProps, handleRef, lifted = false }: TSavedPlanPageRowFaceProps) {
  const label = (
    <>
      <PlaceThumb src={place.cover ?? place.images[0]} type={place.type} variant="compact" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-md font-bold text-primary">{place.name}</span>
        <span className="block truncate text-sm text-tertiary">
          {place.region.town} · {TYPE_META[place.type].label}
        </span>
      </span>
    </>
  );
  return (
    <div className={cx(CARD_SURFACE, 'flex items-center gap-1 py-2 pr-1 pl-3', lifted && 'shadow-lg')}>
      {onOpenMove ? (
        <button
          type="button"
          onClick={onOpenMove}
          aria-haspopup="dialog"
          aria-label={`${place.name} 날짜 고르기`}
          data-ev="plan-row"
          // 시트를 닫은 뒤 포커스를 돌려보낼 자리(`SavedPlanPage` 의 closeMove) — 다른 칸으로 옮겨 다시 마운트된 줄을 id 로 찾는다.
          data-plan-row={place.id}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-lg text-left outline-hidden focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          {label}
        </button>
      ) : (
        <span className="flex min-h-11 min-w-0 flex-1 items-center gap-3">{label}</span>
      )}
      <button
        ref={handleRef}
        type="button"
        aria-label={`${place.name} 끌어서 옮기기`}
        data-ev="plan-handle"
        {...handleProps}
        className={cx(
          'grid size-11 shrink-0 touch-none place-items-center rounded-full text-quaternary outline-hidden transition-colors',
          'focus-visible:ring-2 focus-visible:ring-focus-ring hover:text-tertiary',
          lifted ? 'cursor-grabbing text-tertiary' : 'cursor-grab',
        )}
      >
        <DotsGrid size={20} aria-hidden="true" />
      </button>
    </div>
  );
}

/** 목록 안의 줄 — 끄는 동안 제자리는 흐린 자리표시로 남고, 손가락에는 `SavedPlanPageRowFace` 의 떠 있는 그림이 붙는다. */
export function SavedPlanPageRow({ place, onOpenMove }: { place: TPlaceEntry; onOpenMove: () => void }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: place.id,
    // 기본값 'sortable' 은 영어로 읽힌다. 버튼 이름이 '○○ 끌어서 옮기기' 라 역할은 짧게.
    attributes: { roleDescription: '끌기 손잡이' },
  });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cx(isDragging && 'opacity-40')}
    >
      <SavedPlanPageRowFace place={place} onOpenMove={onOpenMove} handleRef={setActivatorNodeRef} handleProps={{ ...attributes, ...listeners }} />
    </li>
  );
}
