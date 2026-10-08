/**
 * 저장 위에 얹는 **날짜 라벨과 하루 순서**(docs/todo/16 T1.1 · P1·P2). 순수 함수만 — 스토어(`useAppStore`)가 쓴다.
 *
 * 일정은 새 집합이 아니라 `savedIds` 의 부분집합에 날짜를 붙인 것이다(P1). 그래서 메모(`savedNotes.ts`)와 생명주기가 같다 —
 * 하트를 지우면 라벨도 순서도 빠지고, 저장하지 않은 곳에는 라벨을 달 수 없다.
 *
 *  - `days`  = id → 1..`TRIP_DAY_MAX`. 라벨이 없는 곳이 "미정" 이다(값을 따로 두지 않는다).
 *  - `order` = 하루 → 사용자가 끌어 바꾼 순서. **있는 날만** 있다. 없으면 화면이 `suggestOrder`(tripRoute.ts)로 제안한다 —
 *    제안은 라벨이 바뀔 때마다 다시 계산되지만 손으로 정한 순서는 덮지 않는다(P2). "순서 다시 제안" 은 그 날의 순서를 지운다.
 */

/** 날짜 칩은 1~4일 + 미정(16 §7 🙋1 권고 — 제주 여행 중앙값, 칩 다섯으로 끝난다). */
export const TRIP_DAY_MAX = 4;

export type TTripDay = 1 | 2 | 3 | 4;
export type TTripDays = Record<string, TTripDay>;
export type TTripOrder = Partial<Record<TTripDay, string[]>>;
export type TTripPlan = { days: TTripDays; order: TTripOrder };

export const TRIP_DAYS: readonly TTripDay[] = [1, 2, 3, 4];

export const isTripDay = (value: unknown): value is TTripDay =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= TRIP_DAY_MAX;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

/** 저장소에서 읽은 라벨을 믿지 않는다 — 저장한 곳에 없는 id(하트를 지웠다), 범위 밖의 날은 버린다. 내린 곳의 하트는 남으므로 라벨도 남는다. */
export function sanitizeTripDays(value: unknown, savedIds: readonly string[]): TTripDays {
  if (!isRecord(value)) return {};
  const keep = new Set(savedIds);
  const days: TTripDays = {};
  for (const [id, day] of Object.entries(value)) {
    if (keep.has(id) && isTripDay(day)) days[id] = day;
  }
  return days;
}

/** 저장소에서 읽은 순서를 믿지 않는다 — 그 날 라벨이 아닌 id·겹친 id 는 버리고, 남는 게 없으면 그 날은 "제안" 으로 돌아간다. */
export function sanitizeTripOrder(value: unknown, days: Readonly<TTripDays>): TTripOrder {
  if (!isRecord(value)) return {};
  const order: TTripOrder = {};
  for (const day of TRIP_DAYS) {
    const list = value[String(day)];
    if (!Array.isArray(list)) continue;
    const ids = list.filter((id, index): id is string => typeof id === 'string' && days[id] === day && list.indexOf(id) === index);
    if (ids.length > 0) order[day] = ids;
  }
  return order;
}

/**
 * 한 곳의 날을 바꾼다(`null` = 미정 · 하트를 지울 때도 이것). 옛 날의 손 순서에서는 빠지고,
 * 새 날에 손 순서가 있으면 그 끝에 붙는다 — 사용자가 정한 앞 순서를 흔들지 않는다(P2). 새 날에 손 순서가 없으면 제안이 알아서 넣는다.
 */
export function withTripDay(plan: TTripPlan, id: string, day: TTripDay | null): TTripPlan {
  const prev = plan.days[id];
  if ((prev ?? null) === day) return plan;
  const days = { ...plan.days };
  if (day === null) delete days[id];
  else days[id] = day;

  const order = { ...plan.order };
  if (prev !== undefined && order[prev]) {
    const rest = order[prev].filter((value) => value !== id);
    if (rest.length > 0) order[prev] = rest;
    else delete order[prev];
  }
  if (day !== null && order[day]) order[day] = [...order[day], id];
  return { days, order };
}

/** 그 날의 손 순서를 정한다. 그 날 라벨이 아닌 id 는 버린다 — 화면이 넘긴 목록이 낡았어도 다른 날 곳이 끼지 않게. */
export function withDayOrder(plan: TTripPlan, day: TTripDay, ids: readonly string[]): TTripPlan {
  const kept = ids.filter((id, index) => plan.days[id] === day && ids.indexOf(id) === index);
  const order = { ...plan.order };
  if (kept.length > 0) order[day] = kept;
  else delete order[day];
  return { days: plan.days, order };
}

/** "순서 다시 제안" — 그 날의 손 순서를 지워 제안으로 돌린다. */
export function withoutDayOrder(plan: TTripPlan, day: TTripDay): TTripPlan {
  if (!plan.order[day]) return plan;
  const order = { ...plan.order };
  delete order[day];
  return { days: plan.days, order };
}

/** 그 날에 라벨을 단 곳(`savedIds` 순서 그대로). 라벨 없는 곳(미정)은 `day` 에 `null`. */
export function tripDayMembers(savedIds: readonly string[], days: Readonly<TTripDays>, day: TTripDay | null): string[] {
  return savedIds.filter((id) => (days[id] ?? null) === day);
}

/**
 * 그 날의 손 순서 — 없으면 `null`(화면이 `suggestOrder` 로 제안한다). 손 순서 뒤에 아직 끼지 않은 그 날 곳을 붙인다:
 * 저장소에서 순서만 남고 라벨이 바뀐 경우 등, 순서와 라벨이 어긋나도 그 날 곳이 사라지지 않게.
 */
export function manualDayOrder(plan: TTripPlan, members: readonly string[], day: TTripDay): string[] | null {
  const manual = plan.order[day];
  if (!manual) return null;
  const inDay = new Set(members);
  const head = manual.filter((id) => inDay.has(id));
  const placed = new Set(head);
  return [...head, ...members.filter((id) => !placed.has(id))];
}
