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
  feeText?: string;
  noInfo: boolean;
  /** 계단식 무게·마릿수 조건. 웨스티하우스 → [{10,미만,2},{20,미만,1}] */
  tiers: TPolicyTier[];
  /** '실외는 자유', '실내외 모두 가능' 처럼 야외 이용이 열려 있음. indoor==='outdoorOnly' 도 포함 */
  outdoorFree: boolean;
  /** '견수 제한 없음' — 숫자 없는 무제한 마릿수 */
  unlimitedDogs: boolean;
  /** 요금 문장 전부(원문 순서). feeText 는 이 배열의 첫 줄(기존 화면과 호환) */
  feeLines: string[];
  /** 규칙별 근거 문장(원문 그대로). reasons.quote 의 재료 */
  sources: Partial<
    Record<
      'indoor' | 'largeDogOk' | 'mediumDogOk' | 'smallDogOnly' | 'callFirst' | 'leash' | 'feeFree' | 'noInfo',
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
    patterns: [/실내\s*불가/, /야외\s*테이블만/, /바깥[^.\n]*자리만/, /운동장\s*입장만/, /야외석만/],
  },
  {
    indoor: 'cage',
    patterns: [/케이지\s*동반/, /케이지\s*필수/, /이동\s*가방\s*(필요|필수)/, /유모차/],
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

/** 참/거짓 하나로 떨어지는 조건들. */
const FLAG_RULES: {
  key: keyof TPetPolicy &
    ('leash' | 'largeDogOk' | 'mediumDogOk' | 'smallDogOnly' | 'callFirst' | 'feeFree' | 'noInfo');
  patterns: RegExp[];
}[] = [
  { key: 'leash', patterns: [/리드줄/] },
  {
    key: 'largeDogOk',
    patterns: [
      new RegExp(String.raw`대형견${NOT_DENIED}[^.\n]{0,16}(가능|환영|입장)`),
      /무게\s*제한[^.\n]{0,6}없/, // '몸무게 제한 없음' 도 포함된다
      /견종\s*제한[^.\n]*없/, // '견종 제한, 견수 제한 없음'
      /모든\s*견종/,
    ],
  },
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
  };
  const sources: TPetPolicy['sources'] = {};
  for (const rule of FLAG_RULES) {
    flags[rule.key] = matchesAny(text, rule.patterns);
    if (flags[rule.key]) {
      const source = findSource(sentences, rule.patterns);
      if (source) sources[rule.key] = source;
    }
  }
  if (indoorRule) {
    const source = findSource(sentences, indoorRule.patterns);
    if (source) sources.indoor = source;
  }

  // 대형견이 되면 중형견도 당연히 된다. sources 는 실제로 매치된 문장만 담으므로 이 뒤에 둔다.
  if (flags.largeDogOk) flags.mediumDogOk = true;

  const tiers = extractTiers(text);
  const feeLines = [...text.matchAll(FEE_TEXT_RULE)].map((m) => m[0].trim());
  const outdoorFree = indoor === 'outdoorOnly' || matchesAny(text, OUTDOOR_FREE_PATTERNS);
  const unlimitedDogs = matchesAny(text, UNLIMITED_DOGS_PATTERNS);

  return {
    indoor,
    ...flags,
    weightLimitKg: weightLimitKgFromTiers(tiers),
    maxDogs: maxDogsFromTiers(tiers),
    feeText: feeLines[0],
    tiers,
    outdoorFree,
    unlimitedDogs,
    feeLines,
    sources,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// 배지 — 파싱 결과를 화면에 보여줄 한국어 라벨로 옮긴다.
// ─────────────────────────────────────────────────────────────────────────────

export type TBadgeTone = 'ok' | 'cond' | 'warn';

export type TPetBadge = {
  label: string;
  tone: TBadgeTone;
};

/** 원문이 "정보 없음" 인 곳의 배지. 판정 배지("정보가 없어요")와 같은 줄에 서면 같은 말이라 `PetBadges` 가 이 라벨로 걸러낸다. */
export const NO_INFO_BADGE_LABEL = '확인된 정보 없음';

const INDOOR_BADGE: Record<TIndoorPolicy, TPetBadge | null> = {
  free: { label: '실내 OK', tone: 'ok' },
  cage: { label: '케이지 필요', tone: 'cond' },
  outdoorOnly: { label: '야외만', tone: 'cond' },
  // 숙소 원문에는 실내 언급이 거의 없다. 없는 정보를 배지로 만들지 않는다.
  unknown: null,
};

/**
 * 카드와 상세에서 같은 순서로 보이도록 여기서 순서를 고정한다.
 * 카드에서는 앞에서부터 잘라 쓴다.
 */
export const toPetBadges = (policy: TPetPolicy): TPetBadge[] => {
  const badges: TPetBadge[] = [];

  const indoorBadge = INDOOR_BADGE[policy.indoor];
  if (indoorBadge) badges.push(indoorBadge);

  if (policy.feeFree) badges.push({ label: '추가요금 없음', tone: 'ok' });
  // 요금이 무료가 아니면 원문에서 뽑은 요금 문장을 그대로 배지로 쓴다.
  // 숙소 중에는 이것 말고 배지로 만들 조건이 아예 없는 곳이 있어서, 없으면 카드가 텅 빈다.
  else if (policy.feeText) badges.push({ label: policy.feeText, tone: 'cond' });
  // 크기 조건은 하나만 보여준다. 큰 쪽이 되면 작은 쪽은 말할 필요가 없고,
  // '소형견만' 은 숫자 상한이 없는 숙소의 유일한 크기 단서라 맨 뒤에 둔다.
  if (policy.largeDogOk) badges.push({ label: '대형견 OK', tone: 'ok' });
  else if (policy.mediumDogOk) badges.push({ label: '중형견 OK', tone: 'ok' });
  else if (policy.smallDogOnly) badges.push({ label: '소형견만', tone: 'cond' });

  if (policy.weightLimitKg !== undefined) {
    badges.push({ label: `~${policy.weightLimitKg}kg`, tone: 'cond' });
  }
  if (policy.maxDogs !== undefined) {
    badges.push({ label: `최대 ${policy.maxDogs}마리`, tone: 'cond' });
  }
  if (policy.leash) badges.push({ label: '리드줄', tone: 'cond' });

  // '정보 없음. (문의해보시면 가장 정확할 것 같아요)' 는 두 규칙에 다 걸린다.
  // 같은 말을 두 번 하지 않도록 '정보 없음' 이 있으면 '전화 확인' 은 생략한다.
  if (policy.noInfo) badges.push({ label: NO_INFO_BADGE_LABEL, tone: 'warn' });
  else if (policy.callFirst) badges.push({ label: '전화 확인', tone: 'warn' });

  return badges;
};
