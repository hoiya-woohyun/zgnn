// AI 가 뽑은 이용 조건 판단(TPetPolicyFacts)을 **원문에 대 보고** 고친다 — 분석 시점(extractPlaces.normalizePetPolicy)과
// 앱 런타임(src/lib/petPolicy.ts 의 withPolicyFacts) 두 곳이 같은 함수를 쓴다. 앱에서도 부르는 이유: 이 보정이 생기기 전에
// 분석된 후보(2026-09-28 첫 실행 160건)가 DB 에 그대로 있어서, 저장된 값도 읽는 순간 같은 규칙을 통과해야 한다.
//
// 원칙은 파서와 같다 — **지어내지 않는다.** 원문에 근거 단어가 없는 판단은 "언급 없음"(null·unknown·false)으로 눕힌다.
// 모델이 "10kg 이하" 를 본 적 없이 `weightLimitKg: 10` 을 내면 그 숫자가 대형견을 '어려워요' 로 막는다. 틀린 제한은
// 틀린 허용만큼 해롭다 — 없는 제한 때문에 갈 수 있는 곳을 지운다.
//
// 순수 모듈이다: 브라우저도 import 한다 — node 모듈을 넣지 말 것(placeFields.mjs 와 같은 규칙, ADR-018).

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
  callFirst: /전화|문의|연락|예약|사전\s*확인|확인\s*후/,
  feeFree: /무료|없|0\s*원/,
};

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** 원문에 "N kg"(또는 킬로) 가 그대로 있는가. 10 이 "100kg" 이나 "1.5만원" 에 걸리지 않게 앞뒤 숫자를 막는다. */
const mentionsKg = (text, n) => new RegExp(`(^|[^\\d.])${escapeRe(String(n))}\\s*(kg|㎏|킬로|키로)`, 'i').test(text);

/** 원문에 "N마리"(또는 "두 마리") 가 있는가. */
const mentionsDogs = (text, n) => {
  if (new RegExp(`(^|\\D)${n}\\s*마리`).test(text)) return true;
  return Object.entries(KOREAN_COUNT).some(([word, v]) => v === n && new RegExp(`${word}\\s*마리`).test(text));
};

/** 요금 문장이 원문에서 왔는가 — 그 안의 숫자가 원문에 하나라도 있으면 원문으로 본다(띄어쓰기·말투는 모델이 바꿀 수 있다). */
const feeTextGrounded = (text, feeText) => {
  const nums = feeText.match(/\d[\d,.]*/g);
  if (!nums) return false;
  const bare = text.replace(/,/g, '');
  return nums.some((n) => bare.includes(n.replace(/,/g, '')));
};

/** 요금 문장이 실제 금액을 말하는가("1마리당 2만원"). '추가 요금 없음' 과 한 판단에 같이 있으면 모순이다. */
const FEE_AMOUNT = /\d[\d,.]*\s*만?\s*원/;

/**
 * @param {TPetPolicyFacts | null | undefined} facts
 * @param {string | null | undefined} petPolicyText
 * @returns {{ facts: TPetPolicyFacts | null, corrections: string[] }}
 *   corrections 는 고친 것마다 한국어 한 줄 — `/admin` 과 `data:review` 가 "AI 가 뭐라 했고 왜 뺐나" 를 보여 준다.
 */
export function correctPetPolicyFacts(facts, petPolicyText) {
  const text = (petPolicyText ?? '').trim();
  if (!facts || !text) return { facts: facts ?? null, corrections: [] };

  const next = { ...facts };
  const corrections = [];
  const drop = (note) => corrections.push(note);

  // 1) 숫자 — 원문에 그 숫자가 없으면 모델이 추측한 것이다.
  if (next.weightLimitKg != null && (next.weightLimitKg > 60 || !mentionsKg(text, next.weightLimitKg))) {
    drop(`무게 상한 ${next.weightLimitKg}kg 이 원문에 없어 뺐어요`);
    next.weightLimitKg = null;
  }
  if (next.maxDogs != null && (next.maxDogs > 10 || !mentionsDogs(text, next.maxDogs))) {
    drop(`최대 ${next.maxDogs}마리가 원문에 없어 뺐어요`);
    next.maxDogs = null;
  }

  // 2) 근거 단어 — 참/거짓 판단도 원문에 그 말이 있어야 한다.
  const indoorGround = { free: GROUNDS.indoorFree, cage: GROUNDS.indoorCage, outdoorOnly: GROUNDS.indoorOutdoor }[next.indoor];
  if (indoorGround && !indoorGround.test(text)) {
    drop(`실내 판단(${next.indoor})의 근거가 원문에 없어 뺐어요`);
    next.indoor = 'unknown';
  }
  if (next.largeDogOk === true && !GROUNDS.largeDogYes.test(text)) {
    drop('대형견 가능의 근거가 원문에 없어 뺐어요');
    next.largeDogOk = null;
  }
  if (next.largeDogOk === false && !GROUNDS.largeDogNo.test(text)) {
    // "10kg 이하" 에서 '대형견 불가' 를 추론한 경우 — 그 제한은 무게 상한이 이미 말한다(판정 H1).
    drop('대형견 불가의 근거가 원문에 없어 뺐어요');
    next.largeDogOk = null;
  }
  if (next.smallDogOnly && !GROUNDS.smallDogOnly.test(text)) {
    drop('소형견만의 근거가 원문에 없어 뺐어요');
    next.smallDogOnly = false;
  }
  if (next.leash && !GROUNDS.leash.test(text)) {
    drop('리드줄 조건의 근거가 원문에 없어 뺐어요');
    next.leash = false;
  }
  if (next.callFirst && !GROUNDS.callFirst.test(text)) {
    drop('전화 확인의 근거가 원문에 없어 뺐어요');
    next.callFirst = false;
  }
  if (next.feeText && !feeTextGrounded(text, next.feeText)) {
    drop(`요금 문장 "${next.feeText}" 이 원문에 없어 뺐어요`);
    next.feeText = null;
  }
  if (next.feeFree === true && !GROUNDS.feeFree.test(text)) {
    drop('추가 요금 없음의 근거가 원문에 없어 뺐어요');
    next.feeFree = null;
  }

  // 3) 한 판단 안의 모순 — 어느 쪽이 맞는지 모르므로 **허용 쪽**을 뺀다(제한은 원문이 확인해 준다).
  if (next.smallDogOnly && next.largeDogOk === true) {
    drop('소형견만인데 대형견 가능이라 해서 대형견 가능을 뺐어요');
    next.largeDogOk = null;
  }
  if (next.feeFree === true && next.feeText && FEE_AMOUNT.test(next.feeText)) {
    drop('요금 문장이 있는데 추가 요금 없음이라 해서 추가 요금 없음을 뺐어요');
    next.feeFree = null;
  }

  return { facts: next, corrections };
}
