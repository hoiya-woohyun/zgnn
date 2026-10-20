'use client';

import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { TPlaceEntry } from '../lib/places';
import { dayOfColumn, type TPlanColumn } from '../lib/savedPlanPageBoard';
import { cx } from '../utils/cx';
import { SavedPlanPageRow } from './savedPlanPageRow';

type TSavedPlanPageColumnProps = {
  column: TPlanColumn;
  /**
   * 이 칸에 보이는 순서 그대로 — **판의 배열 그 자체**를 받는다(새로 만든 배열 금지). `SortableContext` 는 끄는 중 `items` 가 바뀌면
   * 레이아웃 효과에서 칸을 다시 재고(setState) 그 효과의 의존성이 `items` 참조다 — 렌더마다 새 배열이면 재기 → 렌더 → 새 배열 → 재기가
   * 끝없이 돌아 "Maximum update depth exceeded" 로 화면이 내려간다(칸을 넘는 순간). 판은 옮긴 칸만 새 배열이라 나머지 참조가 그대로다.
   */
  ids: string[];
  placeById: ReadonlyMap<string, TPlaceEntry>;
  /** 그 날이 손 순서인가 — 아니면 제안(가까운 순)이다. 미정은 순서가 없어 늘 false. */
  manual: boolean;
  onReset: () => void;
  onOpenMove: (place: TPlaceEntry) => void;
};

/**
 * 한 날(또는 미정)의 칸. **빈 날도 늘 그린다** — 놓을 자리가 보여야 끌 수 있다(저장 화면 「날짜별」 은 곳이 있는 날만 그린다).
 * 칸 자체도 놓을 곳이다(`useDroppable`) — 줄이 하나도 없는 칸에는 줄 위에 놓을 수가 없어서.
 */
export function SavedPlanPageColumn({ column, ids, placeById, manual, onReset, onOpenMove }: TSavedPlanPageColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: column });
  const places = ids.map((id) => placeById.get(id)).filter((place): place is TPlaceEntry => place !== undefined);
  const day = dayOfColumn(column);
  const headingId = `saved-plan-${column}`;
  return (
    <section aria-labelledby={headingId} className="mt-6 px-4 md:px-6">
      <div className="flex min-h-11 items-center gap-3">
        <h2 id={headingId} className="min-w-0 flex-1 text-lg font-bold text-primary">
          {day === null ? '날짜 미정' : `${day}일차`}
          <span className="ml-1.5 text-md font-normal text-tertiary">{places.length}곳</span>
        </h2>
        {manual && (
          <button
            type="button"
            onClick={onReset}
            data-ev="plan-reset"
            className="-mr-2 h-11 shrink-0 rounded-lg px-2 text-sm font-semibold text-tertiary outline-hidden transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            가까운 순으로
          </button>
        )}
      </div>
      {/* 순서가 왜 이런지 — 손대기 전엔 제안이고, 끌어 놓은 날부터 손 순서다(16 P2). 한 곳뿐이면 순서가 없다. */}
      {day !== null && places.length > 1 && (
        <p className="text-sm text-tertiary">{manual ? '직접 정한 순서예요' : '가까운 순서로 놓았어요'}</p>
      )}
      <SortableContext id={column} items={ids} strategy={verticalListSortingStrategy}>
        <ul
          ref={setNodeRef}
          className={cx(
            'mt-2 flex flex-col gap-2 rounded-2xl transition-colors',
            places.length === 0 && 'border border-dashed',
            places.length === 0 && (isOver ? 'border-brand bg-brand-primary' : 'border-primary'),
          )}
        >
          {places.map((place) => (
            <SavedPlanPageRow key={place.id} place={place} onOpenMove={() => onOpenMove(place)} />
          ))}
          {places.length === 0 && (
            <li aria-hidden="true" className="grid h-15 place-items-center text-sm text-tertiary">
              여기로 끌어 놓기
            </li>
          )}
        </ul>
      </SortableContext>
    </section>
  );
}
