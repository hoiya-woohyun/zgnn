import type { TCarrier, TDogProfile } from '../types';
import { judgeEligibility, type TEligibilityLevel } from './eligibility';
import type { TPetPolicy } from './petPolicy';

/**
 * 판정 레벨별 곳 수. 홈 종류 카드와 목록 머리가 **이 함수 하나로** 센다 — 홈은 ok+cond 합을
 * 이름표 없이 "7/26" 으로, 목록은 "26곳" 으로 보여 서로 다른 숫자처럼 읽혔다(지수·민준·D4).
 * 두 화면이 같은 레벨 이름("가능"·"확인")으로 같은 수를 말하게 하는 것이 요점이다.
 *
 * `needsIndoor` 는 판정 옵션이라 그대로 넘긴다 — 빼면 둘러보기 토글을 켠 뒤에도 수가 안 바뀐다.
 */
export const countByLevel = (
  places: readonly { policy: TPetPolicy }[],
  dog: TDogProfile,
  opts: { needsIndoor?: boolean } = {},
): Record<TEligibilityLevel, number> => {
  const counts: Record<TEligibilityLevel, number> = { ok: 0, cond: 0, unknown: 0, hard: 0 };
  for (const place of places) counts[judgeEligibility(dog, place.policy, opts).level]++;
  return counts;
};

/**
 * "이동가방이 있으면 N곳이 열린다" — 이동 수단 what-if(07 P2 → 08 T2.5).
 *
 * 이동 수단 없음(`none`) 프로필로 케이지 필수 식당을 보면 전부 "어려움 · 케이지 필요" 로 떠서,
 * 천 가방이 있는 사람도 "내 가방도 안 된다" 로 읽고 네이버로 나갔다(지수). 지금 결과 중 어려움인
 * 곳을 **이동가방으로 다시 판정해** 어려움에서 벗어나는 수를 센다. 판정 자체는 바꾸지 않는다 —
 * 화면은 이 수로 안내 한 줄과 프로필로 가는 길만 보인다.
 *
 * 대형견은 가방이어도 H4(케이지 필수 + 대형견)가 그대로라 0 이 나온다 — 그때는 안내하지 않는다(null).
 */
export const carrierWhatIf = (
  places: readonly { policy: TPetPolicy }[],
  dog: TDogProfile,
  opts: { needsIndoor?: boolean } = {},
): { carrier: TCarrier; opened: number } | null => {
  if (dog.carrier !== 'none') return null;
  const withBag: TDogProfile = { ...dog, carrier: 'bag' };
  let opened = 0;
  for (const place of places) {
    if (judgeEligibility(dog, place.policy, opts).level !== 'hard') continue;
    if (judgeEligibility(withBag, place.policy, opts).level !== 'hard') opened++;
  }
  return opened > 0 ? { carrier: 'bag', opened } : null;
};

/**
 * "갈 수 있는 곳" 이 한 곳도 없을 때의 차선 — 야외 자리가 열려 있어 어려움은 아닌 곳의 수(14 W261006.5).
 *
 * 30kg 보리로 식당을 보면 '갈 수 있어요' 가 0곳이고 28곳이 "실내는 케이지 필수라 대형견은 어려워요" 다.
 * 그 속에서 야외 자리로는 갈 수 있는 곳이 몇인지를 목록 머리가 한 줄로 말한다. 판정은 바꾸지 않는다.
 *
 * - 갈 수 있는 곳이 하나라도 있으면 null — 차선을 말할 때가 아니다.
 * - 이번 여행에 실내 자리가 꼭 필요하면(`needsIndoor`) null — 야외는 차선이 될 수 없다.
 * - 세는 것은 `outdoorFree` 이면서 어려움이 아닌 곳. 0 이면 null.
 */
export const outdoorFallback = (
  places: readonly { policy: TPetPolicy }[],
  dog: TDogProfile,
  opts: { needsIndoor?: boolean } = {},
): number | null => {
  if (opts.needsIndoor) return null;
  let outdoor = 0;
  for (const place of places) {
    const level = judgeEligibility(dog, place.policy, opts).level;
    if (level === 'ok') return null;
    if (place.policy.outdoorFree && level !== 'hard') outdoor++;
  }
  return outdoor > 0 ? outdoor : null;
};
