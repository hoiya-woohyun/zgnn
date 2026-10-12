// 사이트에 나가는 **AI 문장**(notes · 이용 안내)의 가드와 판단 지문 — ADR-017 결정 13(D1, v10), docs/todo/21 S2.
//
// 공개 상세는 블로그 원문을 보이지 않는다. 판단 칸에서 만든 템플릿 줄(`src/lib/petPolicyPublic.ts`) 밑에 AI 가 자기 말로 쓴
// 안내 1~2문장(없으면 notes 한 줄)을 붙이는데, 그 문장은 **분석 시점**(추출·제안 패스가 안내를 실을 때)과 **앱**(그릴 때) 두 곳에서
// 같은 가드를 지나야 한다 — 스크립트는 TS 를 못 읽어서 `.mjs` 다(레포 관례는 TS 가 `.mjs` 를 import 하는 쪽).
//
// 순수 모듈이다: 브라우저도 import 한다 — node 모듈(`node:crypto` 포함)을 넣지 말 것. lookbehind 정규식 리터럴도 쓰지 않는다
// (iOS 16.4 전 Safari 에서 청크째 죽는다, feeLine.mjs 머리 주석) — 앞 글자를 캡처하는 어법을 쓴다.

import { amountsInWon } from './feeLine.mjs';
import { CORRECTION_CUES } from './petPolicyFacts.mjs';

/** @typedef {{ label: string, find: (text: string) => string | null }} TPolicyTopicRule */

/** 정규식의 `w` 이름 그룹(없으면 전체)을 찾은 말로 돌려준다 — 이유 문장에 "무엇이 걸렸나" 를 적으려고. */
const byWord = (re) => (text) => {
  const m = text.match(re);
  return m ? (m.groups?.w ?? m[0]).trim() : null;
};

/**
 * 판단 칸 ↔ 주제 표 **하나**. 키는 AI 판단(`TPetPolicyFacts`)의 칸이다 — `notes`(판정에 안 쓰인다)와 옛 모양(`feeLines`·`feeText`)만 빼고 전부.
 * 두 곳이 같이 읽는다: 템플릿(`publicPolicyLines`, 칸마다 한 줄)과 안내 가드(이 주제를 말하는 안내는 뺀다).
 * 칸을 더하면 여기 한 줄 + 템플릿 한 줄 — 빠지면 테스트가 깨진다(추출 스키마의 `required` 와 대 본다, `readNothing` 과 같은 짝).
 *
 * 안내가 판단 주제를 말하면 안 되는 이유: 배지·판정은 판단 칸이 말하고, 안내는 판단과 따로 쓰인 문장이다. 같은 주제를 둘이 말하면
 * 운영자가 판단을 고친 순간 둘이 갈린다(담소요 — 제안 판단은 `vaccineRequired: false` 인데 안내가 "예방접종 날짜를 물어봐요").
 *
 * 요금·마릿수·무게는 낱말이 아니라 **숫자 패턴**으로 잡는다. 한 글자 부분 일치(`원`·`견`)는 `정원`·`공원` 을 요금으로,
 * `반려견` 을 마릿수로 잡아 거의 모든 안내를 떨어뜨린다.
 * `야외`·`실외` 가 주제라 실외만 받는 곳의 자리 안내("야외 테라스석")도 빠진다 — 템플릿이 이미 "야외 자리에서만" 이라 말하므로 의도다.
 *
 * @type {Record<'indoor' | 'leash' | 'largeDogOk' | 'smallDogOnly' | 'callFirst' | 'vaccineRequired' | 'petDays' | 'feeFree' | 'fees' | 'weightLimitKg' | 'maxDogs', TPolicyTopicRule>}
 */
export const POLICY_TOPICS = {
  indoor: { label: '실내·야외', find: byWord(/실내|야외|실외|케이지|이동\s*가방|켄넬|유모차|개모차/) },
  leash: { label: '목줄', find: byWord(/목줄|리드\s*줄|하네스/) },
  largeDogOk: { label: '대형견', find: byWord(/대형견|중형견/) },
  smallDogOnly: { label: '소형견', find: byWord(/소형견/) },
  callFirst: { label: '전화 확인', find: byWord(/전화|문의|연락/) },
  vaccineRequired: { label: '접종', find: byWord(/접종|백신/) },
  petDays: { label: '요일', find: byWord(/요일/) },
  feeFree: { label: '요금', find: byWord(/요금|입장료/) },
  // 금액 토큰이 하나라도 있으면 요금 이야기다 — 판독은 원문 대조와 같은 `amountsInWon` 하나로.
  fees: { label: '요금', find: (text) => (amountsInWon(text).length ? '금액' : null) },
  weightLimitKg: { label: '무게', find: byWord(/(?:^|[^\d.])(?<w>\d+(?:\.\d+)?\s*(?:kg|㎏|킬로|키로))/i) },
  // `N견` 은 숫자 바로 뒤일 때만(`4인 4견`) — `반려견` 은 마릿수가 아니다.
  maxDogs: { label: '마릿수', find: byWord(/(?:^|\D)(?<w>(?:\d+|한|두|세|네|다섯)\s*마리|\d+\s*견)/) },
};

/**
 * 근거 단어 검사에 쓰는 단서 — 원문 대조(`correctPetPolicyFacts`)의 `GROUNDS` 를 그대로 빌린다(`CORRECTION_CUES` 가 같은 정규식이다).
 * 문장이 이 조건을 말하는데 원문에 그 말이 없으면 AI 가 지어낸 조건이다(PLANT827 "족욕장은 함께 이용할 수 없어요" ← 글쓴이가 안 들어간 것).
 *
 * 빼는 것: 숫자 셋(`kg`·`dogs`·`amount` — 아래 "원문에 없는 숫자" 가 맡는다) · `feeFree`(맨 `없` — "주차 걱정은 없어요" 를 잡는다) ·
 * `indoorFree`(`자유롭게`·`안에서` — "운동장에서 자유롭게 뛰어놀아요" 를 잡는다). 판정 칸의 근거로는 맞는 단어지만 산문에선 흔한 말이다.
 */
const GROUND_CUES = /** @type {const} */ (['indoorCage', 'indoorOutdoor', 'leash', 'largeDogYes', 'smallDogOnly', 'callFirst', 'vaccineRequired', 'petDays']);

/** 베낌의 문턱 — 공백을 뺀 원문과 이만큼 같은 이음이 있으면 옮긴 문장이다. */
export const COPY_RUN = 15;

const squash = (s) => s.replace(/\s+/g, '');

/** 공백을 뺀 두 문자열이 `COPY_RUN` 자 이상 같은 이음을 갖는가 — 처음 찾은 이음, 없으면 null. 문장이 짧아 O(n·m) 로 충분하다. */
function copiedRun(text, raw) {
  const a = squash(text);
  const b = squash(raw);
  for (let i = 0; i + COPY_RUN <= a.length; i++) {
    const run = a.slice(i, i + COPY_RUN);
    if (b.includes(run)) return run;
  }
  return null;
}

/** 금액 토큰 — feeLine.mjs 의 `AMOUNT_RE` 와 같은 모양(만·천 섞은 한 금액 포함). 앞 글자 캡처 없이 왼쪽부터 훑으면 숫자 덩어리 첫 자리에서 잡힌다. */
const AMOUNT_TOKEN = /\d[\d,]*(?:\.\d+)?(?:\s*만\s*\d[\d,]*(?=\s*(?:천\s*)?원))?\s*(?:만\s*원|천\s*원|원)/g;
const numbersIn = (s) => (s.match(/\d+(?:[.,]\d+)*/g) ?? []).map((n) => n.replace(/,/g, ''));

/**
 * 원문에 없는 숫자들. 금액은 **원 단위로** 대 본다 — AI 는 `20,000원` 을 `2만원` 으로 쓸 수 있다(원문 대조의 `feeTextGrounded` 와 같은 이유).
 * 금액이 아닌 숫자(`1~5kg`·`오후 3시`)는 원문 숫자와 글자로 대 본다.
 */
function unknownNumbers(text, raw) {
  const rawWon = new Set(amountsInWon(raw));
  const rawNums = new Set(numbersIn(raw));
  const missing = [];
  const rest = text.replace(AMOUNT_TOKEN, (token) => {
    if (!amountsInWon(token).every((won) => rawWon.has(won))) missing.push(token.trim());
    return ' ';
  });
  for (const n of numbersIn(rest)) if (!rawNums.has(n)) missing.push(n);
  return [...new Set(missing)];
}

/**
 * 사이트에 나갈 AI 문장(notes·안내)이 원문 밖으로 나가지 않았는가. 이유는 한국어 한 줄씩 — `/admin` 미리보기(S6)가 그대로 보인다.
 *
 * - **베낌**: 공백을 뺀 원문과 `COPY_RUN`(15)자 이상 같은 이음. 블로그 문장을 그대로 내보내지 않는 것이 이 가드의 이유다(레포 PUBLIC).
 * - **원문에 없는 숫자**: 숫자 하나가 판정을 바꾼다(`weightLimitKg: 10` 이 대형견을 막았다, BUG-009).
 * - **원문에 없는 조건**: 근거 단어(`GROUND_CUES`)를 말하는데 원문에 그 말이 없다.
 * - **판단 주제**(`topics`, 안내만): `POLICY_TOPICS` 를 말하면 배지와 갈릴 수 있다. notes 는 판단이 못 담은 조건을 적는 칸이라 이 검사를 안 한다.
 *
 * @param {string | null | undefined} text
 * @param {string | null | undefined} rawText 조건 원문(`petPolicyText`) — 대조군
 * @param {{ topics?: boolean }} [options] topics 기본 true(엄한 쪽) — notes 만 false 로 부른다
 * @returns {{ ok: boolean, reasons: string[] }}
 */
export function guardPublicText(text, rawText, { topics = true } = {}) {
  const body = String(text ?? '').trim();
  const raw = String(rawText ?? '');
  if (!body) return { ok: false, reasons: ['문장이 비어 있어요'] };

  const reasons = [];
  const run = copiedRun(body, raw);
  if (run) reasons.push(`원문을 그대로 옮겼어요("${run}")`);
  const numbers = unknownNumbers(body, raw);
  if (numbers.length) reasons.push(`원문에 없는 숫자예요(${numbers.join(', ')})`);
  for (const key of GROUND_CUES) {
    const { near, words } = CORRECTION_CUES[key];
    if (near.test(body) && !near.test(raw)) reasons.push(`원문에 없는 조건이에요(${words})`);
  }
  if (topics) {
    for (const { find } of Object.values(POLICY_TOPICS)) {
      const word = find(body);
      if (word) reasons.push(`판단 칸이 말하는 주제예요(${word})`);
    }
  }
  return { ok: reasons.length === 0, reasons: [...new Set(reasons)] };
}

/**
 * 지문용 정규형 — 키 정렬(안쪽 객체까지 · jsonb 는 `fees[]` 안 키도 재배열한다), `null`·`undefined`·빈 배열 제거.
 * 그래서 칸이 늘어도(옛 판단엔 키가 없고 새 판단엔 `null`) 지문이 같고, 후보의 `petDays: null`·`feeText: null`·`feeLines: []` 와
 * 게시된 행의 "키 없음" 이 같다. `false` 는 지우지 않는다 — `largeDogOk` 의 false(불가)와 null(언급 없음)은 다른 판단이다.
 */
function canonical(value) {
  if (value === null || value === undefined) return undefined;
  if (Array.isArray(value)) {
    const items = value.map(canonical).filter((item) => item !== undefined);
    return items.length ? items : undefined;
  }
  if (typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      const item = canonical(value[key]);
      if (item !== undefined) out[key] = item;
    }
    return out;
  }
  return value;
}

/** cyrb53 — 동기·순수 53비트 해시(브라우저에서 `crypto.subtle` 은 비동기라 못 쓴다). 보안용이 아니라 "같은 판단인가" 를 가르는 지문이다. */
function cyrb53(str) {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/**
 * 판단 지문 — 안내(`{ text, basis }`)를 쓴 시점의 판단을 가리킨다. 지금 판단의 지문과 다르면 안내는 숨는다(`publicGuide`).
 * AI 가 쓴 문장을 저장하면 `/admin` 에서 판단을 고쳤을 때 문장이 조용히 낡는다 — 이 지문이 그것을 막는 장치다(ADR-017 결정 13).
 *
 * **저장된 판단 그대로**(`places.pet_policy` · 후보의 `extracted.petPolicy`)를 넣는다. 런타임에 원문 대조를 다시 돌린 값을 넣으면
 * 대조 규칙이 바뀌는 순간(G1.x) 모든 안내가 조용히 숨는다. 정규형에서 갈리는 차이는 전부 숨김 쪽으로 넘어진다(안전한 쪽).
 *
 * @param {import('../../src/types').TPetPolicyFacts | null | undefined} policy
 * @returns {string} 14자리 16진수
 */
export function policyFingerprint(policy) {
  return cyrb53(JSON.stringify(canonical(policy) ?? null)).toString(16).padStart(14, '0');
}
