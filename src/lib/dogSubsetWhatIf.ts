/**
 * 다두 what-if — "초코만 데려가면 갈 수 있어요"(docs/todo/10 F11, 태호 "18kg 만 안 되면 12kg 만 데려가면 되나"). 순수.
 *
 * 판정을 **마리 부분집합으로 다시 돌린다.** 규칙을 새로 쓰지 않는다 — `judgeEligibility` 를 그대로 부르고 강아지 목록만 줄인다.
 * 그래서 무게·마릿수·크기·요금 규칙이 바뀌어도 이 함수는 따라간다.
 *
 * 설계(08 P3 T5.7 과 묶어 본 것):
 * - **어려움**이면 갈 수 있는 조합(확인 필요까지)을 묻는다. **확인 필요(cond)** 면 조합의 답이 **더 나을 때만** — 갈 수 있어요(ok)나
 *   야외 자리에서 갈 수 있어요(`isOutdoorSeatOnly`)일 때 한 줄(14 W261010.15 → NOW 2026-10-27). 대장(28kg)·초코(6kg)가 "대형견 언급이 없는" 곳(C5)이면
 *   초코만 가면 확인할 것이 없는데 "확인이 필요해요" 뿐이었다(C5 47곳 중 40곳). 누구를 빼도 남는 조건(전화·접종·이동 수단)이면 조합도 cond 라
 *   저절로 안 선다 — 처음 설계가 cond 를 "소음" 으로 뺀 까닭은 그 경우였다. 이미 야외 자리만이면 ok 조합만 더 낫다.
 * - **가장 많이 데려갈 수 있는 조합**을 고른다(두고 갈 아이가 적은 쪽). 같은 수면 판정이 나은 쪽, 그다음 무거운 쪽(덜 놀랍다).
 *   그런데 수도 판정도 같은 조합이 여럿이면 하나만 부르지 않는다(`ties` · `dogSubsetLead`) — 웨스티하우스에 콩(2.5kg)·해피(12kg)는
 *   누구 한 마리만 가도 되는데 "해피만 데려가면" 이라 해 "콩은 안 되는 줄 알았다"(14 W261019.9). 판정이 다른 조합은 묶지 않는다 —
 *   뒤에 붙는 머리글("갈 수 있어요")이 모두에게 참이어야 해서다(콩 ok · 해피 확인 필요면 "콩이만").
 * - 크기 수정(`sizeOverride`)은 부분집합에 **가져가지 않는다** — 그 값은 프로필 전체(가장 큰 아이)를 고친 것이라, 작은 아이만 남으면 틀린 크기가 된다.
 *   이동 수단은 그대로다(보호자가 들고 다니는 것).
 * - 3마리까지라 부분집합은 많아야 6개다 — 목록 전체에 돌려도 싸지만, 화면은 상세 한 곳에서만 부른다.
 */

import { isOutdoorSeatOnly, judgeEligibility, type TEligibility, type TEligibilityLevel } from './eligibility';
import { dogCallNames, dogCallNamesOr } from './korean';
import type { TPetPolicy } from './petPolicy';
import type { TDogProfile } from '../types';

export type TDogSubsetWhatIf = {
  /** 데려가는 아이들의 이름(프로필 순서). */
  names: string[];
  /** `names` 와 수·판정이 같은 조합 전부(`names` 포함, 마리 순서 조합 순). 둘 이상이면 누구로도 된다. */
  ties: string[][];
  eligibility: TEligibility;
};

const LEVEL_RANK = { ok: 0, cond: 1, unknown: 2, hard: 3 } as const;

/** 비지 않은 진부분집합 — 마리 순서를 지킨다. */
const properSubsets = <T>(items: readonly T[]): T[][] => {
  const subsets: T[][] = [];
  for (let mask = 1; mask < (1 << items.length) - 1; mask += 1) {
    subsets.push(items.filter((_, index) => mask & (1 << index)));
  }
  return subsets;
};

/**
 * 비지 않은 진부분집합 중 **가장 많이 데려가는 조합** — 같은 수면 판정이 나은 쪽, 그다음 무거운 쪽.
 * `judge` 가 그 조합의 판정을 내고, 받아들일 수 없는 조합이면 `null`. 장소 하나(`dogSubsetWhatIf`)와
 * 하루 묶음(`tripEligibility`)이 무엇을 "된다" 로 치는지만 다르고 고르는 규칙은 같다.
 */
export function bestDogSubset<R extends { level: TEligibilityLevel }>(
  dog: TDogProfile,
  judge: (subset: TDogProfile) => R | null,
): { names: string[]; result: R; ties: string[][] } | null {
  let best: { names: string[]; result: R; weight: number } | null = null;
  const accepted: { names: string[]; level: TEligibilityLevel }[] = [];
  for (const dogs of properSubsets(dog.dogs)) {
    const result = judge({ dogs, carrier: dog.carrier });
    if (!result) continue;
    accepted.push({ names: dogs.map((entry) => entry.name), level: result.level });
    const weight = dogs.reduce((sum, entry) => sum + entry.weightKg, 0);
    const better =
      !best ||
      dogs.length > best.names.length ||
      (dogs.length === best.names.length &&
        (LEVEL_RANK[result.level] < LEVEL_RANK[best.result.level] ||
          (LEVEL_RANK[result.level] === LEVEL_RANK[best.result.level] && weight > best.weight)));
    if (better) best = { names: dogs.map((entry) => entry.name), result, weight };
  }
  if (!best) return null;
  const { names, result } = best;
  const ties = accepted.filter((c) => c.names.length === names.length && c.level === result.level).map((c) => c.names);
  return { names, result, ties };
}

/**
 * 지금 판정에서 어떤 조합의 답을 "된다" 로 치나 — 어려움이면 갈 수 있거나 확인이 필요한 조합, 확인 필요면 그보다 나은 답
 * (갈 수 있어요 · 야외 자리만), 야외 자리만이면 갈 수 있어요만. 그 밖(갈 수 있어요 · 정보 없음)은 묻지 않는다.
 */
const acceptsFor = (current: TEligibility): ((e: TEligibility) => boolean) | null => {
  if (current.level === 'hard') return (e) => e.level === 'ok' || e.level === 'cond';
  if (current.level !== 'cond') return null;
  if (isOutdoorSeatOnly(current)) return (e) => e.level === 'ok';
  return (e) => e.level === 'ok' || isOutdoorSeatOnly(e);
};

export function dogSubsetWhatIf(
  dog: TDogProfile,
  policy: TPetPolicy,
  current: TEligibility,
  opts: { needsIndoor?: boolean } = {},
): TDogSubsetWhatIf | null {
  if (dog.dogs.length < 2) return null;
  const accepts = acceptsFor(current);
  if (!accepts) return null;
  const best = bestDogSubset(dog, (subset) => {
    const eligibility = judgeEligibility(subset, policy, opts);
    return accepts(eligibility) ? eligibility : null;
  });
  return best ? { names: best.names, ties: best.ties, eligibility: best.result } : null;
}

/**
 * what-if 줄의 앞 — "초코만 데려가면" · 누구 한 마리로도 되면 "콩이나 해피 중 한 마리만 데려가면" ·
 * 누구 한 마리만 빼도 되면 "단비, 솜이, 구름이 중 한 마리만 두고 가면"(14 W261019.9). 뒤에 판정 머리글이 붙는다.
 * 3마리까지라 갈래는 이것뿐이다: 한 마리 조합(2·3마리) · 두 마리 조합(3마리 — 빠지는 한 마리로 말한다). 2마리는 둘이 같아 '데려가면' 이 먼저다.
 */
export function dogSubsetLead(subset: Pick<TDogSubsetWhatIf, 'names' | 'ties'>, profileNames: readonly string[]): string {
  if (subset.ties.length >= 2 && subset.names.length === 1) {
    return `${dogCallNamesOr(subset.ties.map(([name]) => name))} 중 한 마리만 데려가면`;
  }
  if (subset.ties.length >= 2 && subset.names.length === profileNames.length - 1) {
    // 조합은 마스크 순서라 빠지는 아이를 모으면 거꾸로다 — 프로필 순서로 다시 센다.
    const left = profileNames.filter((name) => subset.ties.some((tie) => !tie.includes(name)));
    return `${dogCallNamesOr(left)} 중 한 마리만 두고 가면`;
  }
  return `${dogCallNames(subset.names)}만 데려가면`;
}
