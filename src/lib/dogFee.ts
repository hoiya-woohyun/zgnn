/**
 * "우리 강아지 기준 요금 한 줄". 목록 카드·상세의 info 근거·설정이 **같은 문자열**을 쓴다.
 *
 * 원칙은 파서와 같다 — **숫자를 지어내지 않는다.** 마릿수만큼 곱해도 되는 것이 원문에서 확실할
 * 때만 곱한다: "1마리당 3만원" 같은 마리당 단일 금액, 또는 모든 마리가 각자 들어가는 무게 구간의
 * 단일 금액. 범위 금액("1-2만원")·단위가 불명한 금액("5만원")·청소비 같은 줄은 곱하지 않고
 * "원문 요금 · {원문 줄}" 로 그대로 보여준다. **이름은 곱셈이 성립했을 때만 붙인다** —
 * "대장이와 초코 · 청소비 5만원" 은 우리가 낼 돈이 확정된 것처럼 읽혔다(원문 줄일 뿐인데).
 *
 * 줄을 고르는 순서는 예전 `feeForDog` 그대로다: 최대 몸무게가 들어가는 구간 줄 → 구간이 아닌 첫
 * 줄 → 없으면 비운다. 28kg 강아지에게 "1~5kg 1만원" 을 이름까지 붙여 확정된 숫자처럼 보여주지
 * 않기 위해서다.
 */

import type { TDogProfile, TFeeRule } from '../types';
import { maxWeightKg } from './dogProfile';
import { dogCallNames, withJosa } from './korean';
import type { TPetPolicy } from './petPolicy';

/** 구간 줄 판별 — "1~5kg 1만원". 예전 `feeForDog` 와 같은 정규식이라 줄 선택 결과가 바뀌지 않는다. */
const RANGE_RE = /(\d+)\s*~\s*(\d+)\s*kg/;
/** 구간 + 단일 금액만 있는 줄. 뒤에 "추가" 가 붙어도 마리당임은 확실하다. */
const RANGE_AMOUNT_RE = /^\(?\s*(\d+)\s*~\s*(\d+)\s*kg\s*(\d+(?:\.\d+)?)\s*만\s*원\s*(?:추가)?\s*\)?$/;
/** 마리당 단일 금액 — "1마리당 3만원". "1마리당 1-2만원" 처럼 범위면 걸리지 않는다. */
const PER_DOG_RE = /^\(?\s*1\s*마리\s*당\s*(\d+(?:\.\d+)?)\s*만\s*원\s*(?:추가)?\s*\)?$/;

/**
 * 마릿수·몸무게 중 하나만 맞아도 바뀌는 요금 — "(2마리 또는 10kg 이상 4만원)". 마리당 줄 옆에서만 쓴다(`withAlternative`).
 * 1: 마릿수 · 2: kg 하한 · 3: 금액(만원).
 */
const COUNT_OR_KG_RE = /^(\d+)\s*마리\s*(?:이상\s*)?(?:또는|이거나)\s*(\d+(?:\.\d+)?)\s*kg\s*이상\s*(\d+(?:\.\d+)?)\s*만\s*원\s*(?:추가)?$/;

/** 앞뒤 괄호·공백을 벗긴 원문 줄. "(2만원 추가)" → "2만원 추가". */
const stripLine = (line: string): string => line.trim().replace(/^\(\s*/, '').replace(/\s*\)$/, '');

/** 만원 단위 문자열 → 원. 소수(1.5만원)는 정수 원으로 올려 부동소수 합산 오차를 피한다. */
const manwonToWon = (manwon: string): number => Math.round(Number(manwon) * 10000);

/** 15000 → "1.5만원", 60000 → "6만원", 5000 → "5,000원". */
export const formatWon = (won: number): string => {
  if (won < 10000) return `${won.toLocaleString('ko-KR')}원`;
  return `${Math.round(won / 1000) / 10}만원`;
};

const inRange = (line: string, weightKg: number): boolean => {
  const m = RANGE_RE.exec(line);
  return m !== null && weightKg >= Number(m[1]) && weightKg <= Number(m[2]);
};

/**
 * 곱셈에 쓰지 않은 다른 요금 줄이 마릿수·무게 조건을 말하면 곱셈이 안전하지 않다.
 * 캄(Kalm) "1마리당 3만원. (2마리 또는 10kg 이상 4만원)" — 첫 줄만 보고 2마리를 6만원으로 곱하면
 * 원문(4만원)과 반대되는 숫자를 확정 문장으로 내놓게 된다. 이런 곳은 사람도 원문을 다 읽어야
 * 판단할 수 있으므로 줄 전부를 그대로 보여주는 쪽으로 물러난다.
 */
const hasUnusedCondition = (feeLines: string[], used: string[]): boolean =>
  feeLines.some((line) => !used.includes(line) && /마리|kg/i.test(line));

/**
 * 모든 마리가 각자 구간에 들어가고 그 구간의 금액이 단일값이면 합산 문구. 한 마리라도 구간
 * 밖이거나 금액이 확실하지 않으면 undefined — 호출부가 곱하지 않는 표기로 물러난다.
 */
const sumByWeightTiers = (policy: TPetPolicy, dog: TDogProfile, names: string): string | undefined => {
  if (policy.maxDogs !== undefined && dog.dogs.length > policy.maxDogs) return undefined;
  const rangeLines = policy.feeLines.filter((line) => RANGE_RE.test(line));
  const picked = dog.dogs.map((d) => rangeLines.find((line) => inRange(line, d.weightKg)));
  if (picked.some((line) => line === undefined)) return undefined;
  // 구간 줄들은 한 요금표의 칸이라 "안 쓴 칸" 이 있어도 조건이 아니다 — 구간 밖의 줄만 본다.
  if (hasUnusedCondition(policy.feeLines, rangeLines)) return undefined;
  const parsed = (picked as string[]).map((line) => RANGE_AMOUNT_RE.exec(line));
  if (parsed.some((m) => m === null)) return undefined;

  const total = parsed.reduce((sum, m) => sum + manwonToWon((m as RegExpExecArray)[3]), 0);
  if (dog.dogs.length === 1) {
    const m = parsed[0] as RegExpExecArray;
    return `${withJosa(names, '은/는')} ${formatWon(total)} (${m[1]}~${m[2]}kg)`;
  }
  // 쓰인 구간만, feeLines 순서로 — 강아지 행 순서를 바꿔도 문구가 같아야 한다.
  const used = rangeLines.filter((line) => picked.includes(line)).map(stripLine);
  return `${withJosa(names, '은/는')} ${formatWon(total)} (${used.join(' · ')})`;
};

/** "1마리당 3만원" × 마릿수. 마릿수 상한을 넘으면 그 요금이 우리에게 적용된다고 볼 수 없어 곱하지 않는다. */
const multiplyPerDog = (line: string, policy: TPetPolicy, dog: TDogProfile, names: string): string | undefined => {
  const m = PER_DOG_RE.exec(line);
  if (!m) return undefined;
  const n = dog.dogs.length;
  if (policy.maxDogs !== undefined && n > policy.maxDogs) return undefined;
  if (hasUnusedCondition(policy.feeLines, [line])) return undefined;
  const each = manwonToWon(m[1]);
  if (n === 1) return `${withJosa(names, '은/는')} ${formatWon(each)}`;
  return `${withJosa(names, '은/는')} ${formatWon(each * n)} (1마리당 ${formatWon(each)})`;
};

/**
 * 캄(Kalm) "1마리당 3만원. (2마리 또는 10kg 이상 4만원)" — 기본 줄 하나와 **바꿔 붙는** 줄 하나. 둘째 줄은 마리당이 아니라
 * 그 조건일 때의 요금이다("2마리" 가 조건이니 2마리에 4만원이지 8만원이 아니다). 그래서 곱하지 않고 고른다:
 * - 마릿수가 조건 이상이거나 한 마리라도 kg 하한 이상 → 둘째 줄 금액 그대로.
 * - 아니면(조건 아래 한 마리) → 첫 줄 금액.
 * 줄이 정확히 이 둘이 아니거나, 마릿수가 조건 마릿수를 넘으면(3마리 — 원문이 말하지 않는다) 물러난다.
 */
const withAlternative = (policy: TPetPolicy, dog: TDogProfile, names: string): string | undefined => {
  if (policy.feeLines.length !== 2) return undefined;
  const [base, alt] = policy.feeLines.map(stripLine);
  const each = PER_DOG_RE.exec(base);
  const cond = COUNT_OR_KG_RE.exec(alt);
  if (!each || !cond) return undefined;
  const n = dog.dogs.length;
  const count = Number(cond[1]);
  if (policy.maxDogs !== undefined && n > policy.maxDogs) return undefined;
  if (n > count) return undefined;
  const who = withJosa(names, '은/는');
  if (n === count || dog.dogs.some((d) => d.weightKg >= Number(cond[2]))) return `${who} ${formatWon(manwonToWon(cond[3]))} (${alt})`;
  if (n > 1) return undefined;
  return `${who} ${formatWon(manwonToWon(each[1]))} (${base})`;
};

/**
 * 요금 구조(`feeRules`, AI 가 뽑은 칸)로 계산한다 — 줄 모양을 정규식으로 읽지 않는다(ADR-017 v5).
 * 원칙은 위와 같다: **확정할 수 없으면 undefined** 를 돌려주고 호출부가 "원문 요금 · …" 으로 물러난다.
 *
 * - 칸으로 표현 못 한 줄(`amountWon: null`)이 하나라도 있으면 물러난다 — 그 줄이 우리에게 붙는지 모른다(`hasUnusedCondition` 과 같은 이유).
 * - 마리마다 몸무게에 맞는 `perDog` 줄을 고른다. 몸무게가 어느 줄에도 안 들어가면(19kg 이하 / 20kg 이상 사이의 19.5kg) 물러난다.
 *   `fromDog` 보다 앞 순번의 마리는 0원이다("두 마리부터 1마리당 2만원" 의 첫 마리) — 몸무게가 안 맞는 것과 다르다.
 *   한 마리에게 줄이 둘 이상 맞으면 가장 늦게 시작하는 줄(`fromDog` 가 큰 쪽)을 쓰고, 시작 순번까지 같으면 물러난다.
 *   `fromDog` 와 몸무게 조건이 섞이면 물러난다 — "몇째" 가 행 순서라 합계가 순서에 따라 달라진다.
 * - `flat`(청소비)은 조건이 맞으면 한 번 더한다.
 * - 1박마다 붙는 줄과 한 번 붙는 줄이 섞이면 박 수를 몰라 합칠 수 없다 — 물러난다.
 */
const sumByRules = (rules: TFeeRule[], policy: TPetPolicy, dog: TDogProfile, names: string): string | undefined => {
  if (policy.maxDogs !== undefined && dog.dogs.length > policy.maxDogs) return undefined;
  if (rules.some((r) => r.amountWon === null)) return undefined;
  const fits = (r: TFeeRule, kg: number) => (r.minKg === null || kg >= r.minKg) && (r.maxKg === null || kg <= r.maxKg);
  const perDog = rules.filter((r) => r.basis === 'perDog');
  // "몇째 마리" 는 프로필 행 순서일 뿐이다 — 몸무게 조건과 섞이면 같은 두 마리라도 행 순서에 따라 합계가 달라진다([25kg, 5kg] 와 [5kg, 25kg]).
  const nth = perDog.some((r) => (r.fromDog ?? 1) > 1);
  if (nth && perDog.some((r) => r.minKg !== null || r.maxKg !== null)) return undefined;

  const used = new Set<TFeeRule>();
  let total = 0;
  for (const [i, d] of dog.dogs.entries()) {
    if (perDog.length === 0) break;
    const byWeight = perDog.filter((r) => fits(r, d.weightKg));
    if (byWeight.length === 0) return undefined;
    // 여러 줄이 맞으면 **가장 늦게 시작하는 줄**이 그 마리의 요금이다("첫 마리 3만원 + 2마리부터 2만원" 의 둘째 마리는 2만원).
    // 시작 순번까지 같으면 어느 쪽인지 모른다.
    const applies = byWeight.filter((r) => (r.fromDog ?? 1) <= i + 1).sort((a, b) => (b.fromDog ?? 1) - (a.fromDog ?? 1));
    if (applies.length > 1 && (applies[0].fromDog ?? 1) === (applies[1].fromDog ?? 1)) return undefined;
    if (applies.length > 0) {
      used.add(applies[0]);
      total += applies[0].amountWon as number;
    }
  }
  for (const r of rules) {
    if (r.basis !== 'flat') continue;
    if (dog.dogs.length < (r.fromDog ?? 1)) continue;
    if ((r.minKg !== null || r.maxKg !== null) && !dog.dogs.some((d) => fits(r, d.weightKg))) continue;
    used.add(r);
    total += r.amountWon as number;
  }

  // 표기는 요금 표 순서로 — 강아지 행 순서를 바꿔도 문구가 같아야 한다.
  const shown = rules.filter((r) => used.has(r));
  if (new Set(shown.map((r) => r.perNight)).size > 1) return undefined;
  const who = withJosa(names, '은/는');
  const all = rules.map((r) => r.label).join(' · ');
  if (shown.length === 0) return `${who} 추가 요금 없음 (${all})`;
  const amount = `${shown[0].perNight ? '1박 ' : ''}${formatWon(total)}`;
  // 조건 없는 마리당 한 줄 × 한 마리는 괄호가 같은 말을 되풀이할 뿐이다("두부는 3만원 (1마리당 3만원)").
  const only = shown[0];
  const plain =
    dog.dogs.length === 1 && rules.length === 1 && only.minKg === null && only.maxKg === null && only.fromDog === null;
  return plain ? `${who} ${amount}` : `${who} ${amount} (${shown.map((r) => r.label).join(' · ')})`;
};

export const formatDogFee = (policy: TPetPolicy, dog: TDogProfile): string | undefined => {
  const names = dogCallNames(dog.dogs.map((d) => d.name));
  if (policy.feeFree) return `${withJosa(names, '은/는')} 추가 요금 없음`;
  if (policy.feeLines.length === 0) return undefined;

  if (policy.feeRules?.length) {
    const byRules = sumByRules(policy.feeRules, policy, dog, names);
    if (byRules) return byRules;
    // 구조가 "또는" 줄을 칸으로 못 담는다(`amountWon: null`) — 줄 모양이 캄과 같으면 그 길로 고른다.
    const alternative = withAlternative(policy, dog, names);
    if (alternative) return alternative;
    // 이름을 붙이지 않는다 — 곱하지 못한 줄은 "우리 강아지 기준" 이 아니라 원문을 옮긴 것이다.
    return `원문 요금 · ${policy.feeLines.map(stripLine).join(' · ')}`;
  }

  const alternative = withAlternative(policy, dog, names);
  if (alternative) return alternative;

  const summed = sumByWeightTiers(policy, dog, names);
  if (summed) return summed;

  // 예전 `feeForDog` 의 선택 규칙: 최대 몸무게가 들어가는 구간 줄 → 구간이 아닌 첫 줄.
  const weight = maxWeightKg(dog);
  const line =
    policy.feeLines.find((candidate) => inRange(candidate, weight)) ??
    policy.feeLines.find((l) => !RANGE_RE.test(l));
  if (!line) return undefined;

  const multiplied = multiplyPerDog(line, policy, dog, names);
  if (multiplied) return multiplied;

  // 곱하지 않을 때: 다른 줄에 조건이 걸려 있으면 한 줄만 보여줘도 반쪽 정보라 그 줄들도 함께 보여준다.
  // 단, 우리 몸무게가 안 들어가는 구간 줄은 이미 해당 없음이 확인된 칸이라 뺀다(원문 순서 유지).
  const shown = policy.feeLines.filter(
    (candidate) => candidate === line || (/마리|kg/i.test(candidate) && !RANGE_RE.test(candidate)),
  );
  // 이름을 붙이지 않는다 — 곱하지 못한 줄은 "우리 강아지 기준" 이 아니라 원문을 옮긴 것이다.
  return `원문 요금 · ${shown.map(stripLine).join(' · ')}`;
};
