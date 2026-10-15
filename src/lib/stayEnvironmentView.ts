import type { TStayEnvironment } from '../types';

/**
 * 숙소 환경 → 상세의 한 줄 조각들(10 F6). 순수. **아는 것만** 말한다 — null 은 빠진다.
 * 울타리 마당이면 "마당" 을 따로 말하지 않는다(같은 것을 두 번 말하면 둘로 읽힌다).
 * 객실 조건(`indoorRoom`·`furniture`)은 여기 없다 — 판정 카드가 `roomPhrases` 로 그린다.
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

/**
 * 객실 조건 → 판정 카드의 한 줄 조각들(14 W261013.11). 순수. **원문이 말한 것만** — 모르는 칸을 "적혀 있지 않아요" 로 채우지 않는다:
 * 숙소 거의 전부가 모르는 칸이라 카드마다 같은 부정문 두 줄이 서고, 판정 카드에서는 그 말이 "확인 필요" 처럼 읽힌다.
 */
export function roomPhrases(env: TStayEnvironment | undefined): string[] {
  if (!env) return [];
  const phrases: string[] = [];
  if (env.indoorRoom === true) phrases.push('객실 안에서 함께 지내요');
  if (env.indoorRoom === false) phrases.push('객실엔 못 들어가요(마당·테라스만)');
  if (env.furniture === true) phrases.push('침대·소파에 올라가도 돼요');
  if (env.furniture === false) phrases.push('침대·소파엔 못 올라가요');
  return phrases;
}

/** 검수 화면(`/admin`)의 '숙소 환경' 칸 — 사이트는 둘을 다른 자리에 그리지만 DB 칸은 하나라, 운영자는 한 줄로 대 본다. */
export const stayEnvironmentSummary = (env: TStayEnvironment | undefined): string =>
  [...environmentPhrases(env), ...roomPhrases(env)].join(' · ');
