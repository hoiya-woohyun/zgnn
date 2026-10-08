/**
 * 하루 머리의 묶음 판정 한 줄(docs/todo/16 T2.3) — `tripEligibility` 의 결과를 문장으로. 순수.
 *
 * 장소 하나의 문장 함수(`headlineFor` · `verdictFor`)를 묶음에 그대로 쓰지 않는다:
 *  - 묶음의 '정보가 없어요' 는 강아지 조건과 무관한 정책 공백이라 **장소가 주어**다(`verdictFor` 의 unknown 과 같은 원칙).
 *  - 야외 자리만 되는 곳(`isOutdoorSeatOnly`)은 카드 배지가 "야외 자리에서 갈 수 있어요" 라고 한다 — 머리가 그곳을
 *    "확인이 필요해요" 로 세면 한 화면에서 카드와 머리가 반대를 말한다(5a22852 가 장소 하나에서 막은 것).
 *  - 조합(`subset`)의 level 이 'unknown' 이면 실패가 아니다 — 어려운 곳은 다 풀렸고 원래 정보가 없던 곳이 남았을 뿐(T2.1 메모).
 *    그래서 조합 문장은 "다 갈 수 있어요" 와 "어려운 곳은 없어요" 둘뿐이다.
 *  - 어려울 때 주어는 **데려가는 아이 전부**다. 빠지는 아이를 탓하지 않는다 — 마릿수 규칙이면 어느 한 아이 탓이 아니다.
 *    누구를 두고 가면 되는지는 조합 문장이 말한다.
 */

import { isOutdoorSeatOnly, type TEligibilityLevel } from './eligibility';
import { dogCallNames, withJosa } from './korean';
import type { TPetPolicy } from './petPolicy';
import { tripEligibility } from './tripEligibility';
import type { TDogProfile } from '../types';

type TJudgeable = { id: string; name: string; policy: TPetPolicy };

export type TTripDayVerdict = {
  level: TEligibilityLevel;
  /** 하루 머리 한 줄. */
  headline: string;
  /** "이 날은 콩이만 데려가면 …" — 어려운 곳이 있고 그것을 다 푸는 조합이 있을 때만. */
  subsetLine: string | null;
  /** 어려운 곳의 id — 화면이 그 카드 밑에 "대신 △△" 를 붙인다. */
  hardIds: string[];
};

/** 하루의 장소들(순서대로) → 머리 한 줄. 빈 하루는 `null`. */
export function tripDayVerdict(
  dog: TDogProfile,
  stops: readonly TJudgeable[],
  opts: { needsIndoor?: boolean } = {},
): TTripDayVerdict | null {
  const trip = tripEligibility(dog, stops, opts);
  if (!trip) return null;

  const names = withJosa(dogCallNames(dog.dogs.map((entry) => entry.name)), '은/는');
  const nameOf = new Map(stops.map((stop) => [stop.id, stop.name]));
  const hard = trip.reasons.filter((entry) => entry.level === 'hard');
  const outdoor = trip.reasons.filter((entry) => isOutdoorSeatOnly(entry));
  const cond = trip.reasons.filter((entry) => entry.level === 'cond' && !isOutdoorSeatOnly(entry));
  const unknown = trip.reasons.filter((entry) => entry.level === 'unknown');

  let headline: string;
  if (hard.length > 0) {
    headline =
      hard.length === 1
        ? `${names} ${nameOf.get(hard[0].id)}에 가기 어려워요`
        : `${names} 이 날 ${hard.length}곳에 가기 어려워요`;
  } else if (cond.length > 0 && unknown.length > 0) {
    headline = `이 날 ${cond.length}곳은 확인이 필요하고, ${unknown.length}곳은 동반 조건이 공개돼 있지 않아요`;
  } else if (cond.length > 0) {
    headline = `이 날 ${cond.length}곳은 확인이 필요해요`;
  } else if (unknown.length > 0) {
    headline = `이 날 ${unknown.length}곳은 동반 조건이 공개돼 있지 않아요`;
  } else {
    headline =
      outdoor.length > 0
        ? `${names} 이 날 다 갈 수 있어요 — ${outdoor.length}곳은 야외 자리에서`
        : `${names} 이 날 다 갈 수 있어요`;
  }

  const subsetLine = trip.subset
    ? `이 날은 ${dogCallNames(trip.subset.names)}만 데려가면 ${trip.subset.level === 'ok' ? '다 갈 수 있어요' : '어려운 곳은 없어요'}`
    : null;

  return { level: trip.level, headline, subsetLine, hardIds: hard.map((entry) => entry.id) };
}
