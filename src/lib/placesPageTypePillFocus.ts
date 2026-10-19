import type { TPlaceType } from '../types';

/**
 * 알약을 눌러 종류를 바꾼 뒤 새로 고른 알약에 포커스를 돌려주려는 표식.
 *
 * 종류를 바꾸면 알약 줄이 통째로 새로 마운트돼(placesPage 의 `key={type}`) 누른 알약이 포커스와 함께 사라진다.
 * 새 화면은 "알약을 눌러서 왔는가" 를 스스로 알 수 없어서(스와이프·탭바·딥링크로 와도 같은 마운트다) 누르는 쪽이 표식을 남긴다.
 * 모듈 변수인 이유는 `lastPlaceType` 과 같다 — 마운트를 건너 살아야 하고 렌더와 무관하다.
 */
export type TPillFocusMark = { type: TPlaceType; at: number };

/** 눌렀는데 이동이 막혀 표식만 남았을 때, 한참 뒤 스와이프로 온 같은 종류가 포커스를 빼앗지 않게 하는 시한. */
export const PILL_FOCUS_TTL_MS = 2000;

/** 이 마운트가 표식의 도착지인가. 맞아야만 포커스를 둔다. */
export function isPillFocusArrival(mark: TPillFocusMark | null, type: TPlaceType, now: number): boolean {
  return mark !== null && mark.type === type && now - mark.at <= PILL_FOCUS_TTL_MS;
}

let mark: TPillFocusMark | null = null;

export function markPillFocus(type: TPlaceType, now = Date.now()) {
  mark = { type, at: now };
}

/** 표식을 읽고 지운다 — 어느 마운트든 한 번만 본다. */
export function takePillFocus(type: TPlaceType, now = Date.now()): boolean {
  const arrival = isPillFocusArrival(mark, type, now);
  mark = null;
  return arrival;
}
