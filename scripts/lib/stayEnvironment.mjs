// 숙소 **환경**(독채 · 마당 · 울타리 마당 · 계단) — 노령견·다두 가족이 "갈 수 있나" 다음에 묻는 것(docs/todo/10 F6). 순수 모듈.
//
// 판정(`eligibility.ts`)에는 **넣지 않는다.** 갈 수 있는지와 무관한 선호다 — 넣으면 "갈 수 있어요" 옆에 "계단이 있어요" 가 같은 무게로 서서
// 판정 배지와 환경이 섞인다(08 T2.3 의 이유). 그래서 판정 배지가 아니라 숙소 필터와 상세의 한 줄에만 쓴다.
//
// 값은 칸마다 true · false · null(원문에 없음)이다. 정본은 AI 판단(ADR-017 과 같은 결정)이고, 정규식은 시드 86곳의 대조군이다 —
// 시드에는 AI 판단이 없어 `features` · 용품 원문을 정규식으로 읽는다. AI 의 true 는 **원문에 근거 단어가 있을 때만** 남긴다
// (`correctStayEnvironment` — `correctPetPolicyFacts` 와 같은 자리, 같은 이유: 근거 없는 true 하나가 필터에 엉뚱한 숙소를 띄운다).
//
// 브라우저(src/lib/places.ts)도 import 한다 — node 모듈을 넣지 말 것.

/** 칸 이름. 순서가 화면·필터의 순서다. */
export const STAY_ENVIRONMENT_KEYS = ['standalone', 'yard', 'fencedYard', 'stairs'];

/**
 * 칸마다 **있다** 를 말하는 근거 단어. "강아지 계단"(용품)은 건물 계단이 아니다 — 뒤에서 뺀다.
 * 울타리 마당은 울타리·펜스가 마당·잔디와 **가까이** 붙어 있어야 한다("펜스 쳐진 잔디 마당", "마당에 울타리") — 따로 나오면 다른 것일 수 있다.
 */
const YES = {
  standalone: /독채|단독\s*(?:건물|주택|채)|한\s*팀만|프라이빗\s*하우스/,
  yard: /마당|잔디|정원/,
  fencedYard: /(?:울타리|펜스|휀스|담장)[^.!?\n]{0,12}(?:마당|잔디|정원)|(?:마당|잔디|정원)[^.!?\n]{0,12}(?:울타리|펜스|휀스|담장)/,
  stairs: /복층|다락|(?<!강아지\s?|반려견\s?|펫\s?)계단(?!\s*(?:이\s*)?없)/,
};

/** **없다** 를 말하는 근거 — 계단만 있다(단층·계단 없음). 다른 칸의 "없음" 은 원문이 거의 말하지 않아 null 로 둔다. */
const NO = {
  stairs: /단층|계단\s*(?:이\s*)?없|모두\s*1층|1층\s*(?:객실|독채|건물)/,
};

const empty = () => ({ standalone: null, yard: null, fencedYard: null, stairs: null });

/** 원문(소개 · 용품 · 조건 원문을 이어 붙인 것) → 정규식이 읽은 환경. 울타리 마당이면 마당도 있다. */
export function parseStayEnvironment(text) {
  const s = text ?? '';
  const env = empty();
  for (const key of STAY_ENVIRONMENT_KEYS) {
    if (NO[key]?.test(s)) env[key] = false;
    else if (YES[key].test(s)) env[key] = true;
  }
  if (env.fencedYard) env.yard = true;
  return env;
}

/**
 * AI 판단을 원문에 대 본다. true 는 근거 단어가 원문에 있을 때만, false 는 계단만(단층 근거가 있을 때) 남기고 나머지 false 는 null 로 —
 * "독채가 아니다" · "마당이 없다" 를 원문이 말하는 일은 드물고, 모델이 "언급 없음" 을 false 로 적는 일은 흔하다.
 * 입력이 객체가 아니면 null(판단 없음).
 */
export function correctStayEnvironment(raw, sourceText) {
  if (!raw || typeof raw !== 'object') return null;
  const s = sourceText ?? '';
  const env = empty();
  for (const key of STAY_ENVIRONMENT_KEYS) {
    const value = raw[key];
    if (value === true && YES[key].test(s)) env[key] = true;
    else if (value === false && NO[key]?.test(s)) env[key] = false;
  }
  if (env.fencedYard) env.yard = true;
  return STAY_ENVIRONMENT_KEYS.some((key) => env[key] !== null) ? env : null;
}

/** 정규식 + AI → 화면이 쓰는 값. 칸마다 AI 가 말했으면(null 아님) 그것, 아니면 정규식. */
export function mergeStayEnvironment(regex, ai) {
  const env = empty();
  for (const key of STAY_ENVIRONMENT_KEYS) env[key] = ai?.[key] ?? regex?.[key] ?? null;
  if (env.fencedYard) env.yard = true;
  return env;
}

/** 아무것도 모르면 true — 상세가 줄을 그리지 않는다. */
export const isEnvironmentEmpty = (env) => !env || STAY_ENVIRONMENT_KEYS.every((key) => env[key] === null);
