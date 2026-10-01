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
import { formatDogFee } from './dogFee';
import { maxWeightKg } from './dogProfile';
import { dogCallName, dogCallNames, josa, withJosa } from './korean';
import type { TPetPolicy, TPolicyTier } from './petPolicy';

export type TEligibilityLevel = 'ok' | 'cond' | 'unknown' | 'hard';
/** 근거 한 줄의 심각도. 'ok' 는 근거가 아니라 결과라서 여기엔 없다 — 어떤 규칙도 'ok' 근거를 만들지 않는다. */
export type TReasonLevel = Exclude<TEligibilityLevel, 'ok'> | 'info';

export type TReason = {
  level: TReasonLevel;
  text: string;
  /** 근거가 된 원문 문장(있으면). 상세 화면이 원문 카드에서 이 문장을 강조한다. */
  quote?: string;
  /** 이 근거를 낸 규칙 ID(`RULES` 주석의 'H1'·'C1' … , 요금은 'I1'). 머리글이 근거를 따를지 가를 때 쓴다(`headlineFor`). */
  rule?: string;
};

export type TEligibility = {
  level: TEligibilityLevel;
  /** 심각도순(hard → cond → unknown → info)으로 정렬돼 있다. */
  reasons: TReason[];
  /** 우리 강아지 기준 요금 한 줄("두부는 1만원 (1~5kg)"). `formatDogFee` 와 같고 이름까지 붙어 있어 그대로 출력한다. */
  fee?: string;
};

type TJudgeOpts = {
  /** 실내 자리가 꼭 필요한지(여행 정보 — 프로필이 아니라 둘러보기 토글에서 온다). */
  needsIndoor?: boolean;
};

const LEVEL_ORDER: Record<TEligibilityLevel, number> = { ok: 0, cond: 1, unknown: 2, hard: 3 };

/** ok < cond < unknown < hard. 목록 정렬(갈 수 있어요 → 확인이 필요해요 → 정보가 없어요 → 이용하기 어려워요)에 쓴다. */
export const compareEligibility = (a: TEligibilityLevel, b: TEligibilityLevel): number =>
  LEVEL_ORDER[a] - LEVEL_ORDER[b];

const REASON_ORDER: Record<TReasonLevel, number> = { hard: 0, cond: 1, unknown: 2, info: 3 };

/** 소형 <10kg · 중형 10~25kg(포함) · 대형 >25kg. 원문의 "대형견" 과 정확히 일치한다는 보장은 없어
 *  프로필 폼의 "크기 수정" 으로 사용자가 고칠 수 있다(`sizeOverride`). */
const SIZE_BOUNDARY_SMALL = 10;
const SIZE_BOUNDARY_MEDIUM = 25;

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

/** H0: 원문이 반려견 동반 자체를 막는다고 적혀 있다("애견동반은 안됩니다"). 강아지 조건과 무관하게 어려움. */
const ruleNotAllowed: TRule = (_dog, policy) => {
  if (!policy.notAllowed) return null;
  return { level: 'hard', text: '반려견 동반이 안 된다고 적혀 있어요', quote: policy.sources.notAllowed };
};

/**
 * H1: 계단식 무게 조건이 있는데, 우리 강아지 최대 몸무게가 그 어느 칸에도 못 들어간다.
 *
 * 문구에 **한도를 넘는 강아지만** 이름(몸무게)으로 적는다. "15kg 이하만 가능해요" 만으로는
 * 다두 보호자가 누구 얘기인지 몰랐다(민준 — 28kg·17kg). 넘지 않는 아이의 이름은 빼야
 * "그 아이만 두고 가면 되나" 를 스스로 판단할 수 있다.
 */
const ruleWeightOverLimit: TRule = (dog, policy) => {
  const weightTiers = policy.tiers.filter((t) => t.maxWeightKg !== undefined);
  if (weightTiers.length === 0) return null;
  const weight = maxWeightKg(dog);
  if (weightTiers.some((t) => fitsTierWeight(t, weight))) return null;

  // 문구엔 원문이 제시한 것 중 가장 큰 상한을 보여준다.
  const widest = weightTiers.reduce((a, b) => ((b.maxWeightKg ?? 0) > (a.maxWeightKg ?? 0) ? b : a));
  const over = dog.dogs.filter((d) => !weightTiers.some((t) => fitsTierWeight(t, d.weightKg)));
  const labels = over.map((d) => `${dogCallName(d.name)}(${d.weightKg}kg)`);
  // 조사는 괄호가 아니라 이름 끝 받침을 따른다 — "대장이(28kg)는".
  const subject =
    over.length === 1 ? `${labels[0]}${josa(dogCallName(over[0].name), '은/는')}` : `${labels.join('·')} 모두`;
  return { level: 'hard', text: `${subject} ${weightBoundLabel(widest)} 조건을 넘어요`, quote: widest.source };
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
  if (selected.maxDogs >= dog.dogs.length) return null;

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
 * H7: 원문이 대형견은 안 된다고 적었고(정규식 또는 AI `largeDogOk: false`) 우리 강아지가 대형이다.
 * 전에는 `largeDogOk` 가 참/거짓 한 칸이라 "불가" 가 "언급 없음" 과 같아져 C5(확인 필요)로 떨어졌다 — 원문과 반대 말이었다(todo/06 A-2).
 * 번호가 H7 인 것은 나중에 생겨서이고, 표시 순서는 크기 조건(H3) 옆이다.
 */
const ruleLargeDogNo: TRule = (dog, policy) => {
  if (!policy.largeDogNo) return null;
  if (dogSize(dog) !== 'large') return null;
  return { level: 'hard', text: '대형견은 어렵다고 적혀 있어요', quote: policy.sources.largeDogNo };
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

/** 요금 줄의 "10kg 이상 4만원" — 무게 하한이 붙은 요금. 대형견을 따로 말하지 않아도 무게를 말한 것이다. */
const FEE_MIN_KG_RE = /(\d+)\s*kg\s*이상/;
/** 요금 줄의 "6~10kg 1.5만원" — 구간 상한(두 번째 숫자)만 쓴다. */
const FEE_RANGE_KG_RE = /\d+\s*~\s*(\d+)\s*kg/;

/**
 * C5: 대형견인데 원문에 대형견 가능 문구가 없다. 무게·마릿수 계단식 조건이 이미 있으면(tiers)
 * 그 조건이 실제 판정을 맡으므로 이 규칙은 물러난다. 케이지 필수 + 대형견 조합은 H4 가 이미
 * 담당하므로 같은 말을 두 번 하지 않는다.
 *
 * "대형견 언급이 없어요" 가 **틀린 말이 되는 두 경우**를 먼저 거른다(등급은 그대로):
 * - 정보 없음 — 원문에 조건 자체가 없는데 "대형견 언급" 을 꼬집으면 unknown 근거보다 먼저
 *   읽혀 엉뚱한 이유처럼 보였다. U1 이 말하게 물러난다.
 * - 요금 줄이 무게를 말함 — "10kg 이상 4만원" 이 있는데 "언급이 없다" 고 하면 원문과 반대다.
 *   구간 요금표("~10kg")만 있고 우리가 넘으면 "표가 N kg 까지만" 이라고 짚는다(07 U4, 솔숲펜션).
 */
const ruleLargeDogUnmentioned: TRule = (dog, policy) => {
  if (policy.noInfo) return null;
  if (dogSize(dog) !== 'large') return null;
  if (policy.largeDogOk) return null;
  if (policy.largeDogNo) return null; // H7 이 어려움으로 말한다
  if (policy.tiers.length > 0) return null;
  const handledByH4 = policy.indoor === 'cage' && dog.carrier !== 'cage';
  if (handledByH4) return null;

  const weight = maxWeightKg(dog);
  const minKgLine = policy.feeLines.find((line) => FEE_MIN_KG_RE.test(line));
  if (minKgLine) {
    const n = Number((FEE_MIN_KG_RE.exec(minKgLine) as RegExpExecArray)[1]);
    return { level: 'cond', text: `${n}kg 이상 요금이 적혀 있어요 — ${weight}kg 도 되는지 확인해 주세요` };
  }
  const rangeTops = policy.feeLines.flatMap((line) => {
    const m = FEE_RANGE_KG_RE.exec(line);
    return m ? [Number(m[1])] : [];
  });
  if (rangeTops.length > 0) {
    const top = Math.max(...rangeTops);
    if (weight > top) return { level: 'cond', text: `요금표가 ${top}kg 까지만 있어요 — 확인해 주세요` };
  }

  return { level: 'cond', text: '대형견 언급이 없어요 — 확인해 주세요', quote: policy.sources.largeDogOk };
};

/** C6: 방문 전 전화 확인이 필요하다고 적혀 있다. */
const ruleCallFirst: TRule = (_dog, policy) => {
  if (!policy.callFirst) return null;
  return { level: 'cond', text: '방문 전 전화 확인이 필요해요', quote: policy.sources.callFirst };
};

/**
 * C8: 예방접종을 마친 강아지만 받는다(AI `vaccineRequired`, ADR-017 v6). 프로필에 접종 칸이 없어 우리가 판단할 수 없으니 어려움이 아니라
 * 조건이다 — C6(전화 확인)과 같은 무게. 증명서를 요구하는 곳이 많아 문구가 "챙겨 가세요" 까지 말한다.
 */
const ruleVaccineRequired: TRule = (_dog, policy) => {
  if (!policy.vaccineRequired) return null;
  return { level: 'cond', text: '예방접종을 마친 강아지만 들어갈 수 있어요 — 접종 증명을 챙겨 주세요', quote: policy.sources.vaccineRequired };
};

/**
 * C7: 원문은 있는데 정규식도 AI 도 조건을 하나도 못 읽었다(`unread`). 전에는 규칙이 하나도 안 걸려 '갈 수 있어요' 였다 —
 * 읽지 못한 제한이 있을 수 있는 곳을 가장 좋은 답으로 보냈다(todo/06 A-1). 어려움은 아니다: 원문이 무엇을 막는지 모르니까.
 */
const ruleUnread: TRule = (_dog, policy) => {
  if (!policy.unread) return null;
  return { level: 'cond', text: '조건 문장을 자동으로 읽지 못했어요 — 원문을 확인해 주세요' };
};

/** U1: 원문에 동반 조건 자체가 없다. */
const ruleNoInfo: TRule = (_dog, policy) => {
  if (!policy.noInfo) return null;
  return { level: 'unknown', text: '동반 조건이 적혀 있지 않아요', quote: policy.sources.noInfo };
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

/** 규칙과 그 ID. ID 는 근거에 실려(`TReason.rule`) 화면이 "어느 규칙이 말했나" 를 문구 대신 ID 로 가른다. */
const RULES: [string, TRule][] = [
  ['H0', ruleNotAllowed],
  ['H1', ruleWeightOverLimit],
  ['H2', ruleTooManyForWeight],
  ['H3', ruleSmallOnly],
  ['H7', ruleLargeDogNo],
  ['H4', ruleLargeNeedsCage],
  ['H5', ruleNoCarrierNoOutdoor],
  ['H6', ruleOutdoorOnlyButNeedsIndoor],
  ['C1', ruleOutdoorOnly],
  ['C2', ruleBagAtCagePlace],
  ['C3', ruleStrollerAtCagePlace],
  ['C4', ruleNoCarrierOutdoorFree],
  ['C5', ruleLargeDogUnmentioned],
  ['C6', ruleCallFirst],
  ['C8', ruleVaccineRequired],
  ['C7', ruleUnread],
  ['U1', ruleNoInfo],
  ['U1 보강', ruleNoInfoHint],
];

export const judgeEligibility = (
  dog: TDogProfile,
  policy: TPetPolicy,
  opts: TJudgeOpts = {},
): TEligibility => {
  const reasons = RULES.flatMap(([id, rule]): TReason[] => {
    const reason = rule(dog, policy, opts);
    return reason ? [{ ...reason, rule: id }] : [];
  });

  let level: TEligibilityLevel;
  if (reasons.some((r) => r.level === 'hard')) level = 'hard';
  else if (policy.noInfo) level = 'unknown';
  else if (reasons.some((r) => r.level === 'cond')) level = 'cond';
  else level = 'ok';

  // 요금은 이름까지 붙은 완성 문장(`dogFee.ts`)이라 카드·상세가 같은 줄을 그대로 보여준다.
  // **어려움이면 요금을 싣지 않는다**(`fee` 도, 요금 info 근거도) — 못 간다는 곳 밑에 "대장이와
  // 초코 · 청소비 5만원" 이 붙으면 우리가 낼 돈으로 읽힌다(민준, 그리너리빌리지).
  const fee = level === 'hard' ? undefined : formatDogFee(policy, dog);
  if (fee) reasons.push({ level: 'info', text: fee, rule: 'I1' });

  // Array#sort 는 안정 정렬이라 같은 레벨 안에서는 RULES 순서(표시 순서)가 그대로 유지된다.
  reasons.sort((a, b) => REASON_ORDER[a.level] - REASON_ORDER[b.level]);

  return { level, reasons, fee };
};

/**
 * 상세 카드 머리글(주어 뒤에 붙는 말). "보리는 확인이 필요해요" 처럼 레벨을 문장으로 읽는다.
 * cond 는 목록 배지와 같은 말("확인이 필요해요")로 맞췄다 — 목록에서 "확인이 필요해요" 였던 곳이
 * 상세에서 "확인해야 알 수 있어요" 로 바뀌면 다른 판정처럼 읽혔다(D12).
 */
const HEADLINE: Record<TEligibilityLevel, string> = {
  ok: '갈 수 있어요',
  cond: '확인이 필요해요',
  unknown: '확인된 정보가 없어요',
  hard: '이용하기 어려워요',
};

/**
 * 머리글은 **근거가 하나뿐일 때 근거를 따른다.** cond 근거가 C1(야외 자리만) 하나뿐이면 확인할
 * 것이 없다 — 야외 자리에서는 갈 수 있다. 그런데 머리글이 "확인이 필요해요" 라고 하면 바로 아래
 * "야외 자리만 가능해요" 와 싸운다(지수). 요금(info)은 판정 근거가 아니라 세지 않는다.
 */
export const headlineFor = (e: TEligibility): string => {
  if (e.level === 'cond') {
    const condReasons = e.reasons.filter((r) => r.level === 'cond');
    if (condReasons.length === 1 && condReasons[0].rule === 'C1') return '야외 자리에서 갈 수 있어요';
  }
  return HEADLINE[e.level];
};

/** unknown 머리글. 강아지가 아니라 장소가 주어다 — 판정한 것이 없는데 "보리는 …" 으로 시작하면 판정한 것처럼 읽힌다. */
export const NO_INFO_VERDICT = '이곳은 반려견 동반 조건이 공개돼 있지 않아요';

/**
 * 상세 카드·공유 글의 머리글 한 문장. 보통은 "보리는 갈 수 있어요"(애칭 + 은/는 + `headlineFor`)지만,
 * **unknown 은 강아지 이름을 빼고 장소를 주어로** 말한다. unknown 은 원문에 조건이 없어서(`noInfo`) 생기고
 * 강아지 조건과 무관하게 같은 결과라, 이름을 앞세우면 없는 판정을 한 것처럼 보인다.
 */
export const verdictFor = (dogNames: string[], e: TEligibility): string =>
  e.level === 'unknown' ? NO_INFO_VERDICT : `${withJosa(dogCallNames(dogNames), '은/는')} ${headlineFor(e)}`;

/**
 * 목록 카드에 한 줄로 보일 대표 근거 — 눌러 보지 않아도 왜 "확인"·"어려움" 인지 읽히게(민준 N1).
 * 최종 레벨과 같은 레벨의 첫 근거(근거는 이미 표시 순서로 정렬돼 있다). `ok` 면 말할 이유가 없다.
 * `unknown` 은 "적혀 있지 않아요" 보다 원문 힌트("대형견도 가능")가 더 쓸모 있어 그쪽을 고른다(N9).
 * 요금(I1)은 카드가 이미 따로 한 줄 그리므로 고르지 않는다.
 */
export const primaryReason = (e: TEligibility): TReason | undefined => {
  if (e.level === 'ok') return undefined;
  if (e.level === 'unknown') {
    const hint = e.reasons.find((r) => r.level === 'info' && r.rule !== 'I1');
    if (hint) return hint;
  }
  return e.reasons.find((r) => r.level === e.level);
};

// 화면(폼)에서 이동 수단 4택을 그릴 때 쓰는 라벨·설명. 여기 두는 이유는 판정 규칙 문구와
// 짝을 맞춰 관리하기 위해서다 — 규칙 문구가 바뀌면 이 설명도 같이 봐야 한다.
export const CARRIER_LABELS: Record<TCarrier, { label: string; hint: string }> = {
  none: { label: '없어요', hint: '케이지·이동가방·유모차 없이 안고 다녀요' },
  bag: { label: '이동가방·슬링백', hint: '천 가방이나 슬링백에 넣어 다녀요' },
  cage: { label: '케이지', hint: '딱딱한 이동장(하드 케이지)을 써요' },
  stroller: { label: '유모차', hint: '반려동물용 유모차를 밀고 다녀요' },
};
