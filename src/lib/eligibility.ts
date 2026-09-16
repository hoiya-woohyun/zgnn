/**
 * "우리 강아지가 여기 갈 수 있나" 판정.
 *
 * ✅ 판정 규칙은 여기서 조정한다. 아래 `RULES` 배열이 규칙의 전부이고, 순서가 곧
 *    화면에 보여줄 근거의 표시 순서(같은 레벨 안에서)다. 규칙은 **전부 평가**하고,
 *    그중 가장 센 레벨(`hard` > `unknown` > `cond` > `ok`)을 최종 결과로 삼는다.
 *    "먼저 걸린 규칙이 이긴다" 던 v0 설계와 달리, 한 문장에 여러 조건이 섞인 원문에서도
 *    가장 제약이 센 근거를 놓치지 않기 위해서다(→ 디자인 리뷰 §1).
 *
 * 파서(`petPolicy.ts`)가 이미 "지어내지 않는다" 원칙을 지키므로, 여기서도 숫자·조건이
 * 없으면 규칙을 걸지 않는다 — 없는 정보를 "괜찮을 것" 으로 읽지 않는다.
 */

import type { TCarrier, TDogProfile, TDogSize } from '../types';
import type { TPetPolicy, TPolicyTier } from './petPolicy';

export type TEligibilityLevel = 'ok' | 'cond' | 'unknown' | 'hard';
/** 근거 한 줄의 심각도. 'ok' 는 근거가 아니라 결과라서 여기엔 없다 — 어떤 규칙도 'ok' 근거를 만들지 않는다. */
export type TReasonLevel = Exclude<TEligibilityLevel, 'ok'> | 'info';

export type TReason = {
  level: TReasonLevel;
  text: string;
  /** 근거가 된 원문 문장(있으면). 상세 화면이 원문 카드에서 이 문장을 강조한다. */
  quote?: string;
};

export type TEligibility = {
  level: TEligibilityLevel;
  /** 심각도순(hard → cond → unknown → info)으로 정렬돼 있다. */
  reasons: TReason[];
  /** 우리 강아지 기준 요금 한 줄. `feeForDog` 와 같다(화면이 이름을 붙여 쓴다). */
  fee?: string;
};

type TJudgeOpts = {
  /** 실내 자리가 꼭 필요한지(여행 정보 — 프로필이 아니라 둘러보기 토글에서 온다). */
  needsIndoor?: boolean;
};

const LEVEL_ORDER: Record<TEligibilityLevel, number> = { ok: 0, cond: 1, unknown: 2, hard: 3 };

/** ok < cond < unknown < hard. 목록 정렬(가능 → 조건부 → 정보 없음 → 어려움)에 쓴다. */
export const compareEligibility = (a: TEligibilityLevel, b: TEligibilityLevel): number =>
  LEVEL_ORDER[a] - LEVEL_ORDER[b];

const REASON_ORDER: Record<TReasonLevel, number> = { hard: 0, cond: 1, unknown: 2, info: 3 };

/** 소형 <10kg · 중형 10~25kg(포함) · 대형 >25kg. 원문의 "대형견" 과 정확히 일치한다는 보장은 없어
 *  프로필 폼의 "크기 수정" 으로 사용자가 고칠 수 있다(`sizeOverride`). */
const SIZE_BOUNDARY_SMALL = 10;
const SIZE_BOUNDARY_MEDIUM = 25;

/** 빈 배열이면 0 — `Math.max()` 의 -Infinity 가 조용히 '소형' 으로 새는 것을 막는다. */
const maxWeightKg = (dog: TDogProfile): number =>
  dog.weightsKg.length > 0 ? Math.max(...dog.weightsKg) : 0;

export const dogSize = (dog: TDogProfile): TDogSize => {
  if (dog.sizeOverride) return dog.sizeOverride;
  const weight = maxWeightKg(dog);
  if (weight < SIZE_BOUNDARY_SMALL) return 'small';
  if (weight <= SIZE_BOUNDARY_MEDIUM) return 'medium';
  return 'large';
};

/** tier 의 무게 조건을 강아지가 만족하는지. 무게 조건이 없는 tier(마릿수만 말함)는 항상 만족한다. */
const fitsTierWeight = (tier: TPolicyTier, weightKg: number): boolean => {
  if (tier.maxWeightKg === undefined) return true;
  return tier.weightInclusive ? weightKg <= tier.maxWeightKg : weightKg < tier.maxWeightKg;
};

/** "20kg 미만" 처럼 tier 의 무게 조건을 문구로. 무게 조건이 없으면 undefined. */
const weightBoundLabel = (tier: TPolicyTier): string | undefined =>
  tier.maxWeightKg === undefined ? undefined : `${tier.maxWeightKg}kg ${tier.weightInclusive ? '이하' : '미만'}`;

/** "20kg 미만은" / "5kg 이하는" — 받침 유무로 조사가 갈린다(미만: ㄴ받침 → 은, 이하: 모음 → 는). */
const weightBoundTopic = (tier: TPolicyTier): string | undefined => {
  const label = weightBoundLabel(tier);
  return label === undefined ? undefined : `${label}${tier.weightInclusive ? '는' : '은'}`;
};

// ─────────────────────────────────────────────────────────────────────────────
// 규칙 테이블 — 순서 = 표시 순서(같은 레벨 안에서)
// ─────────────────────────────────────────────────────────────────────────────

type TRule = (dog: TDogProfile, policy: TPetPolicy, opts: TJudgeOpts) => TReason | null;

/** H1: 계단식 무게 조건이 있는데, 우리 강아지 최대 몸무게가 그 어느 칸에도 못 들어간다. */
const ruleWeightOverLimit: TRule = (dog, policy) => {
  const weightTiers = policy.tiers.filter((t) => t.maxWeightKg !== undefined);
  if (weightTiers.length === 0) return null;
  const weight = maxWeightKg(dog);
  if (weightTiers.some((t) => fitsTierWeight(t, weight))) return null;

  // 문구엔 원문이 제시한 것 중 가장 큰 상한을 보여준다.
  const widest = weightTiers.reduce((a, b) => ((b.maxWeightKg ?? 0) > (a.maxWeightKg ?? 0) ? b : a));
  return { level: 'hard', text: `${weightBoundLabel(widest)}만 가능해요`, quote: widest.source };
};

/**
 * H2: 무게로는 들어가는 칸이 있지만, 그 칸의 마릿수 상한보다 우리 강아지 수가 많다.
 * 무게가 맞는 tier 가 여럿이면(계단식이 아니라 서로 다른 문장으로 나온 경우) 마릿수 상한이
 * 가장 큰(가장 느슨한) tier 를 기준으로 삼는다 — 근거 없이 불리하게 해석하지 않는다.
 * 마릿수 상한이 없는 tier(무게만 말하는 tier)는 마릿수 제한이 없는 것으로 본다.
 */
const ruleTooManyForWeight: TRule = (dog, policy) => {
  const weight = maxWeightKg(dog);
  const fitting = policy.tiers.filter((t) => fitsTierWeight(t, weight));
  if (fitting.length === 0) return null; // 이 경우는 ruleWeightOverLimit(H1) 이 담당

  const selected = fitting.reduce((a, b) => ((b.maxDogs ?? Infinity) > (a.maxDogs ?? Infinity) ? b : a));
  if (selected.maxDogs === undefined) return null;
  if (selected.maxDogs >= dog.weightsKg.length) return null;

  const topic = weightBoundTopic(selected);
  const text = topic ? `${topic} ${selected.maxDogs}마리까지예요` : `${selected.maxDogs}마리까지예요`;
  return { level: 'hard', text, quote: selected.source };
};

/** H3: "소형견만" 인데 우리 강아지는 소형이 아니다. */
const ruleSmallOnly: TRule = (dog, policy) => {
  if (!policy.smallDogOnly) return null;
  if (dogSize(dog) === 'small') return null;
  return { level: 'hard', text: '소형견만 가능해요', quote: policy.sources.smallDogOnly };
};

/**
 * H4: 실내가 케이지 필수인데 대형견이고 케이지가 없다. 야외 자리가 열려 있으면(outdoorFree)
 * 아예 어려움은 아니고 "야외는 가능" 으로 낮춘다 — 단, 이번 여행에 실내가 꼭 필요하면(C4 와 같은
 * 기준) 야외 자리는 답이 아니므로 어려움이다.
 */
const ruleLargeNeedsCage: TRule = (dog, policy, opts) => {
  if (policy.indoor !== 'cage') return null;
  if (dogSize(dog) !== 'large') return null;
  if (dog.carrier === 'cage') return null;
  if (policy.outdoorFree) {
    const text = '실내는 케이지 필수라 대형견은 야외 자리만 가능해요';
    return opts.needsIndoor
      ? { level: 'hard', text, quote: policy.sources.indoor }
      : { level: 'cond', text, quote: policy.sources.indoor };
  }
  return { level: 'hard', text: '실내는 케이지 필수라 대형견은 어려워요', quote: policy.sources.indoor };
};

/**
 * H5: 실내가 케이지 필수인데 아무 이동 수단도 없고, 야외 자리도 없다.
 * 대형견이면 H4 가 같은 문장을 근거로 이미 어려움을 냈으므로 같은 말을 반복하지 않는다.
 */
const ruleNoCarrierNoOutdoor: TRule = (dog, policy) => {
  if (policy.indoor !== 'cage') return null;
  if (dog.carrier !== 'none') return null;
  if (policy.outdoorFree) return null; // ruleNoCarrierOutdoorFree(C4) 가 담당
  if (dogSize(dog) === 'large') return null; // ruleLargeNeedsCage(H4) 가 담당
  return { level: 'hard', text: '케이지 동반시에만 가능해요', quote: policy.sources.indoor };
};

/** H6: 야외 자리만 있는 곳인데 이번 여행은 실내 자리가 꼭 필요하다. */
const ruleOutdoorOnlyButNeedsIndoor: TRule = (_dog, policy, opts) => {
  if (policy.indoor !== 'outdoorOnly') return null;
  if (!opts.needsIndoor) return null; // ruleOutdoorOnly(C1) 가 담당
  return { level: 'hard', text: '야외 자리만 가능해요', quote: policy.sources.indoor };
};

/** C1: 야외 자리만 있는 곳. 실내가 꼭 필요하지 않으면 조건부(야외석은 된다). */
const ruleOutdoorOnly: TRule = (_dog, policy, opts) => {
  if (policy.indoor !== 'outdoorOnly') return null;
  if (opts.needsIndoor) return null;
  return { level: 'cond', text: '야외 자리만 가능해요', quote: policy.sources.indoor };
};

/** C2: 케이지 필수인 곳에 이동가방을 들고 간다. 슬링백을 케이지로 착각하지 않게 확인을 권한다. */
const ruleBagAtCagePlace: TRule = (dog, policy) => {
  if (policy.indoor !== 'cage') return null;
  if (dog.carrier !== 'bag') return null;
  return {
    level: 'cond',
    text: '케이지라고 적혀 있어요 — 이동가방도 되는지 확인해 주세요',
    quote: policy.sources.indoor,
  };
};

/** 유모차 뒤 16자 안에 '불가' 가 없을 때만 허용으로 읽는다(petPolicy.ts 의 NOT_DENIED 와 같은 어법). */
const STROLLER_ALLOWED = /유모차(?![^.\n]{0,16}불가)/;

/** C3: 케이지 필수인 곳에 유모차를 들고 간다. 원문이 유모차를 직접 허용한 게 아니면 확인을 권한다. */
const ruleStrollerAtCagePlace: TRule = (dog, policy) => {
  if (policy.indoor !== 'cage') return null;
  if (dog.carrier !== 'stroller') return null;
  // 원문이 유모차를 허용으로 언급했다면 이미 된다. '유모차 불가' 처럼 부정이 붙은 문장은 허용이 아니다.
  if (policy.sources.indoor && STROLLER_ALLOWED.test(policy.sources.indoor)) return null;
  return {
    level: 'cond',
    text: '케이지라고 적혀 있어요 — 유모차도 되는지 확인해 주세요',
    quote: policy.sources.indoor,
  };
};

/** C4: 케이지 필수인 곳에 아무 이동 수단도 없지만, 야외 자리는 자유롭다. */
const ruleNoCarrierOutdoorFree: TRule = (dog, policy, opts) => {
  if (policy.indoor !== 'cage') return null;
  if (dog.carrier !== 'none') return null;
  if (!policy.outdoorFree) return null; // ruleNoCarrierNoOutdoor(H5) 가 담당
  const text = '실내는 케이지, 야외는 자유예요';
  return opts.needsIndoor
    ? { level: 'hard', text, quote: policy.sources.indoor }
    : { level: 'cond', text, quote: policy.sources.indoor };
};

/**
 * C5: 대형견인데 원문에 대형견 가능 문구가 없다. 무게·마릿수 계단식 조건이 이미 있으면(tiers)
 * 그 조건이 실제 판정을 맡으므로 이 규칙은 물러난다. 케이지 필수 + 대형견 조합은 H4 가 이미
 * 담당하므로 같은 말을 두 번 하지 않는다.
 */
const ruleLargeDogUnmentioned: TRule = (dog, policy) => {
  if (dogSize(dog) !== 'large') return null;
  if (policy.largeDogOk) return null;
  if (policy.tiers.length > 0) return null;
  const handledByH4 = policy.indoor === 'cage' && dog.carrier !== 'cage';
  if (handledByH4) return null;
  return { level: 'cond', text: '대형견 언급이 없어요 — 확인해 주세요', quote: policy.sources.largeDogOk };
};

/** C6: 방문 전 전화 확인이 필요하다고 적혀 있다. */
const ruleCallFirst: TRule = (_dog, policy) => {
  if (!policy.callFirst) return null;
  return { level: 'cond', text: '방문 전 전화 확인이 필요해요', quote: policy.sources.callFirst };
};

/** U1: 원문에 이용 조건 자체가 없다. */
const ruleNoInfo: TRule = (_dog, policy) => {
  if (!policy.noInfo) return null;
  return { level: 'unknown', text: '이용 조건이 적혀 있지 않아요', quote: policy.sources.noInfo };
};

/**
 * U1 보강: "정보 없음" 이라 적어 놓고도 "대형견도 가능!!" 처럼 힌트가 붙은 곳이 있다(맘앤도그).
 * 판정을 바꾸진 않지만(여전히 unknown) 힌트를 info 로 남겨 상세에서 보여준다.
 */
const ruleNoInfoHint: TRule = (_dog, policy) => {
  if (!policy.noInfo) return null;
  if (!policy.largeDogOk) return null;
  return { level: 'info', text: '원문에 대형견도 가능하다는 문구가 있어요', quote: policy.sources.largeDogOk };
};

const RULES: TRule[] = [
  ruleWeightOverLimit, // H1
  ruleTooManyForWeight, // H2
  ruleSmallOnly, // H3
  ruleLargeNeedsCage, // H4
  ruleNoCarrierNoOutdoor, // H5
  ruleOutdoorOnlyButNeedsIndoor, // H6
  ruleOutdoorOnly, // C1
  ruleBagAtCagePlace, // C2
  ruleStrollerAtCagePlace, // C3
  ruleNoCarrierOutdoorFree, // C4
  ruleLargeDogUnmentioned, // C5
  ruleCallFirst, // C6
  ruleNoInfo, // U1
  ruleNoInfoHint, // U1 보강
];

/**
 * 우리 강아지 기준 요금 한 줄. `feeLines` 중 최대 몸무게가 들어가는 구간("6~10kg 1.5만원")을
 * 찾는다. 들어가는 구간이 없으면 구간이 아닌 요금 줄("1마리당 1만원")로 물러나고, 그마저 없으면
 * 비운다 — 28kg 강아지에게 "1~5kg 1만원" 을 이름까지 붙여 확정된 숫자처럼 보여주지 않기 위해서다.
 * 이름을 붙이는 건 화면(또는 `judgeEligibility` 의 info reason) 몫이다.
 */
export const feeForDog = (policy: TPetPolicy, dog: TDogProfile): string | undefined => {
  if (policy.feeFree) return '추가 요금 없음';
  if (policy.feeLines.length === 0) return undefined;

  const weight = maxWeightKg(dog);
  const RANGE_RE = /(\d+)\s*~\s*(\d+)\s*kg/;
  const matched = policy.feeLines.find((line) => {
    const m = RANGE_RE.exec(line);
    if (!m) return false;
    return weight >= Number(m[1]) && weight <= Number(m[2]);
  });
  return matched ?? policy.feeLines.find((line) => !RANGE_RE.test(line));
};

export const judgeEligibility = (
  dog: TDogProfile,
  policy: TPetPolicy,
  opts: TJudgeOpts = {},
): TEligibility => {
  const reasons = RULES.map((rule) => rule(dog, policy, opts)).filter((r): r is TReason => r !== null);

  const fee = feeForDog(policy, dog);
  if (fee) reasons.push({ level: 'info', text: `${dog.name} ${fee}` });

  // Array#sort 는 안정 정렬이라 같은 레벨 안에서는 RULES 순서(표시 순서)가 그대로 유지된다.
  reasons.sort((a, b) => REASON_ORDER[a.level] - REASON_ORDER[b.level]);

  let level: TEligibilityLevel;
  if (reasons.some((r) => r.level === 'hard')) level = 'hard';
  else if (policy.noInfo) level = 'unknown';
  else if (reasons.some((r) => r.level === 'cond')) level = 'cond';
  else level = 'ok';

  return { level, reasons, fee };
};

// 화면(폼)에서 이동 수단 4택을 그릴 때 쓰는 라벨·설명. 여기 두는 이유는 판정 규칙 문구와
// 짝을 맞춰 관리하기 위해서다 — 규칙 문구가 바뀌면 이 설명도 같이 봐야 한다.
export const CARRIER_LABELS: Record<TCarrier, { label: string; hint: string }> = {
  none: { label: '없어요', hint: '케이지·이동가방·유모차 없이 안고 다녀요' },
  bag: { label: '이동가방·슬링백', hint: '천 가방이나 슬링백에 넣어 다녀요' },
  cage: { label: '케이지', hint: '딱딱한 이동장(하드 케이지)을 써요' },
  stroller: { label: '유모차', hint: '반려동물용 유모차를 밀고 다녀요' },
};
