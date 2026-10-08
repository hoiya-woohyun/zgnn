// AI 가 뽑은 이용 조건 판단(TPetPolicyFacts)을 **원문에 대 보고** 고친다 — 분석 시점(extractPlaces.normalizePetPolicy)과
// 앱 런타임(src/lib/petPolicy.ts 의 withPolicyFacts) 두 곳이 같은 함수를 쓴다. 앱에서도 부르는 이유: 이 보정이 생기기 전에
// 분석된 후보(2026-09-28 첫 실행 160건)가 DB 에 그대로 있어서, 저장된 값도 읽는 순간 같은 규칙을 통과해야 한다.
//
// 원칙은 파서와 같다 — **지어내지 않는다.** 원문에 근거 단어가 없는 판단은 "언급 없음"(null·unknown·false)으로 눕힌다.
// 모델이 "10kg 이하" 를 본 적 없이 `weightLimitKg: 10` 을 내면 그 숫자가 대형견을 '어려워요' 로 막는다. 틀린 제한은
// 틀린 허용만큼 해롭다 — 없는 제한 때문에 갈 수 있는 곳을 지운다.
//
// 순수 모듈이다: 브라우저도 import 한다 — node 모듈을 넣지 말 것(placeFields.mjs 와 같은 규칙, ADR-018).

import { amountsInWon, EXTRA_DOG_RE } from './feeLine.mjs';

/** @typedef {import('../../src/types').TPetPolicyFacts} TPetPolicyFacts */

const KOREAN_COUNT = { 한: 1, 두: 2, 세: 3, 네: 4, 다섯: 5, 여섯: 6 };

/** 판단마다 원문에 있어야 하는 근거 단어. 없으면 그 판단은 원문 밖에서 온 것이다. */
const GROUNDS = {
  indoorFree: /실내|안에서|내부|매장\s*안|케이지\s*없이|자유롭게/,
  indoorCage: /케이지|켄넬|이동\s*장|크레이트|가방|캐리어|유모차|슬링/,
  indoorOutdoor: /야외|테라스|마당|바깥|실외|외부|루프탑|정원|잔디/,
  leash: /리드|목줄|하네스|줄\s*(착용|필수)/,
  largeDogYes: /대형|무게\s*제한[^.\n]{0,6}없|견종\s*제한[^.\n]*없|모든\s*견종|크기\s*제한[^.\n]{0,6}없|사이즈\s*제한[^.\n]{0,6}없/,
  largeDogNo: /대형/,
  smallDogOnly: /소형/,
  // '방문 전 한 번 확인하고' — 파서의 callFirst(`(전화|방문 전)…(확인|문의)`)가 읽는 말을 여기서 못 읽으면 AI 판단만 빠진다.
  callFirst: /전화|문의|연락|예약|사전\s*확인|확인\s*후|방문\s*전[^.\n]*확인/,
  feeFree: /무료|없|0\s*원/,
  // 판단은 모델이 한다(ADR-017 v6) — 여기서는 "접종" 이라는 말이 원문에 있는지만 본다. 권장인지 필수인지는 모델 몫이다.
  vaccineRequired: /접종|백신|광견병|켄넬\s*코프|항체/,
};

/** 한 글자 요일 — `TWeekday`. 정렬은 하지 않는다(원문 순서가 정본). */
export const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'];

/**
 * 글에 `X요일` 로 적힌 요일들(원문 순서, 중복 제거). `수·토요일`·`수, 토요일` 처럼 묶은 표기의 앞 요일도 센다.
 * 앱의 정규식 파서(`parsePetPolicy`)와 아래 근거 보정이 **같은 읽기**를 써야 한쪽에서만 읽히는 요일이 없다.
 * @param {string} text
 * @returns {string[]}
 */
export function weekdaysIn(text) {
  const out = [];
  for (const m of String(text ?? '').matchAll(/[월화수목금토일](?:\s*[·ㆍ,/&]\s*[월화수목금토일])*\s*요일/g)) {
    for (const ch of m[0].replace(/\s*요일$/, '')) if (WEEKDAYS.includes(ch) && !out.includes(ch)) out.push(ch);
  }
  return out;
}

/** 모델이 낸 요일 배열을 칸 모양으로 — 알 수 없는 값은 버리고 중복을 턴다. 하나도 안 남으면 null(= 요일 제한 없음). */
export function weekdaysOrNull(value) {
  if (!Array.isArray(value)) return null;
  const days = [...new Set(value.filter((d) => WEEKDAYS.includes(d)))];
  return days.length ? days : null;
}

/**
 * 예방접종의 근거 단어 — 앱(`withPolicyFacts`)이 근거 **문장**을 고를 때도 같은 규칙을 쓴다. 따로 적어 두면 한쪽에만 있는 말
 * (`항체`·`켄넬코프`)이 "판단은 남는데 근거 문장은 첫 줄" 로 어긋난다.
 */
export const VACCINE_GROUNDS = GROUNDS.vaccineRequired;

/**
 * 보정 한 줄이 **원문의 무엇과 대 봤는가**(06 G) — `/admin` 이 원문 인용에서 그 자리를 칠한다.
 *
 * `near` 는 원문에서 칠할 말이다. 근거 단어 판단(`GROUNDS` 키)은 그 단어 자체라 뺀 경우엔 원문에 **없다** — 칠할 것이 0개이고,
 * 화면은 그때 `words` 로 "원문에 '대형' 같은 말이 없어요" 를 글로 적는다(칠한 게 없다를 괜찮다로 읽히게 두지 않는다).
 * 숫자(`kg`·`dogs`·`amount`)는 모델이 낸 숫자가 아니라 **원문에 실제로 있는 숫자**를 칠한다 — "원문은 이 숫자를 말한다".
 * 모순(소형견만 ↔ 대형견 가능 · 요금 ↔ 무료)은 근거가 원문에 있어 그 말이 칠해진다.
 *
 * 정규식은 이 표 하나가 정본이다 — 화면이 근거 단어를 따로 적으면 "뺀 이유" 와 "칠한 곳" 이 다른 규칙을 말한다.
 * @type {Record<string, { near: RegExp, words: string }>}
 */
export const CORRECTION_CUES = {
  indoorFree: { near: GROUNDS.indoorFree, words: '실내·자유롭게' },
  indoorCage: { near: GROUNDS.indoorCage, words: '케이지·이동가방·유모차' },
  indoorOutdoor: { near: GROUNDS.indoorOutdoor, words: '야외·테라스·마당' },
  leash: { near: GROUNDS.leash, words: '리드·목줄·하네스' },
  largeDogYes: { near: GROUNDS.largeDogYes, words: '대형·무게 제한 없음' },
  largeDogNo: { near: GROUNDS.largeDogNo, words: '대형' },
  smallDogOnly: { near: GROUNDS.smallDogOnly, words: '소형' },
  callFirst: { near: GROUNDS.callFirst, words: '전화·문의·예약' },
  feeFree: { near: GROUNDS.feeFree, words: '무료·없음·0원' },
  vaccineRequired: { near: GROUNDS.vaccineRequired, words: '접종·백신' },
  petDays: { near: /[월화수목금토일]\s*요일/, words: '요일(수요일)' },
  kg: { near: /(?<![\d.])\d+(?:\.\d+)?\s*(?:kg|㎏|킬로|키로)/i, words: '무게(kg)' },
  dogs: { near: /(?<!\d)(?:\d+|한|두|세|네|다섯|여섯)\s*마리/, words: '마릿수(N마리)' },
  amount: { near: /(?<![\d.,])\d[\d,]*(?:\.\d+)?\s*(?:만\s*원|천\s*원|원)/, words: '금액(원)' },
};

/** @typedef {keyof typeof CORRECTION_CUES} TCorrectionCue */
/** @typedef {{ note: string, cue: TCorrectionCue }} TCorrectionDrop */

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** 원문에 "N kg"(또는 킬로) 가 그대로 있는가. 10 이 "100kg" 이나 "1.5만원" 에 걸리지 않게 앞뒤 숫자를 막는다. */
const mentionsKg = (text, n) => new RegExp(`(^|[^\\d.])${escapeRe(String(n))}\\s*(kg|㎏|킬로|키로)`, 'i').test(text);

/** 마릿수 N 을 숫자·한글 수(`한`·`두`) 둘 다로 찾는 식의 원천. 한글 수가 없는 N 은 아무것도 안 걸리게(`(?!)`). */
const countSource = (n) => `(?:${n}|${Object.keys(KOREAN_COUNT).filter((word) => KOREAN_COUNT[word] === n).join('|') || '(?!)'})`;

/** 원문에 "N마리"(또는 "두 마리") 가 있는가. 숫자는 앞 숫자에 걸리지 않게(`12마리` 의 2) 막는다. */
const mentionsDogs = (text, n) => new RegExp(`(?:^|\\D)${countSource(n)}\\s*마리`).test(text);

/**
 * 원문이 "기본 N마리"(= 요금에 N마리가 들어 있다)를 말하는가. `추가 1마리 3만원` 의 `fromDog` 는 기본 마릿수 + 1 이라
 * 원문에 그 숫자 자체는 없을 수 있다 — 기본 1마리 숙소는 `2마리` 를 말하지 않아도 된다.
 */
const mentionsBaseDogs = (text, n) => new RegExp(`기본\\s*${countSource(n)}\\s*마리`).test(text);

/** 쉼표·공백을 턴 문자열. 두 쪽을 같은 모양으로 놓고 대 보려고. */
const flatten = (s) => s.replace(/,/g, '').replace(/\s+/g, '');

/**
 * 요금 문장이 원문에서 왔는가 — **금액 토큰째로** 대 본다(띄어쓰기·말투는 모델이 바꿀 수 있어도 금액은 원문 숫자다).
 *
 * 금액이 아니라 숫자 조각만 대 보던 때가 있었고, 줄이 짧아지자 그 검사가 통과 도장이 됐다: `청소비 5만원` 은
 * `5` 하나만 대 보므로 원문이 `1박 15만원부터` 여도 `includes('5')` 로 통과한다 — 지어낸 청소비가 그대로 배지가 된다.
 * 그래서 `5만원` 을 찾고 앞에 숫자가 붙지 않은 자리에서만 인정한다(`mentionsKg` 가 `100kg` 을 막는 것과 같은 어법).
 *
 * 금액 토큰이 아예 없는 줄(`2마리 이상` 처럼 숫자만 있는 조각)은 예전 규칙으로 물러선다 — 그쪽은 금액이 아니라
 * 조건이라 `원` 을 요구할 수 없다.
 *
 * 금액은 **원 단위 숫자로** 대 본다(`amountsInWon`) — 요금 줄은 저장 전에 `normalizeFeeLines` 가 `20,000원` 을 `2만원` 으로
 * 바꾸고, 앱이 읽을 때 이 대조를 다시 돌린다. 글자로 대 보면 방금 바꾼 줄을 지어낸 것으로 보고 뺀다. 숫자로 봐도
 * `15만원` 은 150000 이라 `5만원`(50000)과 여전히 다르다 — 위의 청소비 방어는 그대로다.
 */
const feeTextGrounded = (text, feeText) => {
  const bare = flatten(text);
  const line = flatten(feeText);
  const amounts = amountsInWon(feeText);
  if (amounts.length) {
    const inText = new Set(amountsInWon(text));
    return amounts.some((won) => inText.has(won));
  }
  const nums = line.match(/\d+(?:\.\d+)?/g);
  return nums !== null && nums.some((n) => bare.includes(n));
};

/**
 * 요금 줄 목록 — **구조(`fees` 의 `label`)·줄(`feeLines`)·옛 한 칸(`feeText`)을 한 배열로** 합친다. 읽는 쪽은 전부 이 함수를 거친다.
 *
 * 둘을 다 봐야 하는 이유: 2026-09-30 전에 분석된 후보·장소는 `feeText` 하나만 들고 있고, 그것들이 DB 에 그대로 있다
 * (`correctPetPolicyFacts` 를 앱에서도 다시 부르는 것과 같은 이유). 한쪽만 보면 그날을 기준으로 요금이 갈려 보인다.
 * 중복은 턴다 — 배지의 key 가 라벨이고, 같은 문장이 두 줄이면 React 가 키 충돌을 낸다.
 *
 * @param {{ fees?: { label: string }[] | null, feeLines?: string[] | null, feeText?: string | null } | null | undefined} facts
 * @returns {string[]}
 */
export function feeLinesOf(facts) {
  const labels = Array.isArray(facts?.fees) ? facts.fees.map((rule) => rule?.label ?? '') : [];
  const raw = [...labels, ...(Array.isArray(facts?.feeLines) ? facts.feeLines : []), facts?.feeText ?? ''];
  return [...new Set(raw.map((line) => String(line ?? '').trim()).filter(Boolean))];
}

/**
 * 요금 구조(`fees`)를 원문에 대 본다 — 줄(label)은 `feeTextGrounded` 와 같은 규칙으로, **계산에 쓰는 칸은 따로** 본다.
 *
 * 칸 하나라도 원문에 근거가 없으면 그 줄은 **계산에서만 빠진다**(`amountWon: null`, 경계 칸도 비운다). 줄 자체는 원문에서 왔으므로
 * 배지로는 남는다 — 틀린 것은 "우리 강아지 기준 N만원" 이라는 확정 문장이지 원문 줄이 아니다.
 * - 금액은 원문에도, **자기 label 에도** 있어야 한다. label 과 다른 금액이면 모델이 줄을 섞은 것이다.
 * - 몸무게 경계는 원문에 `N kg` 으로, 몇째 마리는 `N마리` 로 있어야 한다(`weightLimitKg`·`maxDogs` 와 같은 규칙).
 *
 * @param {import('../../src/types').TFeeRule[]} fees
 * @param {string} text
 * @param {(note: string, cue: TCorrectionCue) => void} drop
 */
/**
 * 계산 칸이 **자기 label 과 같은 말을 하는가**. 금액·경계는 숫자라 원문에 대 볼 수 있지만 `basis`·`perNight`·`fromDog` 는 말이라
 * label 의 단어로만 확인된다. 어긋난 채 두면 틀린 금액이 확정 문장이 된다 — `청소비 5만원` 이 `perDog` 면 2마리 "10만원",
 * `1박당 2만원` 이 `perNight: false` 면 "두부는 2만원"(1박이 빠진다).
 */
function shapeMatchesLabel(rule, label) {
  const once = /청소|1회|총/.test(label);
  if (once && rule.basis === 'perDog') return false;
  if (/마리\s*당/.test(label) && rule.basis === 'flat') return false;
  if (/박/.test(label) !== Boolean(rule.perNight)) return false;
  // fromDog > 1 이면 label 이 몇째 마리인지 말해야 한다 — `N마리부터|째` 만이 아니라 `추가 1마리`(기본 마릿수를 넘는 마리)도 그렇다.
  // 반대 방향은 넓히지 않는다: `추가 1마리` + fromDog null 은 "반려견 1마리 추가 시 2만원"(마리당 요금)이라 통과해야 하고,
  // `N마리부터` 가 label 에 있는데 fromDog 가 없으면 그 조건을 잃은 것이라 거절한다(docs/todo/13 §5.1).
  const nth = /\d\s*마리\s*(부터|째)/.test(label);
  if (rule.fromDog != null && rule.fromDog > 1) return nth || EXTRA_DOG_RE.test(label);
  if (nth) return false;
  return true;
}

function correctFeeRules(fees, text, drop) {
  const out = [];
  const inText = new Set(amountsInWon(text));
  for (const rule of fees) {
    const label = String(rule?.label ?? '').trim();
    if (!label) continue;
    if (!feeTextGrounded(text, label)) {
      drop(`요금 문장 "${label}" 이 원문에 없어 뺐어요`, 'amount');
      continue;
    }
    const next = { ...rule, label };
    const bounds = [next.minKg, next.maxKg].filter((n) => n != null);
    const ungrounded =
      (next.amountWon != null && (!inText.has(next.amountWon) || !amountsInWon(label).includes(next.amountWon))) ||
      !shapeMatchesLabel(next, label) ||
      bounds.some((n) => !mentionsKg(text, n)) ||
      (next.fromDog != null &&
        next.fromDog > 1 &&
        !mentionsDogs(text, next.fromDog) &&
        !mentionsBaseDogs(text, next.fromDog - 1));
    if (ungrounded && next.amountWon != null) {
      drop(`요금 "${label}" 의 금액·조건이 원문과 맞지 않아 계산에서 뺐어요`, 'amount');
      Object.assign(next, { amountWon: null, minKg: null, maxKg: null, fromDog: null });
    }
    out.push(next);
  }
  return out;
}

/** 요금 문장이 실제 금액을 말하는가("1마리당 2만원"). '추가 요금 없음' 과 한 판단에 같이 있으면 모순이다. */
const FEE_AMOUNT = /\d[\d,.]*\s*만?\s*원/;

/**
 * @param {TPetPolicyFacts | null | undefined} facts
 * @param {string | null | undefined} petPolicyText
 * @returns {{ facts: TPetPolicyFacts | null, corrections: string[], dropped: TCorrectionDrop[] }}
 *   corrections 는 고친 것마다 한국어 한 줄 — `/admin` 이 "AI 가 뭐라 했고 왜 뺐나" 를 보여 준다.
 *   dropped 는 같은 줄에 **원문의 무엇과 대 봤는지**(`CORRECTION_CUES` 키)를 붙인 것 — 순서·문장이 corrections 와 같다.
 */
export function correctPetPolicyFacts(facts, petPolicyText) {
  const text = (petPolicyText ?? '').trim();
  if (!facts || !text) return { facts: facts ?? null, corrections: [], dropped: [] };

  const next = { ...facts };
  /** @type {TCorrectionDrop[]} */
  const dropped = [];
  /** @param {string} note @param {TCorrectionCue} cue */
  const drop = (note, cue) => dropped.push({ note, cue });

  // 1) 숫자 — 원문에 그 숫자가 없으면 모델이 추측한 것이다.
  if (next.weightLimitKg != null && (next.weightLimitKg > 60 || !mentionsKg(text, next.weightLimitKg))) {
    drop(`무게 상한 ${next.weightLimitKg}kg 이 원문에 없어 뺐어요`, 'kg');
    next.weightLimitKg = null;
  }
  if (next.maxDogs != null && (next.maxDogs > 10 || !mentionsDogs(text, next.maxDogs))) {
    drop(`최대 ${next.maxDogs}마리가 원문에 없어 뺐어요`, 'dogs');
    next.maxDogs = null;
  }

  // 2) 근거 단어 — 참/거짓 판단도 원문에 그 말이 있어야 한다.
  /** @type {TCorrectionCue | undefined} */
  const indoorCue = /** @type {const} */ ({ free: 'indoorFree', cage: 'indoorCage', outdoorOnly: 'indoorOutdoor' })[next.indoor];
  if (indoorCue && !GROUNDS[indoorCue].test(text)) {
    drop(`실내 판단(${next.indoor})의 근거가 원문에 없어 뺐어요`, indoorCue);
    next.indoor = 'unknown';
  }
  if (next.largeDogOk === true && !GROUNDS.largeDogYes.test(text)) {
    drop('대형견 가능의 근거가 원문에 없어 뺐어요', 'largeDogYes');
    next.largeDogOk = null;
  }
  if (next.largeDogOk === false && !GROUNDS.largeDogNo.test(text)) {
    // "10kg 이하" 에서 '대형견 불가' 를 추론한 경우 — 그 제한은 무게 상한이 이미 말한다(판정 H1).
    drop('대형견 불가의 근거가 원문에 없어 뺐어요', 'largeDogNo');
    next.largeDogOk = null;
  }
  if (next.smallDogOnly && !GROUNDS.smallDogOnly.test(text)) {
    drop('소형견만의 근거가 원문에 없어 뺐어요', 'smallDogOnly');
    next.smallDogOnly = false;
  }
  if (next.leash && !GROUNDS.leash.test(text)) {
    drop('리드줄 조건의 근거가 원문에 없어 뺐어요', 'leash');
    next.leash = false;
  }
  if (next.callFirst && !GROUNDS.callFirst.test(text)) {
    drop('전화 확인의 근거가 원문에 없어 뺐어요', 'callFirst');
    next.callFirst = false;
  }
  if (next.vaccineRequired && !GROUNDS.vaccineRequired.test(text)) {
    drop('예방접종 필수의 근거가 원문에 없어 뺐어요', 'vaccineRequired');
    next.vaccineRequired = false;
  }
  // 요일은 하나씩 대 본다 — 원문에 `X요일` 로 없는 요일은 모델이 지어낸 것이다(weightLimitKg 의 mentionsKg 와 같다).
  // 다 빠지면 null: 남은 게 없는데 빈 배열을 두면 "요일 제한 있음" 처럼 읽힌다.
  if (Array.isArray(next.petDays) && next.petDays.length) {
    const inText = weekdaysIn(text);
    const kept = next.petDays.filter((d) => inText.includes(d));
    for (const d of next.petDays) if (!kept.includes(d)) drop(`동반 요일 ${d}요일이 원문에 없어 뺐어요`, 'petDays');
    next.petDays = kept.length ? kept : null;
  }
  /*
   * 요금은 **줄마다 따로** 대 본다. 한 덩어리로 보면 근거 있는 줄 하나가 지어낸 줄들을 통째로 통과시키고,
   * 반대로 지어낸 줄 하나가 옳은 구간표를 통째로 지운다. 새 모양(`feeLines`)으로 되돌려 쓰고 옛 칸(`feeText`)은
   * 비운다 — 남겨 두면 `feeLinesOf` 가 뺀 줄을 다시 주워 와 이 보정이 무력해진다(두 번 불러도 결과가 같아야 한다).
   */
  if (Array.isArray(next.fees)) next.fees = correctFeeRules(next.fees, text, drop);
  const feeLines = feeLinesOf({ feeLines: next.feeLines, feeText: next.feeText });
  if (feeLines.length) {
    const grounded = feeLines.filter((line) => feeTextGrounded(text, line));
    for (const line of feeLines) if (!grounded.includes(line)) drop(`요금 문장 "${line}" 이 원문에 없어 뺐어요`, 'amount');
    next.feeLines = grounded;
    next.feeText = null;
  }
  if (next.feeFree === true && !GROUNDS.feeFree.test(text)) {
    drop('추가 요금 없음의 근거가 원문에 없어 뺐어요', 'feeFree');
    next.feeFree = null;
  }

  // 3) 한 판단 안의 모순 — 어느 쪽이 맞는지 모르므로 **허용 쪽**을 뺀다(제한은 원문이 확인해 준다).
  if (next.smallDogOnly && next.largeDogOk === true) {
    drop('소형견만인데 대형견 가능이라 해서 대형견 가능을 뺐어요', 'smallDogOnly');
    next.largeDogOk = null;
  }
  // 줄이 여러 개면 **하나라도** 금액을 말하면 모순이다 — 첫 줄만 보면 "첫째 줄은 무료, 둘째 줄부터 2만원" 을 놓친다.
  if (next.feeFree === true && feeLinesOf(next).some((line) => FEE_AMOUNT.test(line))) {
    drop('요금 문장이 있는데 추가 요금 없음이라 해서 추가 요금 없음을 뺐어요', 'amount');
    next.feeFree = null;
  }

  return { facts: next, corrections: dropped.map((d) => d.note), dropped };
}
