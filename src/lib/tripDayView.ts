/**
 * 저장 화면 「날짜별」 보기의 재료(docs/todo/16 T1.4) — 하루의 시작점과 순서. 순수.
 *
 * 시작점 기본값은 16 §7 🙋2 권고대로 **1일차는 공항, 2일차부터 전날 숙소**. "내 위치에서" 는 화면의 버튼이 덮어쓴다(누를 때 한 번, 저장하지 않는다 · P3).
 *  - "전날" 은 그 날 앞에서 **곳이 있는 가장 가까운 날**이다 — 2일차를 비워 두고 3일차를 짰으면 1일차 숙소에서 출발한다.
 *  - 그 날의 숙소는 순서의 **마지막 숙소**다(제안이면 숙소가 끝에 서고, 손 순서면 사용자가 둔 자리).
 *  - 앞 날에 곳은 있는데 숙소가 없으면 `none`(첫 장소부터) — 숙소를 저장하지 않은 것이지 공항에 다시 내린 게 아니다.
 *    앞 날에 곳이 하나도 없으면 그 날이 여행의 첫날이라 공항이다.
 *  - 좌표 없는 숙소는 시작점이 못 된다 — 역시 `none`.
 */

import type { TPlaceEntry } from './places';
import { JEJU_AIRPORT, suggestOrder } from './tripRoute';
import { manualDayOrder, TRIP_DAYS, type TTripDay, type TTripPlan } from './tripPlan';
import type { TGeo } from '../types';

export type TTripDayStart = { kind: 'airport' } | { kind: 'prevStay'; place: TPlaceEntry & { geo: TGeo } } | { kind: 'none' };

/** 길찾기 링크의 출발 칸에 넣는 공항 지점 이름. */
export const JEJU_AIRPORT_NAME = '제주국제공항';

export function tripDayStartGeo(start: TTripDayStart): TGeo | null {
  if (start.kind === 'airport') return JEJU_AIRPORT;
  if (start.kind === 'prevStay') return start.place.geo;
  return null;
}

/** 그 날의 기본 시작점(공항 · 전날 숙소 · 없음). `places` 는 저장 순서의 저장한 곳. */
export function tripDayStart(plan: TTripPlan, places: readonly TPlaceEntry[], day: TTripDay): TTripDayStart {
  const prev = TRIP_DAYS.filter((value) => value < day)
    .reverse()
    .find((value) => places.some((place) => plan.days[place.id] === value));
  if (prev === undefined) return { kind: 'airport' };
  const stay = tripDayStops(plan, places, prev)
    .filter((place) => place.type === 'stay')
    .at(-1);
  return stay?.geo ? { kind: 'prevStay', place: { ...stay, geo: stay.geo } } : { kind: 'none' };
}

/**
 * 그 날의 순서. 손 순서가 있으면 그것(P2 — 제안이 덮지 않는다), 없으면 시작점에서 가까운 순 제안(숙소 마지막).
 * `startGeo` 를 주지 않으면 그 날의 기본 시작점(`tripDayStart`)에서 제안한다 — 화면의 "내 위치에서" 가 이것을 덮는다.
 */
export function tripDayStops(
  plan: TTripPlan,
  places: readonly TPlaceEntry[],
  day: TTripDay,
  startGeo?: TGeo | null,
): TPlaceEntry[] {
  const members = places.filter((place) => plan.days[place.id] === day);
  const manual = manualDayOrder(
    plan,
    members.map((place) => place.id),
    day,
  );
  if (manual) {
    const byId = new Map(members.map((place) => [place.id, place]));
    return manual.map((id) => byId.get(id)).filter((place): place is TPlaceEntry => place !== undefined);
  }
  const from = startGeo !== undefined ? startGeo : tripDayStartGeo(tripDayStart(plan, places, day));
  return suggestOrder(members, from);
}

/** 한 칸 위·아래로 옮긴 순서(손 순서로 저장할 값). 끝에서 더 못 가면 그대로. */
export function movedStop(ids: readonly string[], id: string, delta: -1 | 1): string[] {
  const from = ids.indexOf(id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= ids.length) return [...ids];
  const next = [...ids];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}
