'use client';

import { ArrowDown, ArrowUp, Check } from '@untitledui/icons';
import { useEffect, useRef } from 'react';
import { ListBox as AriaListBox, ListBoxItem as AriaListBoxItem } from 'react-aria-components';
import { Button } from '../components/base/button';
import { BottomSheet } from '../components/base/bottom-sheet';
import type { TPlaceEntry } from '../lib/places';
import { columnOf, dayOfColumn, isPlanColumn, PLAN_COLUMNS, type TPlanBoard, type TPlanColumn } from '../lib/savedPlanPageBoard';
import { cx } from '../utils/cx';

type TSavedPlanPageMoveSheetProps = {
  /** 옮길 곳. 닫혀도(닫히는 애니메이션 동안) 비우지 않는다 — 열림은 `isOpen` 이 따로 말한다. */
  place: TPlaceEntry | null;
  isOpen: boolean;
  board: TPlanBoard;
  onClose: () => void;
  /** 날만 고른다 — 자리는 정하지 않으므로 그 날이 제안이면 제안이, 손 순서면 그 끝이 자리다(`setTripDay`). */
  onPickColumn: (column: TPlanColumn) => void;
  /** 그 날 안에서 한 칸 앞·뒤로(손 순서가 된다). */
  onStep: (delta: -1 | 1) => void;
};

/**
 * 줄을 눌렀을 때의 시트 — 끌지 않고 옮기는 길(WCAG 2.5.7). 날을 고르면 닫히고, 순서 한 칸은 여러 번 누를 수 있게 열어 둔다.
 * 날 목록은 정렬 시트(`PlacesPageSortSheet`)와 같은 짝이다: 화살표는 포커스만, Enter·탭이 고른다. 각 줄 끝의 'N곳' 은 그 날의 곳 수 — 칸 머리와 같은 수다(지금 날이면 자기도 센다).
 */
export function SavedPlanPageMoveSheet({ place, isOpen, board, onClose, onPickColumn, onStep }: TSavedPlanPageMoveSheetProps) {
  const current = place ? columnOf(board, place.id) : null;
  const ids = current ? board[current] : [];
  const position = place ? ids.indexOf(place.id) : -1;
  const canStep = current !== null && current !== 'undecided' && ids.length > 1;
  const stepsRef = useRef<HTMLDivElement>(null);
  /*
   * 끝에 닿으면 누른 버튼이 비활성이 되며 포커스를 놓친다(body 로) — 끝에 닿았으면 다시 그린 뒤 반대쪽 버튼으로 옮긴다.
   * 누르는 순간엔 못 옮긴다: 두 칸이면 반대쪽이 그때는 아직 비활성이다.
   */
  const refocus = useRef<'earlier' | 'later' | null>(null);
  const step = (delta: -1 | 1) => {
    const next = position + delta;
    refocus.current = next <= 0 ? 'later' : next >= ids.length - 1 ? 'earlier' : null;
    onStep(delta);
  };
  useEffect(() => {
    if (!refocus.current) return;
    stepsRef.current?.querySelector<HTMLElement>(`[data-step="${refocus.current}"]`)?.focus();
    refocus.current = null;
  }, [position]);
  return (
    <BottomSheet isOpen={isOpen} onOpenChange={(open) => !open && onClose()} label="날짜 고르기" title={place?.name}>
      {/* 장소마다 새로 그린다 — 시트는 열린 채 대상만 바뀌므로, 그대로 두면 직전 장소에서 포커스했던 줄(react-aria 의 focusedKey)이 남는다. */}
      <AriaListBox
        key={place?.id}
        aria-label="날짜"
        selectionMode="single"
        selectedKeys={current ? [current] : []}
        onSelectionChange={(keys) => {
          const next = keys !== 'all' && keys.size > 0 ? String([...keys][0]) : null;
          onClose();
          if (isPlanColumn(next) && next !== current) onPickColumn(next);
        }}
        autoFocus
        className="-mx-2 mt-2 outline-hidden"
      >
        {PLAN_COLUMNS.map((column) => {
          const day = dayOfColumn(column);
          const label = day === null ? '날짜 미정' : `${day}일차`;
          const count = board[column].length;
          return (
            <AriaListBoxItem
              key={column}
              id={column}
              textValue={label}
              className={({ isSelected, isFocusVisible, isPressed }) =>
                cx(
                  'flex h-13 cursor-pointer items-center gap-3 rounded-lg px-2 text-md outline-hidden select-none',
                  // 시트 면이 크림이라 눌림은 한 단 진한 tertiary(primary_hover 는 크림과 같다).
                  isSelected ? 'font-semibold text-primary' : 'text-secondary hover:bg-tertiary',
                  isPressed && 'bg-tertiary',
                  isFocusVisible && 'ring-2 ring-focus-ring ring-inset',
                )
              }
            >
              {({ isSelected }) => (
                <>
                  <span className="min-w-0 flex-1 truncate">{label}</span>
                  {count > 0 && <span className="shrink-0 text-sm font-normal text-tertiary">{count}곳</span>}
                  <Check aria-hidden="true" className={cx('size-5 shrink-0 text-fg-brand-primary', !isSelected && 'invisible')} />
                </>
              )}
            </AriaListBoxItem>
          );
        })}
      </AriaListBox>
      {canStep && (
        <div className="mt-3 border-t border-secondary pt-4 pb-1">
          <p className="text-sm text-tertiary" aria-live="polite">
            {dayOfColumn(current)}일차 {ids.length}곳 중 {position + 1}번째
          </p>
          <div ref={stepsRef} className="mt-2 flex gap-2">
            <Button color="secondary" size="lg" iconLeading={ArrowUp} isDisabled={position <= 0} onClick={() => step(-1)} className="flex-1" data-step="earlier">
              앞으로
            </Button>
            <Button color="secondary" size="lg" iconLeading={ArrowDown} isDisabled={position >= ids.length - 1} onClick={() => step(1)} className="flex-1" data-step="later">
              뒤로
            </Button>
          </div>
        </div>
      )}
    </BottomSheet>
  );
}
