import type { TStayEnvironment } from '../types';

/**
 * 숙소 환경 → 상세의 한 줄 조각들(10 F6). 순수. **아는 것만** 말한다 — null 은 빠진다.
 * 울타리 마당이면 "마당" 을 따로 말하지 않는다(같은 것을 두 번 말하면 둘로 읽힌다).
 */
export function environmentPhrases(env: TStayEnvironment | undefined): string[] {
  if (!env) return [];
  const phrases: string[] = [];
  if (env.standalone === true) phrases.push('독채');
  if (env.fencedYard === true) phrases.push('울타리 있는 마당');
  else if (env.yard === true) phrases.push('마당');
  if (env.stairs === true) phrases.push('계단·복층 있음');
  if (env.stairs === false) phrases.push('계단 없음');
  return phrases;
}
