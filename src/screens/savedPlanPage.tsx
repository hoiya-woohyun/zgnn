'use client';

import {
  closestCenter,
  DndContext,
  DragOverlay,
  getFirstCollision,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { Heart } from '@untitledui/icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '../components/base/button';
import { goBackInApp } from '../components/layout/appShellStack';
import { EmptyState } from '../components/layout/emptyState';
import { PageHeader } from '../components/layout/pageHeader';
import { hasBatchim, withJosa } from '../lib/korean';
import {
  columnOf,
  crossedOnBoard,
  dayOfColumn,
  dropOnBoard,
  isPlanColumn,
  PLAN_COLUMNS,
  planBoardOf,
  type TPlanBoard,
  type TPlanColumn,
} from '../lib/savedPlanPageBoard';
import { SHEET_FOCUS_RETURN_TIMEOUT_MS, sheetFocusReturnStep } from '../lib/sheetFocusReturn';
import { movedStop } from '../lib/tripDayView';
import { useStoreHydrated } from '../providers/storeHydration';
import { useAppStore, useSavedPlaces } from '../store/useAppStore';
import { SavedPlanPageColumn } from './savedPlanPageColumn';
import { SavedPlanPageMoveSheet } from './savedPlanPageMoveSheet';
import { SavedPlanPageRowFace } from './savedPlanPageRow';

const TITLE = '날짜별로 정리';

const columnLabel = (column: TPlanColumn) => {
  const day = dayOfColumn(column);
  return day === null ? '날짜 미정' : `${day}일차`;
};

/** '1일차 2번째예요' · '날짜 미정이에요'. */
const copula = (word: string) => `${word}${hasBatchim(word) ? '이에요' : '예요'}`;

/**
 * 「날짜별로 정리」(`/saved/plan`) — 저장한 곳을 1~4일차·미정 칸에 끌어 넣고 순서를 정하는 화면(16 T1.4 의 임시안을 대신한다).
 *
 * 저장 화면 카드마다 날짜 select 와 ↑↓ 를 달던 동안, 한 곳의 날을 바꾸면 그 카드가 다른 묶음으로 사라져 무엇이 어디 갔는지 따라가기 어려웠고
 * 순서는 한 칸씩만 움직였다. 그래서 정리는 이 화면 하나에서 하고, 저장 화면 「날짜별」 은 결과(판정·출발·길찾기)를 읽는 자리로 남긴다.
 *
 * - 끄는 동안은 화면 초안(`draft`)만 바뀐다. 스토어에는 놓을 때 한 번 쓴다(`dropTripPlace`) — 이유는 `lib/savedPlanPageBoard.ts`.
 * - 놓은 자리가 그 날의 순서다(`withTripDrop`). 제자리에 놓으면 아무것도 쓰지 않는다 — 제안이던 날이 손 순서로 굳지 않게.
 * - 끌기 말고 줄을 누르는 길이 있다(`SavedPlanPageMoveSheet`). 거기서 날만 고르면 자리는 제안이 정한다(`setTripDay`).
 * - 손가락에 붙는 그림(`DragOverlay`, fixed)은 body 로 포털한다 — `<main>` 에 transform 이 걸리는 순간 fixed 의 기준이 `<main>` 이 된다(ADR-014).
 */
export function SavedPlanPage() {
  const hydrated = useStoreHydrated();
  const places = useSavedPlaces();
  const tripDays = useAppStore((state) => state.tripDays);
  const tripOrder = useAppStore((state) => state.tripOrder);
  const dropTripPlace = useAppStore((state) => state.dropTripPlace);
  const setTripDay = useAppStore((state) => state.setTripDay);
  const setTripDayOrder = useAppStore((state) => state.setTripDayOrder);
  const resetTripDayOrder = useAppStore((state) => state.resetTripDayOrder);

  const byId = useMemo(() => new Map(places.map((place) => [place.id, place])), [places]);
  const stored = useMemo(() => planBoardOf({ days: tripDays, order: tripOrder }, places), [tripDays, tripOrder, places]);

  // 초안은 ref 가 정본이고 state 는 그리기용이다 — 마지막 끌기(onDragOver)와 놓기(onDragEnd)가 한 틱에 오면 state 는 아직 옛 값이다.
  const draftRef = useRef<TPlanBoard | null>(null);
  const [draft, setDraft] = useState<TPlanBoard | null>(null);
  const writeDraft = (next: TPlanBoard | null) => {
    draftRef.current = next;
    setDraft(next);
  };
  const board = draft ?? stored;
  const [activeId, setActiveId] = useState<string | null>(null);
  // 시트의 대상과 열림은 따로 — 닫히는 동안(애니메이션)에도 제목·목록이 그대로 남아야 한다. 대상을 비우면 닫히는 판이 먼저 무너진다.
  const [movingId, setMovingId] = useState<string | null>(null);
  const [moveOpen, setMoveOpen] = useState(false);

  const sensors = useSensors(
    // 손잡이에만 리스너가 있다. 4px 은 손잡이를 누르기만 한 것과 끌기 시작을 가른다.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  /*
   * 칸이 여럿인 판의 부딪힘 판정(dnd-kit 의 여러 칸 예제와 같은 뼈대). 손가락이 가리키는 것을 먼저 보고, 칸을 가리켰는데 그 칸에 줄이 있으면
   * 그 안의 가장 가까운 줄로 바꾼다 — 칸을 그대로 주면 늘 칸 끝에 붙는다. 다른 칸으로 막 옮긴 직후에는 자리가 바뀐 판을 다시 재지 않고
   * 직전 대상을 준다: 옮기자마자 판 높이가 바뀌어 대상이 앞뒤 칸을 오가며 떨리는 것을 막는다.
   */
  const lastOverId = useRef<UniqueIdentifier | null>(null);
  const justCrossed = useRef(false);
  const collision: CollisionDetection = useCallback((args) => {
    const current = draftRef.current;
    const hits = pointerWithin(args);
    let overId = getFirstCollision(hits.length > 0 ? hits : rectIntersection(args), 'id');
    if (overId != null && current) {
      const column = isPlanColumn(overId) ? overId : null;
      if (column && current[column].length > 0) {
        const inColumn = args.droppableContainers.filter((container) => current[column].includes(String(container.id)));
        overId = closestCenter({ ...args, droppableContainers: inColumn })[0]?.id ?? overId;
      }
      lastOverId.current = overId;
      return [{ id: overId }];
    }
    // 넘어간 직후 판이 바뀌어 아무것도 안 걸리면 옮긴 줄 자신을 대상으로 둔다 — 직전 대상(떠난 칸의 줄)을 주면 엉뚱한 자리로 밀린다.
    if (justCrossed.current) lastOverId.current = args.active.id;
    return lastOverId.current != null ? [{ id: lastOverId.current }] : [];
  }, []);
  useEffect(() => {
    requestAnimationFrame(() => {
      justCrossed.current = false;
    });
  }, [draft]);

  const onDragStart = ({ active }: DragStartEvent) => {
    setActiveId(String(active.id));
    lastOverId.current = null;
    writeDraft(stored);
  };

  // 다른 칸으로 넘어갈 때만 초안을 바꾼다. 같은 칸 안의 자리는 dnd-kit(sortable)이 그림으로만 옮기고, 놓을 때 정한다.
  const onDragOver = ({ active, over }: DragOverEvent) => {
    const base = draftRef.current;
    if (!over || !base) return;
    const translated = active.rect.current.translated;
    const below = translated ? translated.top > over.rect.top + over.rect.height / 2 : false;
    const next = crossedOnBoard(base, String(active.id), String(over.id), below);
    if (!next) return;
    justCrossed.current = true;
    writeDraft(next);
  };

  const finish = () => {
    writeDraft(null);
    setActiveId(null);
  };

  const nameOf = (id: UniqueIdentifier) => byId.get(String(id))?.name ?? '';
  const spotLabel = (column: TPlanColumn, index: number) => (column === 'undecided' ? columnLabel(column) : `${columnLabel(column)} ${index + 1}번째`);
  /**
   * 끄는 중 그 줄이 설 자리. 다른 칸으로는 초안이 이미 옮겨 놓았지만, 같은 칸 안의 자리는 dnd-kit 이 그림으로만 옮기므로(초안은 그대로)
   * 가리킨 줄의 자리를 읽어야 한다 — 초안만 보면 화살표로 내려가도 "1번째" 라고 말한다.
   */
  const spotOver = (activeId: UniqueIdentifier, overId: UniqueIdentifier) => {
    const current = draftRef.current ?? stored;
    const column = columnOf(current, String(overId));
    if (!column) return '';
    const index = current[column].indexOf(String(isPlanColumn(overId) ? activeId : overId));
    return spotLabel(column, Math.max(0, index));
  };
  // 놓은 자리의 안내는 놓을 때 정해 둔다 — 안내가 읽히는 때엔 초안이 비었고, 이 렌더의 `stored` 는 놓기 전 값이라 옛 자리를 말한다.
  const dropSpot = useRef('');

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const base = draftRef.current;
    const id = String(active.id);
    const drop = base && over ? dropOnBoard(base, stored, id, String(over.id)) : null;
    dropSpot.current = drop ? spotLabel(drop.column, drop.ids.indexOf(id)) : '';
    if (drop?.changed) dropTripPlace(id, dayOfColumn(drop.column), drop.ids);
    finish();
  };

  // 스크린리더 안내(키보드 끌기). 끄는 중엔 자리만 — 화살표마다 이름까지 되풀이하면 길다.
  const announcements: Announcements = {
    onDragStart: ({ active }) => `${withJosa(nameOf(active.id), '을/를')} 집었어요. ${copula(spotOver(active.id, active.id))}.`,
    onDragOver: ({ active, over }) => (over ? `${spotOver(active.id, over.id)}` : '놓을 곳 밖이에요.'),
    onDragEnd: ({ active }) =>
      dropSpot.current ? `${withJosa(nameOf(active.id), '을/를')} ${dropSpot.current}에 놓았어요.` : `${withJosa(nameOf(active.id), '은/는')} 제자리로 돌아갔어요.`,
    onDragCancel: ({ active }) => `옮기기를 그만뒀어요. ${withJosa(nameOf(active.id), '은/는')} 제자리예요.`,
  };

  /*
   * 시트를 닫은 뒤 포커스를 그 줄로(ADR-030). react-aria 는 시트를 연 버튼(누른 줄)으로 돌려보내는데, 다른 날을 골랐으면 그 줄이 다른 칸의
   * 목록으로 다시 마운트돼 기억한 노드가 문서에서 빠지고 포커스가 body 로 떨어진다. 지도 시트와 같은 판단(`lib/sheetFocusReturn`)으로 지켜본다.
   */
  const focusReturnFrame = useRef(0);
  useEffect(() => () => cancelAnimationFrame(focusReturnFrame.current), []);
  const openMove = (id: string) => {
    setMovingId(id);
    setMoveOpen(true);
  };
  const closeMove = () => {
    setMoveOpen(false);
    const id = movingId;
    if (!id) return;
    cancelAnimationFrame(focusReturnFrame.current);
    const until = performance.now() + SHEET_FOCUS_RETURN_TIMEOUT_MS;
    const watch = () => {
      const focused = document.activeElement;
      const step = sheetFocusReturnStep(focused, document.body, Boolean(focused?.closest('[role="dialog"]')));
      if (step === 'return') document.querySelector<HTMLElement>(`[data-plan-row="${id}"]`)?.focus();
      else if (step === 'wait' && performance.now() < until) focusReturnFrame.current = requestAnimationFrame(watch);
    };
    focusReturnFrame.current = requestAnimationFrame(watch);
  };

  if (!hydrated) return <PageHeader title={TITLE} />;

  if (places.length === 0) {
    return (
      <div>
        <PageHeader title={TITLE} />
        <div className="px-4 pt-6 md:px-6">
          <EmptyState
            Icon={Heart}
            title="저장한 곳이 아직 없어요"
            description="하트를 눌러 모은 곳을 여기서 날짜별로 나눠요."
            action={
              <Button color="primary" size="lg" href="/places/stay/">
                장소 둘러보기
              </Button>
            }
          />
        </div>
      </div>
    );
  }

  const active = activeId ? byId.get(activeId) : undefined;
  const moving = movingId ? (byId.get(movingId) ?? null) : null;

  return (
    <div className="pb-6">
      <PageHeader title={TITLE} />
      <DndContext
        sensors={sensors}
        collisionDetection={collision}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={finish}
        accessibility={{
          announcements,
          screenReaderInstructions: { draggable: '스페이스나 엔터로 집고, 화살표로 옮긴 뒤 다시 스페이스나 엔터로 놓아요. 그만두려면 Esc.' },
        }}
      >
        {PLAN_COLUMNS.map((column) => {
          const day = dayOfColumn(column);
          return (
            <SavedPlanPageColumn
              key={column}
              column={column}
              ids={board[column]}
              placeById={byId}
              manual={day !== null && Boolean(tripOrder[day])}
              onReset={() => day !== null && resetTripDayOrder(day)}
              onOpenMove={(place) => openMove(place.id)}
            />
          );
        })}
        {createPortal(<DragOverlay>{active ? <SavedPlanPageRowFace place={active} lifted /> : null}</DragOverlay>, document.body)}
      </DndContext>

      {/* 놓는 순간 저장된다 — 이 버튼은 저장이 아니라 돌아가는 길이다. 저장 버튼을 찾는 사람에게 끝났다는 자리를 준다. */}
      <div className="px-4 pt-8 md:px-6">
        <Button color="primary" size="lg" className="w-full" onClick={() => goBackInApp('/saved')} data-ev="plan-done">
          다 정했어요
        </Button>
      </div>

      <SavedPlanPageMoveSheet
        place={moving}
        isOpen={moveOpen}
        board={board}
        onClose={closeMove}
        onPickColumn={(column) => moving && setTripDay(moving.id, dayOfColumn(column))}
        onStep={(delta) => {
          if (!moving) return;
          const column = columnOf(board, moving.id);
          const day = column ? dayOfColumn(column) : null;
          if (column && day !== null) setTripDayOrder(day, movedStop(board[column], moving.id, delta));
        }}
      />
    </div>
  );
}
