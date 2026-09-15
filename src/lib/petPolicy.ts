/**
 * 반려동물 이용 조건 파서.
 *
 * ✅ 판단 규칙은 여기서 조정한다. 아래 상수 테이블(INDOOR_RULES / FLAG_RULES / NUMBER_RULES)이
 *    규칙의 전부이고, 나머지 코드는 테이블을 순서대로 적용하기만 한다.
 *    새 표현이 나오면 정규식 한 줄을 알맞은 테이블에 추가하면 된다.
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

/** 숫자를 뽑는 규칙. */
const NUMBER_RULES = {
  /**
   * 무게 상한. 한 문장에 조건이 여러 개 나오면(웨스티하우스의 '10kg 미만 2마리, 20kg 미만 1마리')
   * 가장 큰 값이 실제 상한이다. '10kg 이상 4만원' 의 '이상' 은 상한이 아니라서 일부러 빠져 있다.
   */
  weightLimitKg: /(\d+)\s*kg\s*(?:미만|이하|까지)/gi,
  // '1마리당' 은 요금 단위지 마릿수 제한이 아니라서 일부러 빠져 있다.
  maxDogs: [/최대\s*(\d+)\s*마리/, /(\d+)\s*마리까지/, /(\d+)\s*마리만/],
};

/**
 * 숙소 요금 문장. '1마리당 3만원' 같은 한 문장을 통째로 뽑는다.
 * 숫자가 앞에 붙은 '원' 만 요금으로 본다 — 그러지 않으면 '공원'·'병원'·'정원' 이 요금이 된다.
 */
const FEE_TEXT_RULE = /[^.\n]*\d[\d,.]*\s*만?\s*원[^.\n]*/;

const matchesAny = (text: string, patterns: RegExp[]) => patterns.some((re) => re.test(text));

const firstNumber = (text: string, patterns: RegExp[]): number | undefined => {
  for (const re of patterns) {
    const m = re.exec(text);
    if (m) return Number(m[1]);
  }
  return undefined;
};

/**
 * 무게 상한. 원문이 '~kg 미만/이하/까지' 로 상한을 못박은 경우에만 값을 만든다.
 * 조건이 여러 개면(웨스티하우스) 그 중 최댓값이 실제로 받아 주는 상한이다.
 *
 * '1~5kg 1만원 / 6~10kg 1.5만원' 같은 구간 요금표는 일부러 세지 않는다.
 * 요금표는 그 구간의 가격을 적은 것이지 "10kg 까지만 받는다" 고 말한 적이 없어서,
 * 마지막 구간의 끝을 상한으로 바꿔 읽으면 원문에 없는 조건을 앱이 지어내게 된다.
 * 이런 곳은 요금 문장이 feeText 배지로 나가므로 사용자가 원문에서 판단할 수 있다.
 */
const weightLimitKg = (text: string): number | undefined => {
  const limits = [...text.matchAll(NUMBER_RULES.weightLimitKg)].map((m) => Number(m[1]));
  return limits.length > 0 ? Math.max(...limits) : undefined;
};

export const parsePetPolicy = (petPolicyText: string): TPetPolicy => {
  const text = petPolicyText ?? '';

  const indoor = INDOOR_RULES.find((rule) => matchesAny(text, rule.patterns))?.indoor ?? 'unknown';

  const flags = {
    leash: false,
    largeDogOk: false,
    mediumDogOk: false,
    smallDogOnly: false,
    callFirst: false,
    feeFree: false,
    noInfo: false,
  };
  for (const rule of FLAG_RULES) {
    flags[rule.key] = matchesAny(text, rule.patterns);
  }

  // 대형견이 되면 중형견도 당연히 된다.
  if (flags.largeDogOk) flags.mediumDogOk = true;

  const feeMatch = FEE_TEXT_RULE.exec(text);

  return {
    indoor,
    ...flags,
    weightLimitKg: weightLimitKg(text),
    maxDogs: firstNumber(text, NUMBER_RULES.maxDogs),
    feeText: feeMatch ? feeMatch[0].trim() : undefined,
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
  if (policy.noInfo) badges.push({ label: '정보 없음', tone: 'warn' });
  else if (policy.callFirst) badges.push({ label: '전화 확인', tone: 'warn' });

  return badges;
};
