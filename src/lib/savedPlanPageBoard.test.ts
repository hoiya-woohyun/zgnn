import { describe, expect, it } from 'vitest';
import type { TPlaceEntry } from './places';
import { columnOf, columnOfDay, crossedOnBoard, dayOfColumn, dropOnBoard, movedOnBoard, PLAN_COLUMNS, planBoardOf, type TPlanBoard } from './savedPlanPageBoard';
import type { TTripPlan } from './tripPlan';
import type { TPlaceType } from '../types';

// 판은 id · type · geo 만 본다(순서 제안이 type·geo 를 읽는다).
const at = (id: string, type: TPlaceType, geo?: { lat: number; lng: number }) => ({ id, type, geo }) as unknown as TPlaceEntry;

const PLACES = [
  at('cafe-hamdeok', 'cafe', { lat: 33.543, lng: 126.669 }),
  at('stay-aewol', 'stay', { lat: 33.463, lng: 126.31 }),
  at('cafe-hyeopjae', 'cafe', { lat: 33.394, lng: 126.239 }),
  at('food-nogeo', 'restaurant'),
];

const board = (partial: Partial<TPlanBoard>): TPlanBoard => ({
  'day-1': [],
  'day-2': [],
  'day-3': [],
  'day-4': [],
  undecided: [],
  ...partial,
});

describe('칸 이름 ↔ 날', () => {
  it('1~4일차와 미정이 서로 돌아온다', () => {
    for (const column of PLAN_COLUMNS) expect(columnOfDay(dayOfColumn(column))).toBe(column);
    expect(dayOfColumn('day-3')).toBe(3);
    expect(dayOfColumn('undecided')).toBeNull();
  });
});

describe('planBoardOf — 스토어 값으로 판 차리기', () => {
  it('날마다 저장 화면과 같은 순서(손 순서 우선), 미정은 저장 순서', () => {
    const plan: TTripPlan = { days: { 'cafe-hamdeok': 1, 'stay-aewol': 1, 'cafe-hyeopjae': 2 }, order: { 1: ['stay-aewol', 'cafe-hamdeok'] } };
    expect(planBoardOf(plan, PLACES)).toEqual(
      board({ 'day-1': ['stay-aewol', 'cafe-hamdeok'], 'day-2': ['cafe-hyeopjae'], undecided: ['food-nogeo'] }),
    );
  });

  it('손 순서가 없는 날은 제안 순서 — 숙소가 끝에 선다', () => {
    const plan: TTripPlan = { days: { 'stay-aewol': 1, 'cafe-hyeopjae': 1 }, order: {} };
    expect(planBoardOf(plan, PLACES)['day-1']).toEqual(['cafe-hyeopjae', 'stay-aewol']);
  });
});

describe('columnOf · movedOnBoard — 끄는 동안의 초안', () => {
  const start = board({ 'day-1': ['a', 'b'], 'day-2': ['c'], undecided: ['d'] });

  it('id 가 든 칸, 칸 이름이면 그 칸, 없으면 null', () => {
    expect(columnOf(start, 'c')).toBe('day-2');
    expect(columnOf(start, 'day-4')).toBe('day-4');
    expect(columnOf(start, 'x')).toBeNull();
  });

  it('다른 칸의 자리로 옮기면 떠난 칸에서 빠진다', () => {
    expect(movedOnBoard(start, 'd', 'day-1', 1)).toEqual(board({ 'day-1': ['a', 'd', 'b'], 'day-2': ['c'], undecided: [] }));
  });

  it('빈 칸에도 놓이고, 자리는 칸 길이로 잘린다', () => {
    expect(movedOnBoard(start, 'a', 'day-4', 9)['day-4']).toEqual(['a']);
    expect(movedOnBoard(start, 'a', 'day-2', -3)['day-2']).toEqual(['a', 'c']);
  });

  it('같은 칸 안에서는 자리만 바뀐다', () => {
    expect(movedOnBoard(start, 'a', 'day-1', 1)['day-1']).toEqual(['b', 'a']);
  });

  it('판에 없는 id 나 칸 이름을 옮기라면 그대로', () => {
    expect(movedOnBoard(start, 'x', 'day-1', 0)).toBe(start);
    expect(movedOnBoard(start, 'day-2', 'day-1', 0)).toBe(start);
  });
});

describe('crossedOnBoard — 다른 칸으로 넘어갈 때', () => {
  const start = board({ 'day-1': ['a', 'b'], 'day-2': ['c'], undecided: ['d'] });

  it('가리킨 줄의 앞(가운데보다 위) 또는 뒤(아래)에 끼운다', () => {
    expect(crossedOnBoard(start, 'd', 'b', false)?.['day-1']).toEqual(['a', 'd', 'b']);
    expect(crossedOnBoard(start, 'd', 'b', true)?.['day-1']).toEqual(['a', 'b', 'd']);
  });

  it('칸 자체(빈 칸)를 가리키면 끝에', () => {
    expect(crossedOnBoard(start, 'a', 'day-4', false)?.['day-4']).toEqual(['a']);
    expect(crossedOnBoard(start, 'a', 'day-2', false)?.['day-2']).toEqual(['c', 'a']);
  });

  it('같은 칸이거나 모르는 대상이면 null — 같은 칸 안의 자리는 놓을 때 정한다', () => {
    expect(crossedOnBoard(start, 'a', 'b', true)).toBeNull();
    expect(crossedOnBoard(start, 'a', 'day-1', true)).toBeNull();
    expect(crossedOnBoard(start, 'a', 'x', true)).toBeNull();
  });
});

describe('dropOnBoard — 놓았을 때 쓸 것', () => {
  const stored = board({ 'day-1': ['a', 'b', 'c'], 'day-2': ['e'], undecided: ['d', 'f'] });

  it('같은 칸 안에서 다른 줄 위에 놓으면 그 자리로', () => {
    expect(dropOnBoard(stored, stored, 'c', 'a')).toEqual({ column: 'day-1', ids: ['c', 'a', 'b'], changed: true });
    expect(dropOnBoard(stored, stored, 'a', 'c')).toEqual({ column: 'day-1', ids: ['b', 'c', 'a'], changed: true });
  });

  it('제자리(자기 위·칸 위)면 쓰지 않는다 — 제안이던 날이 손 순서로 굳지 않게', () => {
    expect(dropOnBoard(stored, stored, 'b', 'b')).toEqual({ column: 'day-1', ids: ['a', 'b', 'c'], changed: false });
    expect(dropOnBoard(stored, stored, 'b', 'day-1')?.changed).toBe(false);
  });

  it('미정 안의 자리 바꿈은 뜻이 없어 쓰지 않는다', () => {
    expect(dropOnBoard(stored, stored, 'f', 'd')?.changed).toBe(false);
  });

  it('다른 칸으로 넘어온 초안이면 그 칸 순서를 쓴다', () => {
    const draft = movedOnBoard(stored, 'd', 'day-2', 0);
    expect(dropOnBoard(draft, stored, 'd', 'd')).toEqual({ column: 'day-2', ids: ['d', 'e'], changed: true });
  });

  it('미정으로 빼면 쓴다(라벨이 빠진다)', () => {
    const draft = movedOnBoard(stored, 'a', 'undecided', 0);
    expect(dropOnBoard(draft, stored, 'a', 'undecided')).toEqual({ column: 'undecided', ids: ['a', 'd', 'f'], changed: true });
  });

  it('판에 없는 id 면 null', () => {
    expect(dropOnBoard(stored, stored, 'x', 'a')).toBeNull();
  });
});
