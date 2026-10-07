/**
 * 하루 묶음 판정(docs/todo/16 T2.1) — "이 날 고른 곳을 우리 강아지가 다 갈 수 있나". 순수.
 *
 * 규칙을 새로 쓰지 않는다. 장소마다 `judgeEligibility` 를 그대로 부르고(상세 카드와 같은 입력 — 프로필 · 정책 · `needsIndoor`)
 * 그 결과를 모은다. 그래서 장소 판정이 바뀌면 묶음 판정도 따라간다.
 *  - `level` = 가장 나쁜 곳(ok < cond < unknown < hard, `compareEligibility`).
 *  - `reasons` = 걸린 곳(ok 가 아닌 곳)마다 그곳의 판정 근거. 요금(info)은 근거가 아니라 뺀다. 나쁜 곳이 먼저, 같으면 하루 순서.
 *    영업시간 같은 규칙이 생기면(16 P5) 여기에 같은 모양으로 더한다.
 *  - `subset` = "이 날은 콩이만" — `dogSubsetWhatIf` 를 묶음에 적용한 것. 어려운 곳이 있을 때만 묻고, 그 조합이면
 *    **어려운 곳이 하나도 없는** 가장 많이 데려가는 조합을 고른다(고르는 규칙은 `bestDogSubset` 하나).
 *    장소 하나에서와 달리 '정보가 없어요' 인 곳은 막지 않는다 — 그 판정은 정책에서 오고 몇 마리를 데려가든 같아서,
 *    막으면 그런 곳이 하루에 한 곳만 끼어도 "콩이만" 을 영영 말하지 못한다. 대신 데려가는 아이를 줄였더니 새로 '정보가 없어요' 가 되는
 *    곳이 생기면 그 조합은 버린다(없는 정보를 해결로 읽지 않는다).
 */

import { bestDogSubset } from './dogSubsetWhatIf';
import { compareEligibility, judgeEligibility, type TEligibility, type TEligibilityLevel, type TReason } from './eligibility';
import type { TPetPolicy } from './petPolicy';
import type { TDogProfile } from '../types';

type TJudgeable = { id: string; policy: TPetPolicy };

export type TTripPlaceReasons = {
  id: string;
  level: Exclude<TEligibilityLevel, 'ok'>;
  /** 그곳의 판정 근거(심각도순, info 제외). */
  reasons: TReason[];
};

export type TTripEligibility = {
  level: TEligibilityLevel;
  reasons: TTripPlaceReasons[];
  /** 어려운 곳을 다 풀어 주는 조합. 없거나 묻지 않을 때(어려운 곳 없음 · 한 마리) `null`. */
  subset: { names: string[]; level: TEligibilityLevel } | null;
};

const worstOf = (levels: readonly TEligibilityLevel[]): TEligibilityLevel =>
  levels.reduce<TEligibilityLevel>((worst, level) => (compareEligibility(level, worst) > 0 ? level : worst), 'ok');

const judgeAll = (dog: TDogProfile, places: readonly TJudgeable[], needsIndoor: boolean | undefined): TEligibility[] =>
  places.map((place) => judgeEligibility(dog, place.policy, { needsIndoor }));

/** 하루의 장소들(순서대로) → 묶음 판정. 빈 하루는 판정할 것이 없어 `null`. */
export function tripEligibility(
  dog: TDogProfile,
  places: readonly TJudgeable[],
  opts: { needsIndoor?: boolean } = {},
): TTripEligibility | null {
  if (places.length === 0) return null;
  const verdicts = judgeAll(dog, places, opts.needsIndoor);
  const level = worstOf(verdicts.map((verdict) => verdict.level));

  const reasons = places
    .flatMap((place, index): TTripPlaceReasons[] => {
      const verdict = verdicts[index];
      if (verdict.level === 'ok') return [];
      return [{ id: place.id, level: verdict.level, reasons: verdict.reasons.filter((reason) => reason.level !== 'info') }];
    })
    // 안정 정렬 — 같은 심각도 안에서는 하루 순서 그대로.
    .sort((a, b) => compareEligibility(b.level, a.level));

  const subset =
    level === 'hard' && dog.dogs.length >= 2
      ? bestDogSubset(dog, (dogs) => {
          const trial = judgeAll(dogs, places, opts.needsIndoor);
          const fine = trial.every(
            (verdict, index) =>
              verdict.level !== 'hard' && (verdict.level !== 'unknown' || verdicts[index].level === 'unknown'),
          );
          return fine ? { level: worstOf(trial.map((verdict) => verdict.level)) } : null;
        })
      : null;

  return { level, reasons, subset: subset && { names: subset.names, level: subset.result.level } };
}
