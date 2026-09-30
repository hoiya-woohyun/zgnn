/**
 * 반려동물 이용 조건 파서.
 *
 * ✅ 판단 규칙은 여기서 조정한다. 아래 상수 테이블(INDOOR_RULES / FLAG_RULES / NUMBER_RULES /
 *    OUTDOOR_FREE_PATTERNS / UNLIMITED_DOGS_PATTERNS)이 규칙의 전부이고, 나머지 코드는 테이블을
 *    순서대로 적용하기만 한다. 새 표현이 나오면 정규식 한 줄을 알맞은 테이블에 추가하면 된다.
 *
 * 원문(petPolicyText)은 작성자가 손으로 쓴 한국어 문장이라 100% 구조화할 수 없다.
 * 그래서 화면에서는 여기서 뽑아낸 값을 "필터와 배지"로만 쓰고, 상세 화면에는 항상 원문을
 * 그대로 함께 보여준다. 파서가 놓친 조건이 있어도 사용자가 원문에서 확인할 수 있어야 한다.
 */

import { normalizeFeeLines } from '../../scripts/lib/feeLine.mjs';
import { correctPetPolicyFacts, feeLinesOf } from '../../scripts/lib/petPolicyFacts.mjs';
import type { TPetPolicyFacts } from '../types';

export type TIndoorPolicy =
  /** 실내 자유 */
  | 'free'
  /** 실내는 케이지·이동가방·유모차 필요 */
  | 'cage'
  /** 실내 불가, 야외만 */
  | 'outdoorOnly'
  /** 원문에 실내 관련 언급이 없음 (숙소는 대부분 여기에 해당) */
  | 'unknown';

/**
 * 문장 하나에 담긴 계단식 조건 한 칸. "10kg 미만은 2마리, 20kg 미만은 1마리" 처럼
 * 여러 칸이 나오면 tiers 배열에 칸마다 하나씩 쌓인다.
 */
export type TPolicyTier = {
  /** 무게 상한. 없으면 이 tier 는 마릿수만 말한다 */
  maxWeightKg?: number;
  /** true 면 '이하/까지'(포함), false 면 '미만'(제외) */
  weightInclusive?: boolean;
  /** 마릿수 상한. 없으면 이 tier 는 무게만 말한다 */
  maxDogs?: number;
  /** 근거 문장(원문 그대로, trim 만 적용) */
  source: string;
};

export type TPetPolicy = {
  indoor: TIndoorPolicy;
  leash: boolean;
  largeDogOk: boolean;
  mediumDogOk: boolean;
  smallDogOnly: boolean;
  callFirst: boolean;
  weightLimitKg?: number;
  maxDogs?: number;
  feeFree: boolean;
  /** 추가 요금이 **있다고만** 읽었다(AI `feeFree: false`, 금액 문장은 없음). 요금 문장이 있으면 그 문장이 배지가 된다 */
  feeCharged: boolean;
  feeText?: string;
  noInfo: boolean;
  /**
   * 원문이 '대형견은 안 된다' 고 적혀 있다(정규식 또는 AI `largeDogOk: false`). `largeDogOk` 가 boolean 한 칸이라
   * "불가" 와 "언급 없음" 이 둘 다 false 였다 — 그래서 대형견 보호자에게 '확인 필요 · 대형견 언급이 없어요' 로 보였다(todo/06 A-2).
   * 이 값이 서면 `largeDogOk` 는 false 다(둘이 같이 서면 제한 쪽을 믿는다).
   */
  largeDogNo: boolean;
  /**
   * 원문이 **있는데** 정규식도 AI 도 판정에 쓸 조건을 하나도 못 읽었다. 빈 원문(`noInfo`)과 다르다 — 무언가 적혀 있다.
   * 이 값이 없으면 제한 없음으로 읽혀 '갈 수 있어요' 가 됐다(todo/06 A-1, BUG-008 의 옆길). 판정은 C7(확인 필요).
   * "애견동반 가능해요!" 처럼 **일반 허용 문장만** 있는 원문은 읽은 것으로 본다(`GENERIC_ALLOWED`).
   */
  unread: boolean;
  /** '애견동반 안됩니다' 처럼 원문이 동반 자체를 막는다고 적혀 있음. 판정은 강아지 조건과 무관하게 어려움(H0) */
  notAllowed: boolean;
  /** 계단식 무게·마릿수 조건. 웨스티하우스 → [{10,미만,2},{20,미만,1}] */
  tiers: TPolicyTier[];
  /** '실외는 자유', '실내외 모두 가능' 처럼 야외 이용이 열려 있음. indoor==='outdoorOnly' 도 포함 */
  outdoorFree: boolean;
  /** '견수 제한 없음' — 숫자 없는 무제한 마릿수 */
  unlimitedDogs: boolean;
  /**
   * 요금 문장 전부(원문 순서, 중복 제거). **배지·판정·요금 문구가 전부 이 배열을 본다** — `feeText` 가 아니다.
   * `feeText`(첫 줄)는 이제 읽는 코드가 없고 테스트만 단정한다. 지우지 않는 이유는 그 테스트들이 시드 86곳의
   * 파싱 결과를 못 박고 있어서다(`petPolicy.test.ts`) — 값이 바뀌면 그쪽이 먼저 빨개진다.
   */
  feeLines: string[];
  /** 규칙별 근거 문장(원문 그대로). reasons.quote 의 재료 */
  sources: Partial<
    Record<
      | 'indoor'
      | 'largeDogOk'
      | 'largeDogNo'
      | 'mediumDogOk'
      | 'smallDogOnly'
      | 'callFirst'
      | 'leash'
      | 'feeFree'
      | 'noInfo'
      | 'notAllowed',
      string
    >
  >;
};

/**
 * 실내 동반 판정. 위에서부터 먼저 걸리는 규칙이 이긴다.
 * "실내외 모두 가능하지만 실내에서는 유모차/이동 가방 필요" 처럼 두 조건이 같이 나오는 문장이
 * 있어서 순서가 중요하다 — 더 제한적인 쪽을 먼저 본다.
 */
const INDOOR_RULES: { indoor: Exclude<TIndoorPolicy, 'unknown'>; patterns: RegExp[] }[] = [
  {
    indoor: 'outdoorOnly',
    patterns: [
      /실내\s*불가/,
      /야외\s*테이블만/,
      /바깥[^.\n]*자리만/,
      /운동장\s*입장만/,
      /야외석만/,
      // 블로그 구어체(2026-09-28 첫 data:analyze 실측): "애견동반은 야외좌석만 가능해요" · "테라스만 가능" · "실내는 안 돼요"
      /야외\s*(좌석|자리|테라스)\s*(에서)?만/,
      /테라스(석|\s*자리)?\s*(에서)?만/,
      /실내[^.\n]{0,8}(안\s*돼|안\s*됩|안\s*된|금지)/,
    ],
  },
  {
    indoor: 'cage',
    patterns: [
      /케이지\s*동반/,
      /케이지\s*필수/,
      /이동\s*가방\s*(필요|필수)/,
      /유모차/,
      // "이동가방(켄넬)이나 유모차를 지참" · "케이지나 전용 가방을 챙겨가야" · "켄넬이나 이동가방이 있으면 이용 가능"
      /(케이지|켄넬|이동장|크레이트|이동\s*가방|캐리어)[^.\n]{0,14}(필수|필요|지참|챙겨|있으면|있어야)/,
    ],
  },
  {
    indoor: 'free',
    patterns: [/실내외\s*모두\s*가능/, /케이지\s*없이도?\s*가능/, /실외는\s*자유/],
  },
];

/**
 * '대형견 불가능' 처럼 부정이 붙은 문장을 허용으로 읽지 않기 위한 공통 조각.
 * 견종 바로 뒤 16자 안에 '불가' 가 있으면 그 문장은 매치시키지 않는다.
 */
const NOT_DENIED = String.raw`(?![^.\n]{0,16}불가)`;

/**
 * 동반 자체가 안 된다는 문장. "애견동반은 아쉽게도 안됩니다" — 블로그에서 뽑은 문장(data:analyze)에 실제로 들어왔다(2026-09-28).
 * 주어(애견·반려견·강아지…)와 '동반/출입/입장' 이 붙어 있을 때만 잡는다 — '대형견 불가' 같은 크기 조건은 NOT_DENIED 가 따로 다룬다.
 */
const NOT_ALLOWED_PATTERNS = [/(애견|반려견|반려\s*동물|강아지|댕댕이|펫)\s*(동반|출입|입장)[^.\n]{0,12}(불가|안\s*됩|안\s*돼|안\s*된|금지|어렵|어려워)/];

/**
 * 대형견이 안 된다는 문장. '대형견 제한 없음'(허용) 은 걸리지 않게 '제한' 바로 뒤의 '없' 을 막는다.
 * '어렵' 과 '어려워' 를 따로 적는 이유: '어려워요' 에는 '어렵' 이 없다(ㅂ 불규칙) — 한쪽만 적으면 가장 흔한 말투를 놓친다.
 */
const LARGE_DOG_NO = /대형견[^.\n]{0,12}(불가|안\s*돼|안\s*됩|안\s*된|어렵|어려워|금지|제한(?!\s*(이\s*)?없))/;

/**
 * 조건 없이 "된다" 고만 하는 문장("애견동반 가능해요!"). 이것뿐인 원문은 **읽은 것**이다 — 제한이 적혀 있지 않다는 것까지가 원문이다.
 * 제한을 암시하는 말(야외·kg·케이지·요금…)이 섞인 문장은 여기서 빼서, 파서가 못 읽은 제한이 '일반 허용' 으로 묻히지 않게 한다.
 */
const GENERIC_ALLOWED = /(동반|입장|출입|이용|방문|함께)[^.\n]{0,10}(가능|환영|OK|돼요|됩니다|할 수 있)/i;
const RESTRICTION_HINT = /야외|테라스|실내|실외|마당|케이지|켄넬|가방|유모차|kg|마리|소형|중형|대형|목줄|리드|요금|\d\s*만?\s*원|문의|전화|예약|만\s*(가능|입장|이용)|제한|불가|안\s*(돼|됩|된)/i;
const isGenericAllowance = (sentence: string) => GENERIC_ALLOWED.test(sentence) && !RESTRICTION_HINT.test(sentence);

/** 참/거짓 하나로 떨어지는 조건들. */
const FLAG_RULES: {
  key: keyof TPetPolicy &
    ('leash' | 'largeDogOk' | 'largeDogNo' | 'mediumDogOk' | 'smallDogOnly' | 'callFirst' | 'feeFree' | 'noInfo' | 'notAllowed');
  patterns: RegExp[];
}[] = [
  // '오프리쉬' 의 '리쉬' 는 넣지 않는다 — 풀어 놓아도 된다는 말을 목줄 조건으로 읽게 된다.
  { key: 'leash', patterns: [/리드\s*줄/, /목줄/, /하네스/] },
  {
    key: 'largeDogOk',
    patterns: [
      new RegExp(String.raw`대형견${NOT_DENIED}[^.\n]{0,16}(가능|환영|입장)`),
      /무게\s*제한[^.\n]{0,6}없/, // '몸무게 제한 없음' 도 포함된다
      /견종\s*제한[^.\n]*없/, // '견종 제한, 견수 제한 없음'
      /모든\s*견종/,
    ],
  },
  // '대형견은 어려워요' · '대형견 입장 불가' — 크기 조건의 부정. '대형견 제한 없음' 은 허용이라 '제한' 뒤에 '없' 이 오면 뺀다.
  { key: 'largeDogNo', patterns: [LARGE_DOG_NO] },
  {
    key: 'mediumDogOk',
    patterns: [new RegExp(String.raw`중형견${NOT_DENIED}[^.\n]{0,16}(가능|환영|입장)`)],
  },
  // '소형견에 한해 동반 입실 가능' 처럼 크기를 소형견으로 못박은 경우.
  // 숫자 상한이 적혀 있지 않아 weightLimitKg 로는 잡히지 않는다.
  { key: 'smallDogOnly', patterns: [/소형견(에\s*한해|만)/] },
  // '주차 문의' 같은 곁다리 문장이 방문 전 확인으로 읽히지 않게 주어를 함께 본다.
  { key: 'callFirst', patterns: [/(전화|방문\s*전)[^.\n]*(확인|문의)/] },
  // '무료 주차' 가 아니라 반려동물 동반 요금이 없다는 뜻일 때만 잡는다.
  { key: 'feeFree', patterns: [/(추가금|추가\s*요금)[^.\n]*없/, /무료\s*동반/, /동반[^.\n]*무료/] },
  { key: 'noInfo', patterns: [/정보\s*없음/] },
  { key: 'notAllowed', patterns: NOT_ALLOWED_PATTERNS },
];

/**
 * '실외는 자유', '실내외 모두 가능' 처럼 야외 이용이 열려 있다는 단서.
 * indoor==='outdoorOnly' 도 (야외만이지만 그 야외가 자유롭다는 뜻이라) 별도로 true 취급한다.
 */
const OUTDOOR_FREE_PATTERNS = [/실외는?\s*자유/, /실내외\s*모두\s*가능/];

/**
 * '견수 제한 없음' 처럼 숫자 없이 마릿수가 무제한이라는 단서.
 * 백화stay "견종 제한, 견수 제한 없음." 처럼 한 문장에 다른 규칙과 같이 나올 수 있다.
 */
const UNLIMITED_DOGS_PATTERNS = [/견수\s*제한[^.\n]*없/, /마릿수\s*제한[^.\n]*없/];

/** 숫자를 뽑는 규칙. 둘 다 문장 하나(tier) 안에서 찾는다. */
const NUMBER_RULES = {
  /** tier 하나의 무게 상한. 그룹2가 '미만'이면 배타(weightInclusive=false), 아니면 포함. */
  weightLimitKg: /(\d+)\s*kg\s*(미만|이하|까지)/i,
  // '1마리당' 은 요금 단위지 마릿수 제한이 아니라서 일부러 빠져 있다.
  maxDogs: [/최대\s*(\d+)\s*마리/, /(\d+)\s*마리까지/, /(\d+)\s*마리만/],
};

/**
 * 숙소 요금 문장. '1마리당 3만원' 같은 문장을 전부(g) 뽑는다.
 * 숫자가 앞에 붙은 '원' 만 요금으로 본다 — 그러지 않으면 '공원'·'병원'·'정원' 이 요금이 된다.
 */
const FEE_TEXT_RULE = /[^.\n]*\d[\d,.]*\s*만?\s*원[^.\n]*/g;

/**
 * 요금 줄에 든 숫자들(쉼표 제거). 두 줄이 **같은 요금을 다르게 쓴 것인지** 판별하는 데 쓴다(`withPolicyFacts`) —
 * 말투·띄어쓰기는 모델이 바꾸지만 금액은 원문 숫자여야 하므로(`petPolicyFacts.mjs`) 숫자가 그 줄의 지문이다.
 */
const feeDigits = (line: string): string[] => line.replace(/,/g, '').match(/\d+(?:\.\d+)?/g) ?? [];

const matchesAny = (text: string, patterns: RegExp[]) => patterns.some((re) => re.test(text));

const firstNumber = (text: string, patterns: RegExp[]): number | undefined => {
  for (const re of patterns) {
    const m = re.exec(text);
    if (m) return Number(m[1]);
  }
  return undefined;
};

/**
 * 문장 단위로 쪼갠다('.' 또는 줄바꿈 기준). 빈 조각은 버린다.
 * '1.5만원' 의 소수점은 문장 끝이 아니라서 숫자 앞의 '.' 은 건너뛴다.
 */
const splitSentences = (text: string): string[] =>
  text
    .split(/\.(?!\d)|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);

/** 문장들 중 패턴에 처음 걸리는 것을 근거 문장으로 돌려준다. */
const findSource = (sentences: string[], patterns: RegExp[]): string | undefined =>
  sentences.find((s) => matchesAny(s, patterns));

/**
 * 계단식 무게·마릿수 조건(tiers). 문장 단위로 쪼개 무게 상한과 마릿수를 뽑고,
 * 같은 문장에 둘 다 있으면 한 tier 로 묶는다(오제 "1마리당 3만원. (최대 2마리 15kg 미만)").
 *
 * 무게만 있는 문장 하나 + 마릿수만 있는 문장 하나가 (합쳐지지 못한 채) 남으면 사실 같은 조건을
 * 나눠 적은 것으로 보고 병합한다(달중이네 "최대 3마리까지 가능. (15kg까지)" → {15,까지,3}).
 * 그 외의 경우(무게만/마릿수만 문장이 여럿이거나 짝이 안 맞으면)는 억지로 합치지 않고
 * 각각 자기 필드만 채운 tier 로 남긴다.
 */
const extractTiers = (text: string): TPolicyTier[] => {
  const raw: TPolicyTier[] = [];
  for (const sentence of splitSentences(text)) {
    const weightMatch = NUMBER_RULES.weightLimitKg.exec(sentence);
    const maxDogs = firstNumber(sentence, NUMBER_RULES.maxDogs);
    if (!weightMatch && maxDogs === undefined) continue;
    raw.push({
      maxWeightKg: weightMatch ? Number(weightMatch[1]) : undefined,
      weightInclusive: weightMatch ? weightMatch[2] !== '미만' : undefined,
      maxDogs,
      source: sentence,
    });
  }

  const both = raw.filter((t) => t.maxWeightKg !== undefined && t.maxDogs !== undefined);
  const weightOnly = raw.filter((t) => t.maxWeightKg !== undefined && t.maxDogs === undefined);
  const dogsOnly = raw.filter((t) => t.maxWeightKg === undefined && t.maxDogs !== undefined);

  if (weightOnly.length === 1 && dogsOnly.length === 1) {
    return [
      ...both,
      {
        maxWeightKg: weightOnly[0].maxWeightKg,
        weightInclusive: weightOnly[0].weightInclusive,
        maxDogs: dogsOnly[0].maxDogs,
        source: `${dogsOnly[0].source}. ${weightOnly[0].source}`,
      },
    ];
  }
  return [...both, ...weightOnly, ...dogsOnly];
};

/** tiers 중 무게 상한의 최댓값 — 화면·필터가 계속 쓰는 기존 weightLimitKg. */
const weightLimitKgFromTiers = (tiers: TPolicyTier[]): number | undefined => {
  const limits = tiers.map((t) => t.maxWeightKg).filter((v): v is number => v !== undefined);
  return limits.length > 0 ? Math.max(...limits) : undefined;
};

/** tiers 중 마릿수 상한의 최댓값 — 화면·필터가 계속 쓰는 기존 maxDogs. */
const maxDogsFromTiers = (tiers: TPolicyTier[]): number | undefined => {
  const counts = tiers.map((t) => t.maxDogs).filter((v): v is number => v !== undefined);
  return counts.length > 0 ? Math.max(...counts) : undefined;
};

export const parsePetPolicy = (petPolicyText: string): TPetPolicy => {
  const text = petPolicyText ?? '';
  const sentences = splitSentences(text);

  const indoorRule = INDOOR_RULES.find((rule) => matchesAny(text, rule.patterns));
  const indoor = indoorRule?.indoor ?? 'unknown';

  const flags = {
    leash: false,
    largeDogOk: false,
    mediumDogOk: false,
    smallDogOnly: false,
    callFirst: false,
    feeFree: false,
    noInfo: false,
    notAllowed: false,
    largeDogNo: false,
  };
  const sources: TPetPolicy['sources'] = {};
  for (const rule of FLAG_RULES) {
    flags[rule.key] = matchesAny(text, rule.patterns);
    if (flags[rule.key]) {
      const source = findSource(sentences, rule.patterns);
      if (source) sources[rule.key] = source;
    }
  }
  // 원문이 아예 비어 있으면 '정보 없음' 과 같다(pet-policy-and-eligibility.md 의 표). 시드 86곳은 빈 값이 없어 드러나지 않았지만
  // 블로그에서 온 신규 장소는 조건 문장이 없을 때 '' 로 들어온다 — 이 줄이 없으면 그 장소가 '갈 수 있어요' 로 판정된다(BUG-008).
  // 근거 문장이 없으므로 sources.noInfo 는 두지 않는다.
  if (text.trim() === '') flags.noInfo = true;
  if (indoorRule) {
    const source = findSource(sentences, indoorRule.patterns);
    if (source) sources.indoor = source;
  }

  // 대형견이 된다와 안 된다가 같이 걸리면(한 원문에 두 문장) 제한 쪽을 믿는다 — 지어낸 허용이 가장 비싸다.
  if (flags.largeDogNo) {
    flags.largeDogOk = false;
    delete sources.largeDogOk;
  }
  // 대형견이 되면 중형견도 당연히 된다. sources 는 실제로 매치된 문장만 담으므로 이 뒤에 둔다.
  if (flags.largeDogOk) flags.mediumDogOk = true;

  const tiers = extractTiers(text);
  // 중복을 턴다 — 같은 요금 문장이 두 번 적힌 원문이 있고, 배지의 key 가 라벨이라 React 키 충돌이 난다.
  const feeLines = [...new Set([...text.matchAll(FEE_TEXT_RULE)].map((m) => m[0].trim()))];
  const outdoorFree = indoor === 'outdoorOnly' || matchesAny(text, OUTDOOR_FREE_PATTERNS);
  const unlimitedDogs = matchesAny(text, UNLIMITED_DOGS_PATTERNS);

  const policy: TPetPolicy = {
    indoor,
    ...flags,
    feeCharged: false,
    unread: false,
    weightLimitKg: weightLimitKgFromTiers(tiers),
    maxDogs: maxDogsFromTiers(tiers),
    feeText: feeLines[0],
    tiers,
    outdoorFree,
    unlimitedDogs,
    feeLines,
    sources,
  };
  policy.unread = text.trim() !== '' && readNothing(policy) && !sentences.every(isGenericAllowance);
  return policy;
};

/** 판정·배지에 쓰일 조건이 하나도 없다. 새 필드를 TPetPolicy 에 더하면 **여기에도** 더한다 — 빠지면 읽은 원문이 '못 읽음' 이 된다. */
const readNothing = (p: TPetPolicy): boolean =>
  p.indoor === 'unknown' &&
  !p.leash &&
  !p.largeDogOk &&
  !p.largeDogNo &&
  !p.mediumDogOk &&
  !p.smallDogOnly &&
  !p.callFirst &&
  !p.feeFree &&
  !p.feeCharged &&
  !p.noInfo &&
  !p.notAllowed &&
  p.tiers.length === 0 &&
  p.feeLines.length === 0 &&
  !p.outdoorFree &&
  !p.unlimitedDogs;

/**
 * AI 가 판단한 구조화 값(TPetPolicyFacts, 블로그 경로)으로 정규식 파서 결과를 덮는다. 원문(petPolicyText)은 그대로 화면에 보이고,
 * 판정에 쓰는 필드만 AI 판단이 우선한다 — 블로그 구어체("야외좌석만 가능해요")는 정규식이 못 읽는 것이 많아서다(2026-09-28 첫 분석: 32건 중 20건).
 * null 은 "언급 없음" 이라 파서 값을 남긴다. 무게·마릿수는 tiers 에도 넣어 eligibility 의 계단식 규칙(H1·H2)이 같은 숫자를 보게 한다.
 * 시드 86곳은 facts 가 없어 이 함수를 그대로 통과한다(ADR-017).
 *
 * **덮기 전에 두 번 보정한다**(ADR-017 v2):
 * 1. `correctPetPolicyFacts` — 원문에 근거 단어·숫자가 없는 AI 판단을 뺀다. 분석 시점에도 같은 함수가 돌지만, 그 전에 저장된 값이
 *    DB 에 남아 있어 읽는 쪽에서도 한 번 더 부른다(두 번 불러도 결과가 같다).
 * 2. **제한은 정규식이 이긴다** — AI 가 '실내 자유'·'대형견 가능' 이라 했는데 원문 규칙이 케이지·야외만·대형견 불가를 읽었으면
 *    규칙 쪽을 남긴다. 규칙은 원문의 그 문장을 짚어 걸리는 것이고, 모델이 그 문장을 놓친 쪽이 더 흔하다.
 */
export const withPolicyFacts = (parsed: TPetPolicy, facts: TPetPolicyFacts | null | undefined, petPolicyText = ''): TPetPolicy => {
  const corrected = correctPetPolicyFacts(facts, petPolicyText).facts;
  if (!corrected) return parsed;
  const next: TPetPolicy = { ...parsed, sources: { ...parsed.sources }, tiers: [...parsed.tiers], feeLines: [...parsed.feeLines] };
  const lines = petPolicyText.split('\n').map((s) => s.trim()).filter(Boolean);
  const firstLine = lines[0] ?? '';
  const lineWith = (re: RegExp) => lines.find((line) => re.test(line)) ?? firstLine;

  const regexRestricts = parsed.indoor === 'cage' || parsed.indoor === 'outdoorOnly';
  if (corrected.indoor !== 'unknown' && !(corrected.indoor === 'free' && regexRestricts)) {
    next.indoor = corrected.indoor;
    if (!next.sources.indoor && firstLine) next.sources.indoor = firstLine;
  }
  if (corrected.leash) next.leash = true;
  if (corrected.largeDogOk === false) {
    next.largeDogNo = true;
    next.largeDogOk = false;
    delete next.sources.largeDogOk;
    if (!next.sources.largeDogNo) next.sources.largeDogNo = lineWith(/대형/);
  } else if (corrected.largeDogOk === true && !parsed.largeDogNo) {
    next.largeDogOk = true;
    next.mediumDogOk = true;
  }
  if (corrected.smallDogOnly) next.smallDogOnly = true;
  if (corrected.callFirst) next.callFirst = true;
  if (corrected.feeFree !== null) {
    next.feeFree = corrected.feeFree;
    next.feeCharged = corrected.feeFree === false;
  }
  /*
   * 요금은 AI 목록을 앞에 세우고 **숫자가 덮이지 않은 정규식 줄만 남긴다**(잔여 병합). 다른 필드처럼 통째로
   * 덮을 수 없다 — 그것이 `dogFee` 를 **확정된 틀린 금액**으로 몰기 때문이다(2026-09-30 실측):
   *
   *   원문 `1마리당 3만원. (2마리 또는 10kg 이상 4만원)` · 옛 모양 후보(`feeText` 한 칸 = `1마리당 3만원`) · 2마리
   *     덮으면 → feeLines `['1마리당 3만원']` → "악동이와 두부는 6만원" (원문은 **4만원**이다)
   *     남기면 → feeLines 두 줄 → `hasUnusedCondition` 이 켜져 "원문 요금 · …" 로 물러난다
   *
   * 곱셈을 막는 유일한 근거가 "안 쓰인 줄에 마리·kg 이 있다" 인데(`dogFee.ts` 의 `hasUnusedCondition`), 덮기는
   * 그 **가드의 입력을 지운다.** 옛 후보는 필연적으로 요금이 한 줄이라(스키마가 문자열 한 칸이었다) 기준이 여럿인
   * 곳 전부가 이 함정에 걸린다 — 218건이 그 모양이다.
   *
   * 그래도 통째로 남기지는 않는다. 정규식은 '원' 이 든 문장을 통째로 집으므로("1마리당 2만원 추가, 청소비 5만원")
   * AI 가 기준별로 가른 줄과 나란히 서면 같은 요금이 두세 번 보인다. 그래서 **숫자로 판별한다**: 정규식 줄의 숫자가
   * 전부 AI 줄들에 있으면 같은 말을 다르게 쓴 것이라 버리고, 하나라도 없으면 AI 가 놓친 기준이라 남긴다.
   */
  const factFees = feeLinesOf(corrected);
  if (factFees.length) {
    const factDigits = new Set(factFees.flatMap(feeDigits));
    const missed = parsed.feeLines.filter((line) => {
      const digits = feeDigits(line);
      return digits.length > 0 && !digits.every((n) => factDigits.has(n));
    });
    next.feeLines = [...new Set([...factFees, ...missed])];
    next.feeText = next.feeLines[0];
  }
  if (corrected.weightLimitKg !== null) next.weightLimitKg = corrected.weightLimitKg;
  if (corrected.maxDogs !== null) next.maxDogs = corrected.maxDogs;
  if ((corrected.weightLimitKg !== null || corrected.maxDogs !== null) && parsed.tiers.length === 0) {
    next.tiers = [
      {
        maxWeightKg: corrected.weightLimitKg ?? undefined,
        weightInclusive: corrected.weightLimitKg !== null ? true : undefined,
        maxDogs: corrected.maxDogs ?? undefined,
        source: firstLine,
      },
    ];
  }
  next.outdoorFree = next.indoor === 'outdoorOnly' || parsed.outdoorFree;
  // AI 가 조건을 하나라도 읽었으면 '정보 없음' 도 '못 읽음' 도 아니다. notes 는 세지 않는다 — 판정에 안 쓰이는 조건이라,
  // notes 만 있는 원문은 사용자가 원문을 읽어야 한다(unread 가 그 말을 한다).
  const anyFact =
    corrected.indoor !== 'unknown' || corrected.leash || corrected.largeDogOk !== null || corrected.smallDogOnly ||
    corrected.callFirst || corrected.feeFree !== null || factFees.length > 0 || corrected.weightLimitKg !== null ||
    corrected.maxDogs !== null;
  if (anyFact) {
    next.noInfo = false;
    next.unread = false;
  }
  return next;
};

// ─────────────────────────────────────────────────────────────────────────────
// 배지 — 파싱 결과를 화면에 보여줄 한국어 라벨로 옮긴다.
// ─────────────────────────────────────────────────────────────────────────────

export type TBadgeTone = 'ok' | 'cond' | 'warn';

/**
 * 배지가 말하는 **축**. 사이트는 안 쓴다(한 줄에 전부 세운다) — `/admin` 검수 표가 배지를 열로 가르는 데 쓴다.
 *
 * **라벨로 가를 수 없어서 값에 싣는다.** 요금 배지의 라벨은 원문 문장 그 자체이고(`1마리당 2만원`), 그것을
 * 문자열로 알아내려는 시도는 반드시 실패한다 — 옛 `FLAG_COLOR` 가 같은 이유로 영구히 회색이었다(`adminPreview.ts` 머리 주석).
 *
 * `'gear'`(챙겨 갈 것)는 **값으로 갈린다** — `indoor: 'cage'`("케이지 필요")는 실내 판단에서 나오지만 운영자가 그 칸에서
 * 찾는 것은 "무엇을 들고 가야 하나" 다. `free`·`outdoorOnly` 는 챙길 것이 없으므로 `'indoor'` 로 남는다.
 */
export type TBadgeAxis = 'notAllowed' | 'indoor' | 'fee' | 'gear' | 'size' | 'limit' | 'status';

export type TPetBadge = {
  label: string;
  tone: TBadgeTone;
  axis: TBadgeAxis;
};

/** 원문이 "정보 없음" 인 곳의 배지. 판정 배지("정보가 없어요")와 같은 줄에 서면 같은 말이라 `PetBadges` 가 이 라벨로 걸러낸다. */
export const NO_INFO_BADGE_LABEL = '확인된 정보 없음';

/** 원문은 있는데 아무 조건도 못 읽은 곳의 배지(`unread`). 판정이 없는 화면(프로필 미등록)에서도 "그대로 믿지 말 것" 을 말한다. */
export const UNREAD_BADGE_LABEL = '원문 확인 필요';

const INDOOR_BADGE: Record<TIndoorPolicy, TPetBadge | null> = {
  free: { label: '실내 OK', tone: 'ok', axis: 'indoor' },
  // 이 하나만 축이 'gear' 다 — 실내 판단에서 나오지만 사람이 할 일은 "케이지·이동가방·유모차를 챙긴다" 다(`TBadgeAxis`).
  cage: { label: '케이지 필요', tone: 'cond', axis: 'gear' },
  outdoorOnly: { label: '야외만', tone: 'cond', axis: 'indoor' },
  // 숙소 원문에는 실내 언급이 거의 없다. 없는 정보를 배지로 만들지 않는다.
  unknown: null,
};

/**
 * 카드와 상세에서 같은 순서로 보이도록 여기서 순서를 고정한다.
 * 카드에서는 앞에서부터 잘라 쓴다.
 */
export const toPetBadges = (policy: TPetPolicy): TPetBadge[] => {
  const badges: TPetBadge[] = [];

  // 동반 자체가 안 되는 곳은 다른 배지가 의미 없다 — 맨 앞에 하나.
  if (policy.notAllowed) badges.push({ label: '동반 불가', tone: 'warn', axis: 'notAllowed' });

  const indoorBadge = INDOOR_BADGE[policy.indoor];
  if (indoorBadge) badges.push(indoorBadge);

  if (policy.feeFree) badges.push({ label: '추가요금 없음', tone: 'ok', axis: 'fee' });
  /*
   * 요금이 무료가 아니면 원문에서 뽑은 요금 문장을 그대로 배지로 쓴다 — **한 줄이 아니라 전부**(2026-09-30).
   * `feeText`(= `feeLines[0]`) 하나만 쓰던 동안 구간 요금표의 둘째 줄이 화면 어디에도 안 나왔다:
   * "1~5kg 1만원 / 6~10kg 1.5만원" 인 곳이 `1~5kg 1만원` 만 말해, 6kg 강아지 보호자가 요금을 못 본다.
   * 숙소 중에는 이것 말고 배지로 만들 조건이 아예 없는 곳이 있어서, 없으면 카드가 텅 빈다.
   *
   * 라벨은 원문 줄이 아니라 **정규화한 줄**이다(`normalizeFeeLines`) — `(2만원 추가)`·`20,000원`·`숙박일 관계없이 …` 처럼
   * 원문 표기가 제각각이라 배지가 26가지로 흩어졌다. `feeLines` 자체는 건드리지 않는다: 판정·요금 문구가 같은 배열을
   * 앵커된 정규식으로 읽고, 시드 86곳의 파싱 결과가 테스트에 못 박혀 있다. 원문은 상세 화면에 그대로 있다.
   * 정규화가 두 줄을 한 라벨로 합칠 수 있어 중복은 그 함수가 턴다 — 배지 key 가 라벨이다.
   */
  else if (policy.feeLines.length) {
    for (const label of normalizeFeeLines(policy.feeLines)) badges.push({ label, tone: 'cond', axis: 'fee' });
  }
  // AI 가 '요금이 있다' 고만 읽고 금액 문장은 못 뽑은 경우 — 없으면 그 판단이 화면 어디에도 안 보인다(todo/06 A-2).
  else if (policy.feeCharged) badges.push({ label: '추가요금 있음', tone: 'cond', axis: 'fee' });
  // 크기 조건은 하나만 보여준다. 큰 쪽이 되면 작은 쪽은 말할 필요가 없고,
  // '소형견만' 은 숫자 상한이 없는 숙소의 유일한 크기 단서라 맨 뒤에 둔다.
  // '대형견 불가' 가 크기 줄의 맨 앞이다 — 판정 H7 이 이것으로 어려움을 내므로, 배지가 없으면 목록에서 이유가 안 보인다.
  if (policy.largeDogNo) badges.push({ label: '대형견 불가', tone: 'warn', axis: 'size' });
  else if (policy.largeDogOk) badges.push({ label: '대형견 OK', tone: 'ok', axis: 'size' });
  else if (policy.mediumDogOk) badges.push({ label: '중형견 OK', tone: 'ok', axis: 'size' });
  else if (policy.smallDogOnly) badges.push({ label: '소형견만', tone: 'cond', axis: 'size' });

  if (policy.weightLimitKg !== undefined) {
    badges.push({ label: `~${policy.weightLimitKg}kg`, tone: 'cond', axis: 'limit' });
  }
  if (policy.maxDogs !== undefined) {
    badges.push({ label: `최대 ${policy.maxDogs}마리`, tone: 'cond', axis: 'limit' });
  }
  if (policy.leash) badges.push({ label: '리드줄', tone: 'cond', axis: 'gear' });

  // '정보 없음. (문의해보시면 가장 정확할 것 같아요)' 는 두 규칙에 다 걸린다.
  // 같은 말을 두 번 하지 않도록 '정보 없음' 이 있으면 '전화 확인' 은 생략한다.
  if (policy.noInfo) badges.push({ label: NO_INFO_BADGE_LABEL, tone: 'warn', axis: 'status' });
  else if (policy.unread) badges.push({ label: UNREAD_BADGE_LABEL, tone: 'warn', axis: 'status' });
  else if (policy.callFirst) badges.push({ label: '전화 확인', tone: 'warn', axis: 'status' });

  return badges;
};
