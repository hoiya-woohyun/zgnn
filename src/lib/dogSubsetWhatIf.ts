/**
 * 다두 what-if — "초코만 데려가면 갈 수 있어요"(docs/todo/10 F11, 태호 "18kg 만 안 되면 12kg 만 데려가면 되나"). 순수.
 *
 * 판정을 **마리 부분집합으로 다시 돌린다.** 규칙을 새로 쓰지 않는다 — `judgeEligibility` 를 그대로 부르고 강아지 목록만 줄인다.
 * 그래서 무게·마릿수·크기·요금 규칙이 바뀌어도 이 함수는 따라간다.
 *
 * 설계(08 P3 T5.7 과 묶어 본 것):
 * - **어려움일 때만** 묻는다. 확인이 필요한 곳(cond)에서 "한 마리만 가면 확인 없이 돼요" 는 판정을 뒤집는 말이 아니라 소음이다.
 * - **가장 많이 데려갈 수 있는 조합**을 고른다(두고 갈 아이가 적은 쪽). 같은 수면 판정이 나은 쪽, 그다음 무거운 쪽(덜 놀랍다).
 * - 크기 수정(`sizeOverride`)은 부분집합에 **가져가지 않는다** — 그 값은 프로필 전체(가장 큰 아이)를 고친 것이라, 작은 아이만 남으면 틀린 크기가 된다.
 *   이동 수단은 그대로다(보호자가 들고 다니는 것).
 * - 3마리까지라 부분집합은 많아야 6개다 — 목록 전체에 돌려도 싸지만, 화면은 상세 한 곳에서만 부른다.
 */

import { judgeEligibility, type TEligibility, type TEligibilityLevel } from './eligibility';
import type { TPetPolicy } from './petPolicy';
import type { TDogProfile } from '../types';

export type TDogSubsetWhatIf = {
  /** 데려가는 아이들의 이름(프로필 순서). */
  names: string[];
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
): { names: string[]; result: R } | null {
  let best: { names: string[]; result: R; weight: number } | null = null;
  for (const dogs of properSubsets(dog.dogs)) {
    const result = judge({ dogs, carrier: dog.carrier });
    if (!result) continue;
    const weight = dogs.reduce((sum, entry) => sum + entry.weightKg, 0);
    const better =
      !best ||
      dogs.length > best.names.length ||
      (dogs.length === best.names.length &&
        (LEVEL_RANK[result.level] < LEVEL_RANK[best.result.level] ||
          (LEVEL_RANK[result.level] === LEVEL_RANK[best.result.level] && weight > best.weight)));
    if (better) best = { names: dogs.map((entry) => entry.name), result, weight };
  }
  return best ? { names: best.names, result: best.result } : null;
}

export function dogSubsetWhatIf(
  dog: TDogProfile,
  policy: TPetPolicy,
  current: TEligibility,
  opts: { needsIndoor?: boolean } = {},
): TDogSubsetWhatIf | null {
  if (current.level !== 'hard' || dog.dogs.length < 2) return null;
  const best = bestDogSubset(dog, (subset) => {
    const eligibility = judgeEligibility(subset, policy, opts);
    return eligibility.level === 'hard' || eligibility.level === 'unknown' ? null : eligibility;
  });
  return best ? { names: best.names, eligibility: best.result } : null;
}
