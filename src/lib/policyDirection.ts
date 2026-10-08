/**
 * 조건 변화의 **방향** — 강화(더 까다로워짐) · 완화(더 쉬워짐) · 중립(docs/todo/11 U6 · T2.3). 순수.
 *
 * 왜: "대형견 가능 → 불가" 와 "불가 → 가능" 은 틀렸을 때의 값이 다르다(11 G8). 강화가 틀리면 갈 수 있는 곳 하나를 덜 보여 줄 뿐이지만,
 * 완화가 틀리면 손님이 강아지를 데리고 가서 **거절당한다**([BUG-008](../../docs/bugs/BUG-008-empty-pet-policy-judged-ok.md) 의 정신).
 * 그래서 덮어쓰기의 기본 체크가 다르다 — 강화는 글 하나로 켜지고, 완화는 꺼진 채 `전화로 확인해 주세요` 가 붙는다.
 *
 * ⚠️ `TPetPolicyFacts` 에 칸이 늘면 **여기도 늘어야 한다**(`DIRECTION_RULES`). 빠지면 그 칸의 완화가 중립으로 읽혀 기본 체크가 켜진다 —
 * `readNothing`(petPolicy.ts)과 같은 함정이라, 테스트가 `Required<TPetPolicyFacts>` 리터럴로 칸 목록을 대 본다(칸이 늘면 tsc 가 먼저 멈춘다).
 */

import type { TPetPolicyFacts } from '../types';
import { amountsInWon } from '../../scripts/lib/feeLine.mjs';
import { feeLinesOf } from '../../scripts/lib/petPolicyFacts.mjs';

export type TDirection = 'tighten' | 'loosen' | 'neutral';

type TFacts = Partial<TPetPolicyFacts> | null | undefined;

/** 크기 비교 — 커지면 `up`. 어느 쪽이든 모르면(null) 중립. */
const compare = (before: number | null | undefined, after: number | null | undefined, up: TDirection): TDirection => {
  if (before == null && after == null) return 'neutral';
  if (before === after) return 'neutral';
  const down: TDirection = up === 'tighten' ? 'loosen' : 'tighten';
  // 제한이 새로 생기면 강화, 없어지면 완화(무게·마릿수 — 숫자가 "상한" 이다).
  if (before == null) return 'tighten';
  if (after == null) return 'loosen';
  return after > before ? up : down;
};

/** 참이 "제약" 인 칸 — false→true 는 강화, true→false 는 완화. null 이 끼면 중립(모르는 것과의 비교다). */
const flag = (before: boolean | null | undefined, after: boolean | null | undefined): TDirection => {
  if (before == null || after == null || before === after) return 'neutral';
  return after ? 'tighten' : 'loosen';
};

const INDOOR_RANK: Record<string, number> = { free: 0, cage: 1, outdoorOnly: 2 };
const maxFee = (facts: TFacts): number | null => {
  const amounts = feeLinesOf(facts ?? null).flatMap((line: string) => amountsInWon(line) as number[]);
  return amounts.length ? Math.max(...amounts) : null;
};

/** 칸 → 방향 규칙. 칸 이름은 `TPetPolicyFacts` 의 키다. 요금 셋(`fees`·`feeLines`·`feeText`)은 한 규칙(가장 큰 금액)으로 본다. */
export const DIRECTION_RULES: Record<keyof TPetPolicyFacts, (before: TFacts, after: TFacts) => TDirection> = {
  indoor: (b, a) => {
    const rb = INDOOR_RANK[b?.indoor ?? ''];
    const ra = INDOOR_RANK[a?.indoor ?? ''];
    if (rb === undefined || ra === undefined || rb === ra) return 'neutral';
    return ra > rb ? 'tighten' : 'loosen';
  },
  leash: (b, a) => flag(b?.leash, a?.leash),
  // 대형견 가능이 참인 것이 "허용" 이라 방향이 반대다.
  largeDogOk: (b, a) => flag(b?.largeDogOk == null ? null : !b.largeDogOk, a?.largeDogOk == null ? null : !a.largeDogOk),
  smallDogOnly: (b, a) => flag(b?.smallDogOnly, a?.smallDogOnly),
  callFirst: (b, a) => flag(b?.callFirst, a?.callFirst),
  vaccineRequired: (b, a) => flag(b?.vaccineRequired, a?.vaccineRequired),
  // 요일 제한이 새로 생기거나 요일이 줄면(= 동반되는 날이 적어지면) 강화, 제한이 사라지거나 요일이 늘면 완화.
  petDays: (b, a) => {
    const nb = b?.petDays?.length ?? 0;
    const na = a?.petDays?.length ?? 0;
    if (nb === na) return 'neutral';
    if (nb === 0) return 'tighten';
    if (na === 0) return 'loosen';
    return na < nb ? 'tighten' : 'loosen';
  },
  feeFree: (b, a) => flag(b?.feeFree == null ? null : !b.feeFree, a?.feeFree == null ? null : !a.feeFree),
  fees: (b, a) => compare(maxFee(b), maxFee(a), 'tighten'),
  feeLines: () => 'neutral', // `fees` 규칙이 셋을 함께 본다
  feeText: () => 'neutral',
  weightLimitKg: (b, a) => compare(b?.weightLimitKg, a?.weightLimitKg, 'loosen'),
  maxDogs: (b, a) => compare(b?.maxDogs, a?.maxDogs, 'loosen'),
  notes: () => 'neutral',
};

export type TPolicyDirection = {
  /** 방향이 중립이 아닌 칸만. */
  fields: Partial<Record<keyof TPetPolicyFacts, Exclude<TDirection, 'neutral'>>>;
  /** 전체 — **완화가 하나라도 있으면 완화**(틀렸을 때 비싼 쪽이 이긴다). 강화만 있으면 강화, 없으면 중립. */
  overall: TDirection;
};

/** 판단 두 벌(지금 사이트 → 바뀔 값)의 방향. 한쪽이 없으면(시드: 사이트 판단 없음) 비교할 것이 없어 중립이다. */
export function policyDirection(before: TFacts, after: TFacts): TPolicyDirection {
  const fields: TPolicyDirection['fields'] = {};
  if (!before || !after) return { fields, overall: 'neutral' };
  for (const [key, rule] of Object.entries(DIRECTION_RULES) as [keyof TPetPolicyFacts, (b: TFacts, a: TFacts) => TDirection][]) {
    const direction = rule(before, after);
    if (direction !== 'neutral') fields[key] = direction;
  }
  const values = Object.values(fields);
  const overall: TDirection = values.includes('loosen') ? 'loosen' : values.includes('tighten') ? 'tighten' : 'neutral';
  return { fields, overall };
}

/** 완화 줄에 붙는 한마디(07 P0 전화의 자리). */
export const LOOSEN_HINT = '전화로 확인해 주세요 — 더 쉬워지는 변화는 글 둘 또는 확인 뒤에 받아요';
