// 숙소 **환경**(독채 · 마당 · 울타리 마당 · 계단 · 객실 안 · 침대·소파) — 노령견·다두·대형견 가족이 "갈 수 있나" 다음에 묻는 것(docs/todo/10 F6 · 14 W261013.11). 순수 모듈.
//
// 판정(`eligibility.ts`)에는 **넣지 않는다.** 갈 수 있는지와 무관한 선호다 — 넣으면 "갈 수 있어요" 옆에 "계단이 있어요" 가 같은 무게로 서서
// 판정 배지와 환경이 섞인다(08 T2.3 의 이유). 그래서 판정 배지가 아니라 숙소 필터와 상세의 한 줄에만 쓴다.
//
// 값은 칸마다 true · false · null(원문에 없음)이다. 정본은 AI 판단(ADR-017 과 같은 결정)이고, 정규식은 시드 86곳의 대조군이다 —
// 시드에는 AI 판단이 없어 `features` · 용품 원문을 정규식으로 읽는다. AI 의 true 는 **원문에 근거 단어가 있을 때만** 남긴다
// (`correctStayEnvironment` — `correctPetPolicyFacts` 와 같은 자리, 같은 이유: 근거 없는 true 하나가 필터에 엉뚱한 숙소를 띄운다).
//
// 브라우저(src/lib/places.ts)도 import 한다 — node 모듈을 넣지 말 것.

/**
 * 칸 이름. 순서가 화면·필터의 순서다. 뒤의 둘(`indoorRoom` 객실 안 · `furniture` 침대·소파)은 **객실 조건**이라 상세의 판정 카드에 선다
 * (14 W261013.11 — 대형견 보호자가 "마당만 된다" 를 현장에서 처음 듣는 일). 판정에 넣지 않는 것은 앞의 넷과 같다.
 */
export const STAY_ENVIRONMENT_KEYS = ['standalone', 'yard', 'fencedYard', 'stairs', 'indoorRoom', 'furniture'];

/**
 * 크기·몸무게로 갈리는 문장("소형견만 동반 입실", "대형견은 마당만")은 객실 칸의 근거로 치지 않는다 — 칸은 강아지를 모르므로
 * 그 문장을 true·false 하나로 적으면 다른 크기의 강아지에게 틀린 말이 된다. 크기 갈림은 판정(이용 조건)의 몫이다.
 */
const SIZE_QUALIFIED = /소형|중형|대형|\d+\s*(?:kg|키로|킬로)/i;
const sentencesOf = (s) => s.split(/[.!?\n]+/);
/** 크기 갈림이 없는 문장 하나라도 `re` 에 걸리면 true. 용품("강아지 침대")은 앞 낱말을 캡처해 거른다(위 STAIRS 와 같은 이유로 lookbehind 없이). */
const unqualified = (re) => ({
  test: (s) =>
    sentencesOf(s).some((sentence) => !SIZE_QUALIFIED.test(sentence) && [...sentence.matchAll(re)].some((m) => !m[1])),
});
const GOODS = '(?:(강아지|반려견|펫|애견)\\s?)?';

/** 객실 조건의 "안 된다" — 객실 출입 불가·마당만 · 침대·소파 금지. */
const ROOM_NO = {
  indoorRoom: unqualified(
    /(?:객실|실내|방)\s*(?:안|내부)?\s*(?:은|는|에는)?\s*(?:입실|출입|동반)?\s*(?:불가|금지|안\s*돼|안\s*됩)|(?:마당|테라스|야외|별채)(?:에서)?만\s*(?:이용|가능|머물)/g,
  ),
  furniture: unqualified(new RegExp(`${GOODS}(?:침대|소파|쇼파)[^.!?\\n]{0,12}(?:금지|불가|안\\s*돼|안\\s*됩|올리지|올라가지|삼가)`, 'g')),
};

/** "된다" 근거는 "안 된다" 근거가 없을 때만 — `불가능` 이 `가능` 을, `안 돼요` 가 `돼요` 를 품는다. AI 의 true 를 대 볼 때 금지 문장이 허용으로 통과하지 않게. */
const yesUnlessNo = (re, no) => {
  const yes = unqualified(re);
  return { test: (s) => yes.test(s) && !no.test(s) };
};

/**
 * 건물 계단. "강아지 계단"(용품)은 아니다 — 앞 낱말을 lookbehind 대신 **캡처해** 거른다: 이 모듈은 사이트 번들에 들어가고
 * iOS 16.4 전 Safari 는 lookbehind 리터럴 하나에 청크째 파싱이 멎는다(08 T0.11, feeLine.mjs 머리 주석). 하나라도 용품이 아닌 계단이면 있다.
 */
const STAIRS = /(?:(강아지|반려견|펫)\s?)?계단(?!\s*(?:이\s*)?없)/g;
const stairsMentioned = { test: (s) => /복층|다락/.test(s) || [...s.matchAll(STAIRS)].some((m) => !m[1]) };

/**
 * 칸마다 **있다** 를 말하는 근거 단어(`test` 하나만 부른다 — 계단은 위 함수).
 * 울타리 마당은 울타리·펜스가 마당·잔디와 **가까이** 붙어 있어야 한다("펜스 쳐진 잔디 마당", "마당에 울타리") — 따로 나오면 다른 것일 수 있다.
 */
const YES = {
  standalone: /독채|단독\s*(?:건물|주택|채)|한\s*팀만|프라이빗\s*하우스/,
  yard: /마당|잔디|정원/,
  fencedYard: /(?:울타리|펜스|휀스|담장)[^.!?\n]{0,12}(?:마당|잔디|정원)|(?:마당|잔디|정원)[^.!?\n]{0,12}(?:울타리|펜스|휀스|담장)/,
  stairs: stairsMentioned,
  // "객실 내부에서 오프리쉬" · "함께 입실" — 강아지가 객실 안에 있다는 말. 입실이 체크인 뜻으로만 쓰인 문장("15시 입실")은 동반 낱말이 없어 안 걸린다.
  indoorRoom: yesUnlessNo(/(?:객실|방)\s*(?:안|내부)|(?:동반|함께|같이)\s*입실|실내\s*(?:객실|취침)/g, ROOM_NO.indoorRoom),
  furniture: yesUnlessNo(new RegExp(`${GOODS}(?:침대|소파|쇼파)[^.!?\\n]{0,12}(?:가능|허용|괜찮|올라가도|돼요|됩니다)`, 'g'), ROOM_NO.furniture),
};

/**
 * **없다** 를 말하는 근거 — 계단(단층·계단 없음)과 객실 조건. 독채·마당의 "없음" 은 원문이 거의 말하지 않아 null 로 둔다.
 * 객실 조건의 "안 된다" 는 원문이 실제로 적는 말이라(seongho: "대형견은 마당/테라스만") 읽는다 — 크기 갈림 문장은 위와 같이 뺀다.
 */
const NO = {
  stairs: /단층|계단\s*(?:이\s*)?없|모두\s*1층|1층\s*(?:객실|독채|건물)/,
  ...ROOM_NO,
};

const empty = () => Object.fromEntries(STAY_ENVIRONMENT_KEYS.map((key) => [key, null]));

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
