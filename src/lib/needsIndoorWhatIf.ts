/**
 * '실내 자리 필요' 가 이 장소의 판정 **등급을 바꿨나**(docs/todo/12 U0.3). 순수.
 *
 * `needsIndoor` 는 여행 정보라 퍼시스트 전역 값이고 모든 판정에 들어가는데, 그 칩은 식당·카페 목록에만 있다.
 * 한 번 켜고 잊으면 홈 숫자·지도·상세가 계속 달라지는데 화면이 이유를 말하지 않는다. 그래서 상세가
 * "이 값 때문에 달라졌다" 를 알 수 있어야 한다 — 같은 장소를 `needsIndoor: false` 로 **다시 판정해** 견준다.
 * 규칙을 새로 쓰지 않는다(`dogSubsetWhatIf` 와 같은 어법) — H4·H6·C4 가 바뀌어도 이 함수는 따라간다.
 *
 * 등급이 같으면 false 다. 근거 문장만 달라지는 경우(같은 cond 안에서)는 알릴 만한 차이가 아니다.
 */

import { judgeEligibility, type TEligibility } from './eligibility';
import type { TPetPolicy } from './petPolicy';
import type { TDogProfile } from '../types';

export function needsIndoorChangedLevel(
  dog: TDogProfile,
  policy: TPetPolicy,
  current: TEligibility,
  needsIndoor: boolean,
): boolean {
  if (!needsIndoor) return false;
  return judgeEligibility(dog, policy, { needsIndoor: false }).level !== current.level;
}
