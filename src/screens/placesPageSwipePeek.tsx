'use client';

import type { RefObject } from 'react';
import { PlacesPageResults, type TPlacesPageResultsActions } from './placesPageResults';
import { usePlacesPageResultsView } from './placesPageResultsView';
import type { TPlaceType } from '../types';

type TPlacesPageSwipePeekProps = {
  ref: RefObject<HTMLDivElement | null>;
  type: TPlaceType;
  /** 어느 쪽에 대기하나. 왼쪽이면 -100%, 오른쪽이면 +100% 에서 출발한다. */
  side: 'left' | 'right';
  /** 무대 안에서의 세로 자리(px) — placesPageSwipe 가 지금 보이는 영역에 맞춰 잰다. */
  top: number;
  height: number;
};

const noop = () => undefined;

/** 그리기만 하고 아무것도 안 한다 — 타입이 전부 필수라 본문에 버튼이 늘면 여기 한 칸을 더하라고 tsc 가 막는다. */
const PEEK_ACTIONS: TPlacesPageResultsActions = {
  onResetFilters: noop,
  onClearQuery: noop,
  onClearTown: noop,
  onOpenFilters: noop,
  onSuggest: noop,
  onReleaseHidden: noop,
  onClearArea: noop,
  onClearOnlyReachable: noop,
  onReleaseAreaCarried: noop,
  onCityDowntown: noop,
  onRemoveChip: noop,
};

/**
 * 스와이프 중에 옆에서 따라 들어오는 이웃 종류의 본문.
 *
 * **새 화면이 마운트됐을 때와 같은 모습이어야 한다** — 검색어·방향·'어려운 곳 숨기기'·그 종류의 반려동물 조건·'어려움 N곳' 펼침(본문이 직접 읽는다)은
 * 스토어(`usePlacesPageFilterStore`)에서, 읍면·'실내 자리 필요'·강아지 판정은 `useAppStore` 에서 따라오고
 * 정렬만 종류를 바꾸면 리셋된다(그래서 여기는 순서를 넘기지 않아 늘 기본 순서). 본문 값은 placesPage 와 **같은 훅**
 * (`usePlacesPageResultsView` — 목록·칩·0곳 갈래·가까운 곳을 한 번에)으로 받아 통째로 넘긴다 — 값마다 따로 넘길 땐 새 값이 생길 때마다
 * 여기서 빠져 손을 놓는 순간 목록이 튀었다(ADR-013 v4 · v7).
 *
 * 보여주기만 한다(`inert`) — 손가락이 지나가는 동안 카드 링크가 눌리거나 포커스가 옮겨가면 안 된다.
 * 높이를 화면에 맞춰 잘라 두어 문서 높이를 늘리지 않는다.
 */
export function PlacesPageSwipePeek({ ref, type, side, top, height }: TPlacesPageSwipePeekProps) {
  const view = usePlacesPageResultsView(type);

  return (
    <div
      ref={ref}
      inert
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 overflow-hidden"
      style={{ top, height, transform: `translateX(${side === 'left' ? -100 : 100}%)` }}
    >
      <PlacesPageResults view={view} actions={PEEK_ACTIONS} />
    </div>
  );
}
