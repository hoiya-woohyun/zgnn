/**
 * 「날짜별로 정리」(`/saved/plan`, `screens/savedPlanPage.tsx`)의 판 — 칸 다섯(1~4일차 + 미정)과 칸마다 보이는 순서. 순수.
 *
 * 끄는 동안에는 이 판(화면 초안)만 바꾸고, 스토어에는 **놓을 때 한 번** 쓴다(`dropTripPlace`). 제안 순서는 시작점(앞 날의 마지막 숙소)에
 * 묶여 있어서, 끄는 중에 스토어를 바꾸면 손가락 밑의 다른 날 목록이 다시 정렬된다 — 숙소 하나를 1일차로 끌어 지나가는 것만으로 2일차가 뒤섞인다.
 */

import type { TPlaceEntry } from './places';
import { tripDayStops } from './tripDayView';
import { TRIP_DAYS, type TTripDay, type TTripPlan } from './tripPlan';

/** 칸 이름. 장소 id(UUID)와 겹치지 않는다 — 빈 칸에 놓으면 dnd-kit 이 칸 자체를 `over` 로 주므로 둘이 한 이름 공간에 있다. */
export type TPlanColumn = 'day-1' | 'day-2' | 'day-3' | 'day-4' | 'undecided';
export type TPlanBoard = Record<TPlanColumn, string[]>;

export const PLAN_COLUMNS: readonly TPlanColumn[] = ['day-1', 'day-2', 'day-3', 'day-4', 'undecided'];

export const isPlanColumn = (value: unknown): value is TPlanColumn => PLAN_COLUMNS.includes(value as TPlanColumn);

export const columnOfDay = (day: TTripDay | null): TPlanColumn => (day === null ? 'undecided' : `day-${day}`);

export const dayOfColumn = (column: TPlanColumn): TTripDay | null =>
  column === 'undecided' ? null : (Number(column.slice('day-'.length)) as TTripDay);

/** 스토어 값으로 판을 차린다 — 날마다 저장 화면 「날짜별」 과 같은 순서(손 순서, 없으면 제안), 미정은 저장 순서. */
export function planBoardOf(plan: TTripPlan, places: readonly TPlaceEntry[]): TPlanBoard {
  const board: TPlanBoard = {
    'day-1': [],
    'day-2': [],
    'day-3': [],
    'day-4': [],
    undecided: places.filter((place) => !(place.id in plan.days)).map((place) => place.id),
  };
  for (const day of TRIP_DAYS) board[columnOfDay(day)] = tripDayStops(plan, places, day).map((place) => place.id);
  return board;
}

/** 그 id 가 든 칸 — 칸 이름이면 그 칸 자신. 없으면 `null`. */
export function columnOf(board: TPlanBoard, id: string): TPlanColumn | null {
  if (isPlanColumn(id)) return id;
  return PLAN_COLUMNS.find((column) => board[column].includes(id)) ?? null;
}

/** 한 곳을 `to` 칸의 `index` 자리로. 떠난 칸에서 먼저 빼고 끼운다 — 같은 칸이면 그 칸 안에서 옮기는 것이 된다. 자리는 칸 길이로 잘라 맞춘다. */
export function movedOnBoard(board: TPlanBoard, id: string, to: TPlanColumn, index: number): TPlanBoard {
  const from = columnOf(board, id);
  if (from === null || isPlanColumn(id)) return board;
  const next: TPlanBoard = { ...board, [from]: board[from].filter((value) => value !== id) };
  const target = next[to];
  const at = Math.max(0, Math.min(index, target.length));
  next[to] = [...target.slice(0, at), id, ...target.slice(at)];
  return next;
}

/**
 * 끄는 줄이 **다른 칸**의 줄(또는 빈 칸) 위로 넘어갔을 때의 새 초안. 같은 칸이거나 모르는 대상이면 `null` — 같은 칸 안의 자리는
 * dnd-kit(sortable)이 그림으로만 옮기고 놓을 때 정한다. `below` 는 끄는 줄이 가리킨 줄의 가운데보다 아래에 있는가(그 뒤에 끼운다).
 */
export function crossedOnBoard(board: TPlanBoard, id: string, overId: string, below: boolean): TPlanBoard | null {
  const from = columnOf(board, id);
  const to = columnOf(board, overId);
  if (from === null || to === null || from === to || isPlanColumn(id)) return null;
  const index = isPlanColumn(overId) ? board[to].length : board[to].indexOf(overId) + (below ? 1 : 0);
  return movedOnBoard(board, id, to, index);
}

export type TPlanDrop = {
  column: TPlanColumn;
  /** 놓인 칸의 순서(옮긴 곳 포함). */
  ids: string[];
  /** 스토어에 쓸 것이 있는가 — 같은 칸·같은 순서(미정 안의 자리 바꿈 포함)면 false. */
  changed: boolean;
};

const sameIds = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((id, index) => id === b[index]);

/**
 * 놓았을 때의 결과. `board` 는 끄는 동안의 초안(다른 칸으로는 이미 옮겨져 있다), `stored` 는 끌기 전 스토어의 판.
 * 같은 칸 안에서 다른 줄 위에 놓았으면 그 자리로 옮긴다(sortable 의 그림대로).
 * **제자리면 쓰지 않는다**(ADR-030 결정 4) — 집었다 놓기만 해도 제안이던 날이 손 순서로 굳으면 안 된다. 미정 안의 자리는 뜻이 없어(저장 순서) 늘 제자리다.
 */
export function dropOnBoard(board: TPlanBoard, stored: TPlanBoard, id: string, overId: string): TPlanDrop | null {
  const column = columnOf(board, id);
  if (column === null || isPlanColumn(id)) return null;
  let ids = board[column];
  const from = ids.indexOf(id);
  const to = isPlanColumn(overId) ? -1 : ids.indexOf(overId);
  if (to >= 0 && to !== from) {
    ids = ids.filter((value) => value !== id);
    ids.splice(to, 0, id);
  }
  const origin = columnOf(stored, id);
  const changed = !(origin === column && (column === 'undecided' || sameIds(ids, stored[column])));
  return { column, ids, changed };
}
