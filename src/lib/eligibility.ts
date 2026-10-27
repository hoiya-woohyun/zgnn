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

import type { TCarrier, TDogEntry, TDogProfile, TDogSize } from '../types';
import { formatDogFee } from './dogFee';
import { maxWeightKg } from './dogProfile';
import { dogCallName, dogCallNames, josa, withJosa } from './korean';
import {
  BADGE_LABEL,
  cageBadgeLabel,
  cageGear,
  cageGearNoun,
  dogCountTiers,
  dogTierBadgeLabel,
  maxDogsBadgeLabel,
  largeDogOkBasis,
  petDaysBadgeLabel,
  UNREAD_BADGE_LABEL,
  weightLimitBadgeLabel,
} from './petPolicy';
import type { TLargeDogOkBy, TPetBadge, TPetPolicy, TPolicyTier } from './petPolicy';

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

const sizeOfWeight = (weightKg: number): TDogSize => {
  if (weightKg < SIZE_BOUNDARY_SMALL) return 'small';
  if (weightKg <= SIZE_BOUNDARY_MEDIUM) return 'medium';
  return 'large';
};

export const dogSize = (dog: TDogProfile): TDogSize => dog.sizeOverride ?? sizeOfWeight(maxWeightKg(dog));

const SIZE_RANK: Record<TDogSize, number> = { small: 0, medium: 1, large: 2 };

/**
 * 모든 아이가 `min` 크기 이상인가 — 준비물이 작은 아이 몫(기내용 가방·유모차·기저귀)을 뒤로 보내거나 빼는 기준(14 W261010.31a·.31b).
 * `dogSize`(가장 무거운 아이)와 다르다: 3kg + 38kg 이면 판정은 대형으로 보지만 3kg 아이에게 가방·기저귀는 여전히 필요하다.
 * 크기 수정(`sizeOverride`)이 있으면 그 말이 이긴다 — 판정과 같은 축. 강아지가 없으면 거짓(지금 그대로 보인다).
 * 축은 하나고 문턱은 물건마다 다르다 — 기내용 가방은 중형부터(`checklist.ts` 의 `orderItemsForDog`), 유모차·기저귀는 대형만.
 */
export const allDogsAtLeast = (dog: TDogProfile | null, min: TDogSize): boolean => {
  if (!dog || dog.dogs.length === 0) return false;
  if (dog.sizeOverride) return SIZE_RANK[dog.sizeOverride] >= SIZE_RANK[min];
  return dog.dogs.every((entry) => SIZE_RANK[sizeOfWeight(entry.weightKg)] >= SIZE_RANK[min]);
};

export const allDogsLarge = (dog: TDogProfile | null): boolean => allDogsAtLeast(dog, 'large');

/**
 * 크기 규칙(H3·H7·H4·C5)에 **걸리는 아이만** — 판정은 가장 큰 아이 하나로 하지만, 말은 H1(무게 상한)처럼 누구 때문인지 한다(14 W261010.15).
 * "소형견만 가능해요" 만으로는 셋을 데려온 보호자가 누구 얘기인지 몰랐다. 크기는 마리마다 몸무게로 본다.
 * 빈 목록이면 문구는 예전 그대로다: 한 마리면 머리글이 이미 그 아이를 부르고, 크기 수정(`sizeOverride`)이 판정을 정해
 * 몸무게로는 아무도 안 걸리면 누구를 부를지 모른다.
 */
const dogsOfSize = (dog: TDogProfile, test: (size: TDogSize) => boolean): TDogEntry[] =>
  dog.dogs.length < 2 ? [] : dog.dogs.filter((entry) => test(sizeOfWeight(entry.weightKg)));

/** "대장이(28kg)" — H1·C10 과 같은 꼴. */
const dogLabel = (entry: TDogEntry): string => `${dogCallName(entry.name)}(${entry.weightKg}kg)`;

/** "대장이(28kg)는" · "대장이(28kg)·태풍이(30kg) 모두" — 조사는 괄호가 아니라 이름 끝 받침을 따른다(H1 과 같다). */
const dogsTopic = (entries: TDogEntry[]): string =>
  entries.length === 1
    ? `${dogLabel(entries[0])}${josa(dogCallName(entries[0].name), '은/는')}`
    : `${entries.map(dogLabel).join('·')} 모두`;

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

/** H2 문장 — "20kg 미만은 1마리까지예요". 카드 칩 거르기(`REASON_BADGE`)가 같은 함수로 이 줄이 어느 구간의 말인지 찾는다. */
const tooManyText = (tier: TPolicyTier): string => {
  const topic = weightBoundTopic(tier);
  return topic ? `${topic} ${tier.maxDogs}마리까지예요` : `${tier.maxDogs}마리까지예요`;
};

/**
 * 무게 상한까지 이만큼 남았으면 "바로 밑" 이다(I2). 1kg 이되 한도의 10% 를 넘지 않는다 — 작은 개 제한에서 1kg 는 큰 몫이라
 * ('5kg 이하' 에 4kg 은 20% 여유다) 0.5kg 로 준다: 5kg → 0.5 · 7kg → 0.7 · 10kg 부터 1. 끝값은 바로 밑에 든다(13kg 미만에 12kg).
 */
const NEAR_LIMIT_KG = 1;
const NEAR_LIMIT_RATIO = 0.1;
const nearLimitMarginKg = (limitKg: number): number => Math.min(NEAR_LIMIT_KG, limitKg * NEAR_LIMIT_RATIO);

/**
 * I2 문장 — "보리(12.5kg)는 13kg 미만까지 0.5kg 남았어요" · 한도와 같으면 "두부(7kg)는 7kg 이하에 딱 맞아요. 늘면 어려워요".
 * 0kg 을 "…이하까지 여유가 없어요" 라고 하면 '갈 수 있어요' 바로 옆에서 거절로 읽혔다(14 W261019.10) — 판정과 같은 방향(들어간다)을 앞에, 위험을 뒤에.
 * "몸무게가 늘면" 이 아니라 "늘면" 인 것은 카드 이유 줄(`clamp-1`)이 320px 에서 그 길이부터 잘려서다 — 무엇이 느는지는 앞의 "(7kg)" 이 말한다.
 * H1 처럼 "…조건까지" 라고 하지 않는 것도 길이 때문이다 — 숫자가 이 줄의 요점이다.
 */
const nearLimitText = (subject: string, tier: TPolicyTier, left: number): string =>
  left === 0
    ? `${subject} ${weightBoundLabel(tier)}에 딱 맞아요. 늘면 어려워요`
    : `${subject} ${weightBoundLabel(tier)}까지 ${left}kg 남았어요`;

/**
 * 그 줄이 이 구간을 말하나 — 칩 거르기(`REASON_BADGE`)가 이것으로 I2 줄이 어느 구간의 말인지 찾는다(H2 의 `tooManyText` 와 같은 짝).
 * 경계 말('13kg 미만')까지만 맞춘다 — 뒤 조사(까지·에)는 남은 무게로 갈린다. 앞 공백까지 맞춰 '13kg 미만' 안의 '3kg 미만' 을 집지 않는다.
 */
const saysNearLimitBound = (text: string, tier: TPolicyTier): boolean => {
  const label = weightBoundLabel(tier);
  return label !== undefined && text.includes(` ${label}`);
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
 *
 * 무게로 들어가는 칸이 없으면(H1) **어느 칸도 우리 마릿수를 안 받을 때만** 같이 말한다(14 W261027.1) — '7kg 미만 1마리' 곳에서
 * 콩이·해피(12kg)는 무게로도 마릿수로도 못 가는데, 근거가 무게 하나라 두 마리라서도 안 된다는 것이 안 보였다. 기준은 마릿수 상한이
 * 가장 큰 칸이다 — 무게와 상관없이 마릿수만으로도 넘을 때만 선다.
 */
const ruleTooManyForWeight: TRule = (dog, policy) => {
  const weight = maxWeightKg(dog);
  const fitting = policy.tiers.filter((t) => fitsTierWeight(t, weight));
  const candidates = fitting.length > 0 ? fitting : policy.tiers;
  if (candidates.length === 0) return null;

  const selected = candidates.reduce((a, b) => ((b.maxDogs ?? Infinity) > (a.maxDogs ?? Infinity) ? b : a));
  if (selected.maxDogs === undefined) return null;
  if (selected.maxDogs >= dog.dogs.length) return null;

  return { level: 'hard', text: tooManyText(selected), quote: selected.source };
};

/**
 * I2: 몸무게가 무게 상한 바로 밑이다(14 W261010.33r). '13kg 미만' 곳에 12.5kg 가 '갈 수 있어요' 뿐이면 털·체중계 차이로 현장에서
 * 걸릴 수 있다는 것을 모른다. 판정은 원문 기준 그대로다 — 경계 안이면 갈 수 있다. 그래서 레벨은 info 라 등급을 바꾸지 않는다.
 *
 * 경계는 **우리를 받아 주는 구간** 중 가장 넓은 것이다 — 무게도 마릿수도 맞는 구간. 웨스티하우스(10kg 미만 2마리 · 20kg 미만 1마리)에서
 * 9.5kg 한 마리는 20kg 구간이 받아 주니 경계가 멀고, 9.5kg 가 낀 두 마리는 10kg 구간뿐이라 0.5kg 남았다. 무게 조건 없는 구간이 받아 주면
 * 무게는 경계가 아니다. 받아 주는 구간이 없으면 H1·H2 가 이미 어려움으로 말했다.
 * 판정처럼 가장 무거운 아이 하나로 본다 — 그 아이가 넘으면 다 같이 못 간다. 이름도 그 아이만(H1 과 같은 꼴).
 */
const ruleNearWeightLimit: TRule = (dog, policy) => {
  const weight = maxWeightKg(dog);
  const admitting = policy.tiers.filter(
    (t) => fitsTierWeight(t, weight) && (t.maxDogs === undefined || t.maxDogs >= dog.dogs.length),
  );
  if (admitting.length === 0 || admitting.some((t) => t.maxWeightKg === undefined)) return null;
  const tier = admitting.reduce((a, b) => ((b.maxWeightKg as number) > (a.maxWeightKg as number) ? b : a));
  const limit = tier.maxWeightKg as number;
  // 10 − 9.7 은 0.3000000000000007 이다 — 소수 한 자리로.
  const left = Math.round((limit - weight) * 10) / 10;
  if (left > nearLimitMarginKg(limit)) return null;
  const heaviest = dog.dogs.find((d) => d.weightKg === weight) as TDogEntry;
  return { level: 'info', text: nearLimitText(dogsTopic([heaviest]), tier, left), quote: tier.source };
};

/** 요금이 크기·몸무게로 갈린다고 적혀 있다("10kg 이상 4만원" · "중형견 2만원" · 무게 구간 요금 구조) — 원문이 크기를 말한 것이다(I3). */
const FEE_SIZE_RE = /kg|대형|중형|소형/;
const feeMentionsSize = (policy: TPetPolicy): boolean =>
  (policy.feeRules?.some((r) => r.minKg !== null || r.maxKg !== null) ?? false) ||
  policy.feeLines.some((line) => FEE_SIZE_RE.test(line));

/**
 * I3: 중형견(10~25kg)인데 원문이 크기에 대해 아무 말도 안 했다(14 W261019.5). 오늘당근("실내외 모두 가능" 뿐)에 25kg 이 '갈 수 있어요' 뿐이라
 * 크기 언급이 없다는 것을 몰랐다. 판정은 그대로다(info) — 카페·식당의 "모두 가능" 은 보통 크기와 무관하고, 확인 필요로 내리면 근거 없이 수를 깎는다.
 * 대형(25kg 초과)은 C5 가 확인 필요로 이미 말하고, 소형은 크기로 막히는 일이 드물다 — 그래서 중형만이다.
 * 원문을 못 읽은 곳(`unread`, C7)·조건이 없는 곳(`noInfo`, U1)은 뺀다 — 읽지 못했는데 "적혀 있지 않다" 고 하면 틀린 말이다.
 * 카드 이유 줄(`primaryReason`)은 아니다 — 크기를 말하지 않은 곳이 많아(122곳 중 12kg 기준 51곳) 같은 줄이 수십 장에 붙는다. 상세 근거 목록에만 선다.
 */
const ruleSizeUnmentioned: TRule = (dog, policy) => {
  if (dogSize(dog) !== 'medium') return null;
  if (policy.noInfo || policy.unread) return null;
  if (policy.largeDogOk || policy.mediumDogOk || policy.largeDogNo || policy.smallDogOnly) return null;
  if (policy.weightLimitKg !== undefined || policy.tiers.some((t) => t.maxWeightKg !== undefined)) return null;
  if (feeMentionsSize(policy)) return null;
  return { level: 'info', text: '크기 제한은 적혀 있지 않아요' };
};

/** "보리(30kg)" · "보리(30kg)·태풍이(28kg)" — "…도 돼요" 앞에 붙는 꼴(I4). */
const dogsLabel = (entries: TDogEntry[]): string => entries.map(dogLabel).join('·');

/**
 * 대형견 허용을 어느 말로 옮길지(I4). 무게·크기 제한 없음 · "대형견 가능" 은 적힌 그대로, 견종으로 읽었으면 옮겨 읽었다고 드러낸다.
 * 근거 꼴을 모르면(`largeDogOkBasis` 가 undefined) 단정하지 않는다.
 */
const LARGE_OK_TEXT: Record<TLargeDogOkBy | 'unknown', (who: string) => string> = {
  weightFree: (who) => `몸무게 제한이 없다고 적혀 있어요 · ${who}도 돼요`,
  sizeFree: (who) => `크기 제한이 없다고 적혀 있어요 · ${who}도 돼요`,
  largeSaid: (who) => `대형견도 된다고 적혀 있어요 · ${who}도 돼요`,
  breedFree: (who) => `견종 제한이 없다고 적혀 있어 ${who}도 되는 것으로 읽었어요`,
  allBreeds: (who) => `모든 견종이 된다고 적혀 있어 ${who}도 되는 것으로 읽었어요`,
  unknown: (who) => `대형견도 받는 것으로 읽었어요 · ${who}도 돼요`,
};

/**
 * I4: '갈 수 있어요' 의 **우리 강아지 기준 근거**(14 W261027.2). 어려움은 "보리(30kg)는 7kg 미만 조건을 넘어요" 인데 가능은 요금 한 줄뿐이라,
 * 백화stay "견종 제한, 견수 제한 없음." 이 '✓ 대형견 OK' + '갈 수 있어요' 로 서도 왜 되는지 안 보였다(seongho-16a·16b). 규칙은 그대로 — 무엇을 근거로 읽었나만 말한다.
 * 크기·무게 축 하나다(판정이 크기로 갈리는 곳). 고르는 순서는 원문이 더 좁게 말한 쪽부터:
 * - 무게 구간이 받아 준다 → "두부(5kg)는 7kg 미만 조건 안이에요" (받아 주는 칸은 I2 와 같은 고르기 — 바로 밑이면 I2 가 이미 말해 `judgeEligibility` 가 이 줄을 뺀다)
 * - 대형견 허용 · 중형·대형 아이 → 근거 문장이 말한 꼴대로(`largeDogOkBasis` — 블로그 출처 행은 근거 문장이 지워져 조립이 미리 읽은 칸으로). 견종으로 읽었으면 "…되는 것으로 읽었어요" 로 옮겨 읽은 것을 드러낸다
 * - 중형견 허용 · 중형 아이 → "중형견도 된다고 적혀 있어요 · 콩이(12kg)도 돼요"
 * - 소형견만 · 소형 아이 → "소형견만 된다고 적혀 있어요 · 두부(5kg)는 소형견이에요"
 * 소형 아이에게 대형견 허용을 말하지 않는다 — 그 아이의 근거가 아니다. **최종 판정이 ok 일 때만** 남는다(`judgeEligibility`) — 확인 필요·어려움 옆의
 * "보리도 돼요" 는 그 판정과 싸운다(대형견 OK 인데 케이지가 없어 실내는 어려운 곳). 상세 근거 목록에만 선다 — 카드 이유 줄이 아니다(`primaryReason`).
 */
const ruleSizeBasis: TRule = (dog, policy) => {
  if (policy.noInfo || policy.unread) return null;
  const weight = maxWeightKg(dog);
  const admitting = policy.tiers.filter(
    (t) => fitsTierWeight(t, weight) && (t.maxDogs === undefined || t.maxDogs >= dog.dogs.length),
  );
  if (admitting.length > 0 && admitting.every((t) => t.maxWeightKg !== undefined)) {
    const tier = admitting.reduce((a, b) => ((b.maxWeightKg as number) > (a.maxWeightKg as number) ? b : a));
    return { level: 'info', text: `${dogsTopic(dog.dogs)} ${weightBoundLabel(tier)} 조건 안이에요`, quote: tier.source };
  }
  const size = dogSize(dog);
  // 크기가 문제 되는 아이만 부른다. 크기 수정(`sizeOverride`)이 판정을 정해 몸무게로는 아무도 안 걸리면 다 부른다.
  const sized = (test: (s: TDogSize) => boolean) => {
    const hit = dog.dogs.filter((entry) => test(sizeOfWeight(entry.weightKg)));
    return dogsLabel(hit.length > 0 ? hit : dog.dogs);
  };
  if (policy.largeDogOk && size !== 'small') {
    const text = LARGE_OK_TEXT[largeDogOkBasis(policy) ?? 'unknown'](sized((s) => s !== 'small'));
    return { level: 'info', text, quote: policy.sources.largeDogOk };
  }
  if (policy.mediumDogOk && size === 'medium') {
    // 중형견 허용은 정규식 '중형견 … 가능' 에서만 온다(AI 판단엔 칸이 없다) — 늘 적힌 말이다.
    return { level: 'info', text: `중형견도 된다고 적혀 있어요 · ${sized((s) => s === 'medium')}도 돼요`, quote: policy.sources.mediumDogOk };
  }
  if (policy.smallDogOnly && size === 'small') {
    return { level: 'info', text: `소형견만 된다고 적혀 있어요 · ${dogsTopic(dog.dogs)} 소형견이에요`, quote: policy.sources.smallDogOnly };
  }
  return null;
};

/** H3: "소형견만" 인데 우리 강아지는 소형이 아니다. */
const ruleSmallOnly: TRule = (dog, policy) => {
  if (!policy.smallDogOnly) return null;
  if (dogSize(dog) === 'small') return null;
  const over = dogsOfSize(dog, (size) => size !== 'small');
  const text = over.length > 0 ? `${dogsTopic(over)} 소형견이 아니에요. 소형견만 가능해요` : '소형견만 가능해요';
  return { level: 'hard', text, quote: policy.sources.smallDogOnly };
};

/**
 * H7: 원문이 대형견은 안 된다고 적었고(정규식 또는 AI `largeDogOk: false`) 우리 강아지가 대형이다.
 * 전에는 `largeDogOk` 가 참/거짓 한 칸이라 "불가" 가 "언급 없음" 과 같아져 C5(확인 필요)로 떨어졌다 — 원문과 반대 말이었다(todo/06 A-2).
 * 번호가 H7 인 것은 나중에 생겨서이고, 표시 순서는 크기 조건(H3) 옆이다.
 */
const ruleLargeDogNo: TRule = (dog, policy) => {
  if (!policy.largeDogNo) return null;
  if (dogSize(dog) !== 'large') return null;
  const large = dogsOfSize(dog, (size) => size === 'large');
  const said = '대형견은 어렵다고 적혀 있어요';
  return { level: 'hard', text: large.length > 0 ? `${dogsTopic(large)} 대형견이에요. ${said}` : said, quote: policy.sources.largeDogNo };
};

/**
 * H4: 실내가 케이지 필수인데 대형견이고 케이지가 없다. 야외 자리가 열려 있으면(outdoorFree)
 * 아예 어려움은 아니고 "야외는 가능" 으로 낮춘다 — 단, 이번 여행에 실내가 꼭 필요하면(C4 와 같은
 * 기준) 야외 자리는 답이 아니므로 어려움이다.
 *
 * 원문이 대형견을 받는다고 적었으면(`largeDogOk`) 막는 것은 크기가 아니라 케이지다 — "대형견은 어려워요" 라고 하면
 * "(대형견도 환영)" 바로 옆에서 원문과 반대 말을 한다(신창해물라면와랑식탁, 14 W261007.3).
 *
 * 여러 마리면 대형견인 아이를 부른다(`dogsOfSize`) — 단, **이동가방·유모차가 있을 때만**. 이동 수단이 없으면 작은 아이도 실내에
 * 못 드는데(H5 는 이 규칙에 물러나 있다) 큰 아이만 부르면 나머지는 되는 것처럼 읽힌다.
 *
 * 수단은 칩과 같은 이름(`cageGearNoun`)으로 부른다 — "가방·유모차 필요" 칩 옆에서 "실내는 케이지 필수" 는 다른 조건으로 읽혔다(14 W261013.14g).
 * 단 "…이 없어" 는 **이 아이에게 없는 것**이라, 가방·유모차를 든 아이에겐 케이지다 — 원문이 가방을 받는 곳에서 가방 든 아이에게
 * "이동가방이 없어" 는 거짓이다.
 */
const ruleLargeNeedsCage: TRule = (dog, policy, opts) => {
  if (policy.indoor !== 'cage') return null;
  if (dogSize(dog) !== 'large') return null;
  if (dog.carrier === 'cage') return null;
  const gear = cageGearNoun(policy);
  const lacking = `${withJosa(dog.carrier === 'none' ? gear : '케이지', '이/가')} 없어`;
  const required = `실내는 ${gear} 필수`;
  const large = dog.carrier === 'none' ? [] : dogsOfSize(dog, (size) => size === 'large');
  const named = large.length > 0 ? `${dogsTopic(large)} ${policy.largeDogOk ? lacking : '대형견이라'}` : undefined;
  const subject = named ?? (policy.largeDogOk ? lacking : `${required}라 대형견은`);
  if (policy.outdoorFree) {
    const text = `${subject} 야외 자리만 가능해요`;
    return opts.needsIndoor
      ? { level: 'hard', text, quote: policy.sources.indoor }
      : { level: 'cond', text, quote: policy.sources.indoor };
  }
  const text = named
    ? `${named} ${policy.largeDogOk ? '실내는 어려워요' : `${required}예요`}`
    : policy.largeDogOk
      ? `${lacking} 실내는 어려워요`
      : `${required}라 대형견은 어려워요`;
  return { level: 'hard', text, quote: policy.sources.indoor };
};

/**
 * H5: 실내가 케이지 필수인데 아무 이동 수단도 없고, 야외 자리도 없다.
 * 대형견이면 H4 가 같은 문장을 근거로 이미 어려움을 냈으므로 같은 말을 반복하지 않는다.
 *
 * C2 처럼 **원문이 적은 것**으로 말한다(14 W261013.14g). 예전 "케이지 동반시에만 가능해요" 는 케이지가 유일한 길이라고 단정해,
 * 목록 머리의 바로 아래 줄 "이동가방이 있으면 N곳이 '확인 필요' 로 바뀌어요" 와 싸웠다 — 원문이 '케이지' 라고 쓴 곳도 천 가방을
 * 받는지는 모른다(그래서 C2 가 확인을 권한다).
 */
const ruleNoCarrierNoOutdoor: TRule = (dog, policy) => {
  if (policy.indoor !== 'cage') return null;
  if (dog.carrier !== 'none') return null;
  if (policy.outdoorFree) return null; // ruleNoCarrierOutdoorFree(C4) 가 담당
  if (dogSize(dog) === 'large') return null; // ruleLargeNeedsCage(H4) 가 담당
  return { level: 'hard', text: `${withJosa(cageGearNoun(policy), '이/가')} 필요하다고 적혀 있어요`, quote: policy.sources.indoor };
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

/**
 * C2: 케이지 필수인 곳에 이동가방을 들고 간다. 슬링백을 케이지로 착각하지 않게 확인을 권한다.
 * `indoor: 'cage'` 는 "케이지·이동가방·유모차 중 하나" 라서, 원문이 이동가방을 직접 적었으면(카페스누피 "실내에서는
 * 유모차/이동 가방 필요") 이미 된다 — 되물으면 원문이 허락한 것을 의심하게 만든다(14 W261006.4). C3 과 같은 물러남.
 */
const ruleBagAtCagePlace: TRule = (dog, policy) => {
  if (policy.indoor !== 'cage') return null;
  if (dog.carrier !== 'bag') return null;
  // 근거 문장 + 다음 문장까지 본다 — 광복이네는 "실내에서 식사할 수 있었어요" 다음 문장이 "이동가방에 넣어" 다(21 S5.2).
  if (cageGear(policy).bag) return null;
  // 원문이 유모차만 적었으면 "유모차라고 적혀 있어요" — '케이지' 라고 하면 칩('유모차 필요')과 다른 조건이 된다(14 W261013.14g).
  return {
    level: 'cond',
    text: `${withJosa(cageGearNoun(policy), '이라고/라고')} 적혀 있어요. 이동가방도 되는지 확인해 주세요`,
    quote: policy.sources.indoor,
  };
};

/** C3: 케이지 필수인 곳에 유모차를 들고 간다. 원문이 유모차를 직접 허용한 게 아니면 확인을 권한다. */
const ruleStrollerAtCagePlace: TRule = (dog, policy) => {
  if (policy.indoor !== 'cage') return null;
  if (dog.carrier !== 'stroller') return null;
  // 원문이 유모차를 허용으로 언급했다면 이미 된다. '유모차 불가' 처럼 부정이 붙은 문장은 허용이 아니다.
  if (cageGear(policy).stroller) return null;
  return {
    level: 'cond',
    text: `${withJosa(cageGearNoun(policy), '이라고/라고')} 적혀 있어요. 유모차도 되는지 확인해 주세요`,
    quote: policy.sources.indoor,
  };
};

/** C4: 케이지 필수인 곳에 아무 이동 수단도 없지만, 야외 자리는 자유롭다. 수단은 칩과 같은 이름으로(카페스누피 "실내는 이동가방이나 유모차"). */
const ruleNoCarrierOutdoorFree: TRule = (dog, policy, opts) => {
  if (policy.indoor !== 'cage') return null;
  if (dog.carrier !== 'none') return null;
  if (!policy.outdoorFree) return null; // ruleNoCarrierNoOutdoor(H5) 가 담당
  const text = `실내는 ${cageGearNoun(policy)}, 야외는 자유예요`;
  return opts.needsIndoor
    ? { level: 'hard', text, quote: policy.sources.indoor }
    : { level: 'cond', text, quote: policy.sources.indoor };
};

/** 요금 줄의 "10kg 이상 4만원" — 무게 하한이 붙은 요금. 대형견을 따로 말하지 않아도 무게를 말한 것이다. */
const FEE_MIN_KG_RE = /(\d+)\s*kg\s*이상/;
/** 요금 줄의 "6~10kg 1.5만원" — 구간 상한(두 번째 숫자)만 쓴다. */
const FEE_RANGE_KG_RE = /\d+\s*~\s*(\d+)\s*kg/;

/**
 * 요금표가 몸무게 구간으로만 짜여 있을 때 그 표의 끝 kg("1~5kg · 6~10kg" → 10). 표가 위로 열려 있으면
 * ("10kg 이상 4만원" · 무게 조건 없는 마리당 요금 · 구간 아닌 줄이 크기를 말함) 상한이 없는 것이라 undefined.
 * 요금 구조(`feeRules`)가 있으면 그 칸으로, 없으면 원문 줄을 읽는다(`dogFee.ts` 와 같은 갈래).
 */
const feeTableTopKg = (policy: TPetPolicy): number | undefined => {
  if (policy.feeRules) {
    const perDog = policy.feeRules.filter((r) => r.basis === 'perDog');
    const weighted = perDog.filter((r) => r.minKg !== null || r.maxKg !== null);
    if (weighted.length === 0 || weighted.length < perDog.length) return undefined;
    if (weighted.some((r) => r.maxKg === null)) return undefined;
    return Math.max(...weighted.map((r) => r.maxKg as number));
  }
  const tops = policy.feeLines.flatMap((line) => {
    const m = FEE_RANGE_KG_RE.exec(line);
    return m ? [Number(m[1])] : [];
  });
  if (tops.length === 0) return undefined;
  const opensUp = policy.feeLines.some(
    (line) => !FEE_RANGE_KG_RE.test(line) && /kg|대형|중형|초과|이상|마리\s*당/.test(line),
  );
  return opensUp ? undefined : Math.max(...tops);
};

/**
 * C10: 요금표가 몸무게 구간으로만 짜여 있고 우리 강아지가 그 끝을 넘는다(14 W261006.1, 솔숲펜션 "1~5kg · 6~10kg").
 * 표에 없는 몸무게를 받는지 원문은 말하지 않는다 — 어려움은 아니지만 '갈 수 있어요' 도 아니다.
 * 전엔 C5 안에만 있어서 대형견(25kg 초과)만 잡혔고, 12kg·20kg 은 요금 줄도 없이 '갈 수 있어요' 였다.
 * 문구는 H1 처럼 **넘는 강아지만** 이름(몸무게)으로 적는다.
 */
const ruleWeightAboveFeeTable: TRule = (dog, policy) => {
  if (policy.noInfo) return null;
  // 무게 상한(H1)이 이미 '어려움' 으로 말했으면 요금표 얘기는 덧붙이지 않는다 — C5 가 tiers 앞에서 물러나는 것과 같다.
  const weightTiers = policy.tiers.filter((t) => t.maxWeightKg !== undefined);
  if (weightTiers.length > 0 && !weightTiers.some((t) => fitsTierWeight(t, maxWeightKg(dog)))) return null;
  const top = feeTableTopKg(policy);
  if (top === undefined) return null;
  const over = dog.dogs.filter((d) => d.weightKg > top);
  if (over.length === 0) return null;
  const labels = over.map((d) => `${dogCallName(d.name)}(${d.weightKg}kg)`);
  const subject = over.length === 1 ? labels[0] : labels.join('·');
  return { level: 'cond', text: `${top}kg 초과 요금이 적혀 있지 않아요. ${subject}도 되는지 확인해 주세요` };
};

/**
 * C5: 대형견인데 원문에 대형견 가능 문구가 없다. 무게·마릿수 계단식 조건이 이미 있으면(tiers)
 * 그 조건이 실제 판정을 맡으므로 이 규칙은 물러난다. 케이지 필수 + 대형견 조합은 H4 가 이미
 * 담당하므로 같은 말을 두 번 하지 않는다.
 *
 * "대형견 언급이 없어요" 가 **틀린 말이 되는 두 경우**를 먼저 거른다(등급은 그대로):
 * - 정보 없음 — 원문에 조건 자체가 없는데 "대형견 언급" 을 꼬집으면 unknown 근거보다 먼저
 *   읽혀 엉뚱한 이유처럼 보였다. U1 이 말하게 물러난다.
 * - 요금 줄이 무게를 말함 — "10kg 이상 4만원" 이 있는데 "언급이 없다" 고 하면 원문과 반대다.
 *   구간 요금표("~10kg")만 있고 우리가 넘으면 C10 이 크기와 무관하게 짚는다(07 U4 → 14 W261006.1, 솔숲펜션).
 */
const ruleLargeDogUnmentioned: TRule = (dog, policy) => {
  if (policy.noInfo) return null;
  if (dogSize(dog) !== 'large') return null;
  if (policy.largeDogOk) return null;
  if (policy.largeDogNo) return null; // H7 이 어려움으로 말한다
  // "소형견에 한해" 가 이미 크기를 말했다 — H3 이 어려움으로 짚는 옆에 "언급이 없어요" 를 두면 이유끼리 다툰다(14 W261007.3).
  if (policy.smallDogOnly) return null;
  // 몸무게가 있는 구간만 대형견을 말한 것이다 — 마릿수만 있는 구간('최대 2마리')은 크기에 대해 아무 말도 안 했다.
  // 전엔 구간이 하나라도 있으면 넘어가서, 마릿수만 적힌 곳의 대형견이 '갈 수 있어요' 로 나왔다(pnpm data eval 이 찾음).
  if (policy.tiers.some((tier) => tier.maxWeightKg !== undefined)) return null;
  const handledByH4 = policy.indoor === 'cage' && dog.carrier !== 'cage';
  if (handledByH4) return null;

  const weight = maxWeightKg(dog);
  // 여러 마리면 대형견인 아이 이름으로 묻는다 — C10 의 "보리(12kg)도 되는지" 와 같은 꼴(14 W261010.15).
  const large = dogsOfSize(dog, (size) => size === 'large');
  const who = large.length > 0 ? large.map(dogLabel).join('·') : undefined;
  const minKgLine = policy.feeLines.find((line) => FEE_MIN_KG_RE.test(line));
  if (minKgLine) {
    const n = Number((FEE_MIN_KG_RE.exec(minKgLine) as RegExpExecArray)[1]);
    return { level: 'cond', text: `${n}kg 이상 요금이 적혀 있어요. ${who ? `${who}도` : `${weight}kg 도`} 되는지 확인해 주세요` };
  }
  // 구간 요금표를 넘으면 C10 이 크기와 무관하게 "N kg 초과 요금" 으로 말한다 — 같은 말을 두 번 하지 않는다.
  const top = feeTableTopKg(policy);
  if (top !== undefined && weight > top) return null;

  const text = who ? `대형견 언급이 없어요. ${who}도 되는지 확인해 주세요` : '대형견 언급이 없어요. 확인해 주세요';
  return { level: 'cond', text, quote: policy.sources.largeDogOk };
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
  return { level: 'cond', text: '예방접종을 마친 강아지만 들어갈 수 있어요. 접종 증명을 챙겨 주세요', quote: policy.sources.vaccineRequired };
};

/**
 * C11: 동반이 특정 요일에만 된다(`petDays`, 14 W261007.4). 어려움이 아니라 조건이다 — 그 요일에 가면 되는 곳이라서.
 * **오늘 요일을 보고 판정을 바꾸지 않는다**: 판정·카드는 정적 빌드 결과이고 사용자가 며칠 뒤 갈지 모르며, 이 앱은 날짜를 판정 입력으로 안 쓴다.
 * 문장이 요일을 못 박아 말하는 것으로 충분하다. (C8 과 같은 무게.)
 */
const rulePetDays: TRule = (_dog, policy) => {
  if (!policy.petDays?.length) return null;
  return { level: 'cond', text: `매주 ${policy.petDays.join('·')}요일에만 함께 들어갈 수 있어요`, quote: policy.sources.petDays };
};

/**
 * C7: 원문은 있는데 정규식도 AI 도 조건을 하나도 못 읽었다(`unread`). 전에는 규칙이 하나도 안 걸려 '갈 수 있어요' 였다 —
 * 읽지 못한 제한이 있을 수 있는 곳을 가장 좋은 답으로 보냈다(todo/06 A-1). 어려움은 아니다: 원문이 무엇을 막는지 모르니까.
 */
const ruleUnread: TRule = (_dog, policy) => {
  if (!policy.unread) return null;
  return { level: 'cond', text: '조건 문장을 자동으로 읽지 못했어요. 원문을 확인해 주세요' };
};

/**
 * C9: 원문이 일반 허용 문장뿐("애견동반 가능해요")이고 **아무도 확인한 기록이 없다**(todo/13 A2). C7 과 같은 무게 — 어려움이 아니라 확인이다.
 * 규칙을 문장이 아니라 확인 여부에 거는 이유: 시드는 작성자가 다녀온 곳이라 같은 문장이 맞는 '갈 수 있어요' 이고, 블로그에서 온 곳은
 * "가능" 이라고만 적혔을 뿐 조건을 본 사람이 없다. 문장으로 일괄 바꾸면 시드의 맞는 답까지 흐려진다.
 */
const ruleGenericUnverified: TRule = (_dog, policy) => {
  if (!policy.genericOnly || policy.verified) return null;
  return { level: 'cond', text: '조건이 적혀 있지 않아요. 가기 전에 확인해 주세요' };
};

/**
 * C12: 식당·카페인데 원문이 실내를 말하지 않았고(`indoor: 'unknown'`), 이번 여행은 실내 자리가 꼭 필요하다(todo/13 §5.2).
 * "반려견 동반 가능 리드줄 필수" 처럼 다른 조건이 읽혀 C9 를 비켜 간 곳이 실내 근거 없이 '갈 수 있어요' 였다 — 지어낸 확신(BUG-009 계열).
 * 어려움은 아니다: 실내가 안 된다고 적힌 것도 아니다. 실내 자리가 필요 없으면 걸지 않는다 — 실내를 묻지 않았고, 시드의
 * '갈 수 있어요' 는 늘 실내·야외 중 하나를 읽은 뒤였다. 원문이 비었거나(U1) 못 읽었으면(C7) 그쪽이 이미 확인을 말한다.
 */
const ruleIndoorUnstated: TRule = (_dog, policy, opts) => {
  if (!opts.needsIndoor || !policy.seating || policy.indoor !== 'unknown') return null;
  if (policy.noInfo || policy.unread) return null;
  return { level: 'cond', text: '실내 동반은 적혀 있지 않아요. 확인해 주세요' };
};

/** U1: 원문에 동반 조건 자체가 없다. */
const ruleNoInfo: TRule = (_dog, policy) => {
  if (!policy.noInfo) return null;
  return { level: 'unknown', text: '동반 조건이 적혀 있지 않아요', quote: policy.sources.noInfo };
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
  ['C10', ruleWeightAboveFeeTable],
  ['C6', ruleCallFirst],
  ['C8', ruleVaccineRequired],
  ['C11', rulePetDays],
  ['C12', ruleIndoorUnstated],
  ['C7', ruleUnread],
  ['C9', ruleGenericUnverified],
  ['U1', ruleNoInfo],
  ['I2', ruleNearWeightLimit],
  ['I3', ruleSizeUnmentioned],
  ['I4', ruleSizeBasis],
];

/**
 * 우리 강아지를 **받아 주는지**가 아직 열린 규칙 — 이 근거가 있으면 요금 한 줄 앞에 "받아 준다면" 을 붙인다.
 * C5(대형견 언급 없음)·C10(요금표가 우리 몸무게 앞에서 끝남)만이다. 야외 자리(C1·C4)·가방(C2·C3)은 받아 주는 곳이고,
 * C6(전화 먼저)·C8(예방접종)은 가는 방법·서류를 말할 뿐이며, C7·C9(원문을 못 읽음·일반 문장뿐)는 요금 줄 자체가 드물다.
 */
const ADMISSION_UNSURE_RULES = new Set(['C5', 'C10']);

export const judgeEligibility = (
  dog: TDogProfile,
  policy: TPetPolicy,
  opts: TJudgeOpts = {},
): TEligibility => {
  const judged = RULES.flatMap(([id, rule]): TReason[] => {
    const reason = rule(dog, policy, opts);
    return reason ? [{ ...reason, rule: id }] : [];
  });

  let level: TEligibilityLevel;
  if (judged.some((r) => r.level === 'hard')) level = 'hard';
  else if (policy.noInfo) level = 'unknown';
  else if (judged.some((r) => r.level === 'cond')) level = 'cond';
  else level = 'ok';

  // 어려움이면 참고 줄(info — 몸무게 문턱 I2)도 싣지 않는다. 못 간다는 곳에서 "13kg 미만까지 0.5kg 남았어요" 는 소음이다(요금과 같은 이유, 아래).
  // 크기 근거(I4)는 '갈 수 있어요' 의 근거라 그 판정일 때만 — 확인 필요 옆 "보리도 돼요" 는 판정과 싸운다. 몸무게 문턱(I2)이 이미 같은 구간을 말했으면 뺀다.
  const nearLimit = judged.some((r) => r.rule === 'I2');
  const reasons = judged.filter(
    (r) => !(level === 'hard' && r.level === 'info') && !(r.rule === 'I4' && (level !== 'ok' || nearLimit)),
  );

  // 요금은 이름까지 붙은 완성 문장(`dogFee.ts`)이라 카드·상세가 같은 줄을 그대로 보여준다.
  // **어려움이면 요금을 싣지 않는다**(`fee` 도, 요금 info 근거도) — 못 간다는 곳 밑에 "대장이와
  // 초코 · 청소비 5만원" 이 붙으면 우리가 낼 돈으로 읽힌다(민준, 그리너리빌리지).
  const dogFee = level === 'hard' ? undefined : formatDogFee(policy, dog);
  // 받아 주는지부터 확인해야 하는 곳이면 요금이 그 말을 앞서지 않게 조건을 붙인다 — "보리는 5만원" 바로 밑의
  // "대형견 언급이 없어요" 는 요금이 확정이고 크기만 물어보면 되는 것처럼 읽혔다(돌담연가, 14 W261007.6).
  const fee = dogFee && reasons.some((r) => r.rule !== undefined && ADMISSION_UNSURE_RULES.has(r.rule)) ? `받아 준다면 ${dogFee}` : dogFee;
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
 * "야외 자리만 된다" 를 말하는 cond 규칙 — C1(야외 자리만 있는 곳) · C4(실내는 케이지, 야외는 자유) ·
 * H4 의 cond 갈래(대형견, 야외는 자유). 이 강아지에게는 셋이 같은 답이다(14 W261007.2 — 무거버거 vs 부부키친).
 */
const OUTDOOR_SEAT_RULES = new Set(['C1', 'C4', 'H4']);

/**
 * 확인할 것은 없고 야외 자리에서는 갈 수 있다 — cond 근거가 전부 야외 자리 규칙일 때.
 * "하나뿐" 이 아니라 "전부" 인 것은 대형견·이동 수단 없음이면 H4 와 C4 가 같은 말을 둘이 하기 때문이다.
 * 머리글(`headlineFor`)과 목록의 야외 차선(`outdoorFallback`)이 이 하나로 가른다 — 둘이 다른 기준이면
 * 시트는 "야외 자리로는 돼요" 인데 그 안의 카드는 "확인이 필요해요" 라고 한다.
 */
export const isOutdoorSeatOnly = (e: TEligibility): boolean => {
  if (e.level !== 'cond') return false;
  return e.reasons.every((r) => r.level !== 'cond' || (r.rule !== undefined && OUTDOOR_SEAT_RULES.has(r.rule)));
};

/**
 * 머리글은 **근거가 같은 말을 할 때 근거를 따른다.** cond 근거가 전부 야외 자리 규칙이면(`isOutdoorSeatOnly`)
 * 확인할 것이 없다 — 야외 자리에서는 갈 수 있다. 그런데 머리글이 "확인이 필요해요" 라고 하면 바로 아래
 * "야외 자리만 가능해요" 와 싸운다(지수). 요금(info)은 판정 근거가 아니라 세지 않는다.
 */
export const headlineFor = (e: TEligibility): string =>
  isOutdoorSeatOnly(e) ? '야외 자리에서 갈 수 있어요' : HEADLINE[e.level];

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
 * **판정을 정한 근거**를 고른다(14 W261013.1). 보통은 최종 레벨과 같은 레벨의 첫 근거(표시 순서로 정렬돼 있다)지만 cond 는 갈린다:
 * - 머리글이 "확인이 필요해요" 면 그 말을 정한 것은 야외 자리 규칙(C1·C4·H4)이 **아닌** 근거다 — 야외 자리 규칙뿐이었으면 머리글이
 *   "야외 자리에서 갈 수 있어요" 였다. 무히어는 '야외 자리만 가능해요' 가 앞에 서서, 판정을 정한 예방접종은 상세에서야 보였다.
 * - 머리글이 "야외 자리에서 갈 수 있어요" 면 C1('야외 자리만 가능해요')은 머리글을 되풀이할 뿐이라 고르지 않는다 — 카드 한 장에
 *   '야외' 가 세 번이었다. H4·C4 는 왜 야외만인지('대형견이라'·'실내는 케이지') 더 말하므로 남는다.
 * `ok` 면 판정을 정한 근거가 없다 — 몸무게가 무게 상한 바로 밑이면(I2) 그 줄만 고른다. 상세가 같은 줄을 근거 목록에 세우므로
 * 카드·지도 시트·상세가 같은 말을 한다(14 W261010.33r). 요금(I1)은 카드가 이미 따로 한 줄 그리므로 고르지 않는다.
 */
export const primaryReason = (e: TEligibility): TReason | undefined => {
  if (e.level === 'ok') return e.reasons.find((r) => r.rule === 'I2');
  const same = e.reasons.filter((r) => r.level === e.level);
  if (e.level !== 'cond') return same[0];
  if (isOutdoorSeatOnly(e)) return same.find((r) => r.rule !== 'C1');
  return same.find((r) => r.rule === undefined || !OUTDOOR_SEAT_RULES.has(r.rule));
};

/**
 * 이유 줄과 같은 칸을 말하는 원문 칩 — 규칙 ID → 그 규칙이 읽은 정책 칸의 배지 라벨(`toPetBadges` 와 같은 함수·상수로 만든다).
 * 케이지 규칙(H4·H5·C2·C3·C4)은 칩과 줄이 같은 이름(`cageGearNoun`)으로 부르므로 그 장소의 수단 칩(`cageBadgeLabel` — '이동가방 필요' 등)과 겹친다.
 * 예전엔 줄이 늘 '케이지' 라 '케이지 필요' 일 때만 겹쳤다(14 W261013.14g).
 * 구간마다 마릿수가 다른 곳(`dogCountTiers`)은 무게·마릿수 칩 대신 구간 칩이라, H1 은 가장 넓은 구간 칩(H1 문장이 말하는 상한),
 * H2 는 **그 줄이 말한 구간**의 칩이다 — 어느 구간인지는 강아지에 따라 갈려 같은 문장 함수(`tooManyText`)로 줄과 맞춰 찾는다.
 */
const REASON_BADGE: Record<string, (policy: TPetPolicy, reason: TReason) => string | undefined> = {
  H0: () => BADGE_LABEL.notAllowed,
  H1: (policy) => {
    const tiers = dogCountTiers(policy);
    return tiers ? dogTierBadgeLabel(tiers[tiers.length - 1]) : weightLimitBadgeLabel(policy);
  },
  // 접은 칩('최대 2마리')은 '20kg 미만은 1마리까지예요' 와 반대로 읽혔고(웨스티하우스), 구간 칩이면 같은 말('20kg 미만 1마리')이다.
  H2: (policy, reason) => {
    const tiers = dogCountTiers(policy);
    if (!tiers) return maxDogsBadgeLabel(policy);
    const tier = tiers.find((t) => tooManyText(t) === reason.text);
    return tier && dogTierBadgeLabel(tier);
  },
  H3: () => BADGE_LABEL.smallDogOnly,
  H7: () => BADGE_LABEL.largeDogNo,
  H4: cageBadgeLabel,
  H5: cageBadgeLabel,
  H6: () => BADGE_LABEL.outdoorOnly,
  C1: () => BADGE_LABEL.outdoorOnly,
  C2: cageBadgeLabel,
  C3: cageBadgeLabel,
  C4: cageBadgeLabel,
  C6: () => BADGE_LABEL.callFirst,
  C8: () => BADGE_LABEL.vaccineRequired,
  C11: (policy) => (policy.petDays?.length ? petDaysBadgeLabel(policy.petDays) : undefined),
  C7: () => UNREAD_BADGE_LABEL,
  // 몸무게 문턱 줄은 무게 상한 칩('13kg 미만')과 같은 말이다. 구간 칩이면 그 줄이 말한 구간의 칩(H2 와 같은 찾기).
  I2: (policy, reason) => {
    const tiers = dogCountTiers(policy);
    const tier = (tiers ?? policy.tiers.filter((t) => t.maxWeightKg === policy.weightLimitKg)).find((t) =>
      saysNearLimitBound(reason.text, t),
    );
    if (!tier) return undefined;
    return tiers ? dogTierBadgeLabel(tier) : weightLimitBadgeLabel(policy);
  },
};

const reasonBadge = (policy: TPetPolicy, reason: TReason | undefined): string | undefined =>
  reason?.rule === undefined ? undefined : REASON_BADGE[reason.rule]?.(policy, reason);

/**
 * 판정을 정한 근거(`primaryReason`)와 같은 말을 하는 원문 칩 — **이유 줄이 없는 카드(상세의 근처 장소)** 가 이 칩을 맨 앞에 세운다(14 W261013.1c).
 * 칩 한 자리 옆 '이용하기 어려워요' 는 그 칩을 이유로 읽는다: 웨스티하우스 × 콩·해피가 '10kg 미만 2마리' 를 앞에 세워 "2마리 된다는데 왜 어렵지" 였다
 * (판정은 '20kg 미만 1마리'). 이유 줄이 있는 카드는 줄이 그 말을 하므로 같은 칩을 오히려 뺀다(`verdictHidesBadge`) — 둘은 반대 방향이라 입력을 나눈다.
 */
export const reasonBadgeLabel = (e: TEligibility, policy: TPetPolicy): string | undefined => reasonBadge(policy, primaryReason(e));

/**
 * 목록 카드의 이유 줄들 — 보통은 판정을 정한 근거 하나(`primaryReason`)지만 **어려움이면 어려움 근거 전부**다(14 W261027.1).
 * 어려움 근거는 하나하나가 따로 막는다: '해피(12kg)는 7kg 미만 조건을 넘어요' 하나만 서면 두 마리라서도 안 된다는 것이 안 보여
 * "해피만 두고 가면 되나" 로 읽혔다. 확인 필요의 다른 근거는 막는 것이 아니라 물어볼 것이라 상세에 맡긴다.
 */
export const cardReasons = (e: TEligibility): TReason[] => {
  if (e.level === 'hard') return e.reasons.filter((r) => r.level === 'hard');
  const primary = primaryReason(e);
  return primary ? [primary] : [];
};

/** 판정 옆 첫 자리를 판정을 정한 조건이 차지하는가 — 어려움 · 확인 필요(야외 자리만 되는 곳은 판정이 '갈 수 있어요' 쪽이라 아니다). */
const verdictLeadsWithReason = (e: TEligibility): boolean =>
  e.level === 'hard' || (e.level === 'cond' && !isOutdoorSeatOnly(e));

/**
 * 카드 판정 글자 바로 옆에 앞세울 원문 칩 — 이유 줄(`cardReasons`)과 같은 조건, 이유 줄 순서대로(14 W261027.1).
 * '이용하기 어려워요 · 최대 1마리' 옆 "두부(7kg)는 5kg 이하 조건을 넘어요" 는 칩을 이유로 읽게 했다 — 판정 옆 한 자리는 이유 자리다.
 * 그래서 이유 줄과 같은 말을 하는 칩을 빼던 것(W261013.1)을 어려움·확인 필요에선 거꾸로 앞에 세운다. 그 밖의 조건은 뒤로 밀려 '외 N개' 로 접힌다.
 */
export const verdictLeadBadges = (e: TEligibility, policy: TPetPolicy): string[] => {
  if (!verdictLeadsWithReason(e)) return [];
  const labels = cardReasons(e).map((r) => reasonBadge(policy, r));
  return [...new Set(labels.filter((label): label is string => label !== undefined))];
};

/**
 * 판정 배지·이유 줄과 같은 줄에 서는 원문 칩 중 **카드(목록·지도 시트·상세의 근처 장소)에서 뺄 것**(14 W261013.1). 칩은 원문 속성이고 판정은 우리 강아지의
 * 답인데, 한 카드에 나란히 서면 한 문장처럼 읽힌다 — 둘이 다른 말을 하면 판정을 못 믿고, 같은 말을 하면 카드가 같은 말을 두세 번 한다.
 *
 * - **받아 준다는 ✓ 칩(크기·실내)은 판정이 받아 줄 때만**(갈 수 있어요 · 야외 자리에서 갈 수 있어요). '이용하기 어려워요' 옆 '✓ 중형견 OK'
 *   (웨스티하우스, 중형견은 1마리), '확인이 필요해요' 옆 '✓ 실내 OK'(정체불명)는 판정과 반대 말로 읽혔다. 요금 ✓ 는 받아 주는지와 무관해 남는다.
 * - **어려움이면 요금 칩을 전부 뺀다**(14 W261013.1a) — 판정이 요금을 싣지 않는 것(`judgeEligibility`)과 같은 이유다: '이용하기 어려워요' 옆
 *   '1마리당 1~2만원'(웨스티하우스 × 콩·해피)은 우리가 낼 돈으로 읽힌다. `feeLine` 이 없어 `PetBadges` 가 스스로는 못 거른다.
 * - **머리글이 야외 자리를 말하면 '야외만' 을 뺀다.**
 * - **판정이 '갈 수 있어요' 쪽이면(갈 수 있어요 · 야외 자리만 · I2) 이유 줄이 말한 칸의 칩을 뺀다**(`REASON_BADGE`). `shownReason` 은 `primaryReason` 이 아니라
 *   **카드에 실제로 그린 줄**이다 — 목록 머리가 같은 이유를 한 번 말해 줄을 뺀 카드(`hideReasonText`)는 칩이 그 카드의 유일한 단서라 남긴다.
 *   어려움·확인 필요는 빼지 않는다 — 그 칩이 판정 옆 첫 자리에 선다(`verdictLeadBadges`, 14 W261027.1). 빼면 남은 다른 조건이 그 자리에서 이유로 읽혔다.
 *
 * 상세는 거르지 않는다 — 원문 칩 전부가 원문 위에 선다.
 */
export const verdictHidesBadge =
  (e: TEligibility, policy: TPetPolicy, shownReason: TReason | undefined) =>
  (badge: TPetBadge): boolean => {
    const outdoorSeat = isOutdoorSeatOnly(e);
    if (e.level !== 'ok' && !outdoorSeat && badge.tone === 'ok' && (badge.axis === 'size' || badge.axis === 'indoor')) return true;
    if (e.level === 'hard' && badge.axis === 'fee') return true;
    if (outdoorSeat && badge.label === BADGE_LABEL.outdoorOnly) return true;
    if (verdictLeadsWithReason(e)) return false;
    const said = reasonBadge(policy, shownReason);
    return said !== undefined && badge.label === said;
  };

// 화면(폼)에서 이동 수단 4택을 그릴 때 쓰는 라벨·설명. 여기 두는 이유는 판정 규칙 문구와
// 짝을 맞춰 관리하기 위해서다 — 규칙 문구가 바뀌면 이 설명도 같이 봐야 한다.
// '없어요' 설명은 몸무게를 모른 채 모든 크기에 뜬다 — "안고" 같은 크기에 기댄 말을 넣지 않는다(30kg 은 못 안는다, 14 W261013.14c).
export const CARRIER_LABELS: Record<TCarrier, { label: string; hint: string }> = {
  none: { label: '없어요', hint: '케이지·이동가방·유모차 없이 리드줄만 써요' },
  bag: { label: '이동가방·슬링백', hint: '천 가방이나 슬링백에 넣어 다녀요' },
  cage: { label: '케이지', hint: '딱딱한 이동장(하드 케이지)을 써요' },
  stroller: { label: '유모차', hint: '반려동물용 유모차를 밀고 다녀요' },
};

/**
 * 한 줄 요약(설정 강아지 줄)에서 이동 수단을 말하는 문구. 폼의 라벨 '없어요' 는 질문("이동 수단이 있나요?")
 * 밑에서만 뜻이 통하고, 요약에선 무엇의 값인지 사라진다.
 */
export const carrierSummary = (carrier: TCarrier): string =>
  carrier === 'none' ? '이동 수단 없음' : CARRIER_LABELS[carrier].label;
