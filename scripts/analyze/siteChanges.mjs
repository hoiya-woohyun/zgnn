// 후보가 **사이트(게시된 장소)와 다른 사실**을 말하는가 — 차이 게이트(docs/todo/11 U1)의 판정. 테스트는 siteChanges.test.mjs.
//
// 왜 `overwriteWithLatest` 의 patch 를 그대로 쓰지 않나 — 그 patch 는 "글자가 다른 칸" 이다. 블로그 두 편이 같은 조건을 쓴 문장은
// 글자가 늘 다르고(조건 원문 · 소개 · 숙소 시설), 이름·주소·좌표·카테고리·홈페이지는 글이 아니라 **네이버 검색**이 준 값이라
// 표기만 다르다(`제주특별자치도` ↔ `제주` · 좌표 몇 m). 그 patch 가 비었는지로 가르면 기존 가게를 쓴 글 거의 전부가 '갱신' 이 되어
// data-pipeline v14 가 막은 소음(같은 펜션 13줄)이 그대로 돌아온다(11 G2).
//
// 그래서 **글이 말한 사실 칸만, 사실끼리** 대 본다 — 조건은 구조 판단(`TPetPolicyFacts`)으로, 숙박 요금은 금액으로, 숙소 환경은 칸별로.
// 그리고 그 칸이 `overwriteWithLatest` 의 patch 에도 있을 때만 센다 — 게이트가 올린 칸은 덮어쓰기 화면의 전·후 목록에 반드시 선다.
//
// 원칙 하나 — **후보가 "말하지 않은 것" 은 다른 말이 아니다.** 판단의 `unknown`·`null`·`false`(근거 없음으로 눕힌 값,
// `correctPetPolicyFacts`)는 "언급 없음" 이라 사이트 값과 달라도 세지 않는다. 그렇지 않으면 조건을 한 줄만 쓴 글이
// 사이트의 다른 조건을 전부 지우자고 하는 꼴이 된다.
//
// 순수 모듈이다(브라우저도 읽을 수 있게 node 모듈을 넣지 않는다).

import { amountsInWon } from '../lib/feeLine.mjs';
import { feeLinesOf } from '../lib/petPolicyFacts.mjs';
import { mergeIntoExisting, overwriteWithLatest } from './applyApproved.mjs';

const isBlank = (v) => v == null || String(v).trim() === '';
const isObject = (v) => v != null && typeof v === 'object' && !Array.isArray(v);

/** 판단의 금액 집합(원). 요금 줄(구조 label · 줄 · 옛 한 칸)을 전부 본다 — `feeLinesOf` 와 같은 입구. */
const feeAmounts = (facts) => [...new Set(feeLinesOf(facts).flatMap((line) => amountsInWon(line)))].sort((a, b) => a - b);

const sameList = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

/**
 * 조건 판단 두 벌의 **사실 차이** — 칸 이름 목록. 사이트 판단이 없으면(시드: 정규식은 앱이 런타임에 읽고 DB 엔 원문뿐이다)
 * "아무것도 모른다" 와 대 본다 — 그래서 후보가 무엇이든 말하면 차이다(11 §4-5 의 "시드의 첫 갱신 물결" 이 이것이다).
 * `notes` 는 세지 않는다 — 문장이라 글마다 다르고, 판정에 닿지 않는다.
 *
 * @param {object | null | undefined} site  places.pet_policy
 * @param {object | null | undefined} next  후보의 petPolicy
 * @returns {string[]}
 */
export function petPolicyFactChanges(site, next) {
  if (!isObject(next)) return [];
  const s = isObject(site) ? site : {};
  const out = [];
  // 셋 값(있음 · 없음 · 모름) — 후보가 모르면(`unknown`·null) 세지 않는다.
  if (next.indoor && next.indoor !== 'unknown' && next.indoor !== (s.indoor ?? 'unknown')) out.push('indoor');
  for (const key of ['largeDogOk', 'feeFree', 'weightLimitKg', 'maxDogs']) {
    if (next[key] != null && next[key] !== (s[key] ?? null)) out.push(key);
  }
  // 참일 때만 말한 것이다 — false 는 "근거 없음" 이다(`correctPetPolicyFacts` 가 근거 없는 true 를 false 로 눕힌다).
  for (const key of ['leash', 'smallDogOnly', 'callFirst', 'vaccineRequired']) {
    if (next[key] === true && s[key] !== true) out.push(key);
  }
  // 요일 제한은 후보가 요일을 말했고 사이트와 다를 때만 — 비어 있으면 "언급 없음"(`correctPetPolicyFacts` 가 근거 없는 요일을 null 로 눕힌다).
  if (Array.isArray(next.petDays) && next.petDays.length > 0 && !sameList([...next.petDays].sort(), [...(s.petDays ?? [])].sort())) out.push('petDays');
  const amounts = feeAmounts(next);
  if (amounts.length > 0 && !sameList(amounts, feeAmounts(s))) out.push('fees');
  return out;
}

/** 숙소 환경 — 둘 다 값이 있는 칸이 다를 때만(사이트가 빈 칸은 보강이다). */
function environmentChanges(site, next) {
  if (!isObject(site) || !isObject(next)) return [];
  return ['standalone', 'yard', 'fencedYard', 'stairs'].filter((key) => site[key] != null && next[key] != null && site[key] !== next[key]);
}

/**
 * 후보가 게시된 장소의 **이미 찬 칸**과 다른 사실을 말하는 칸들(덮어쓰기 칸 이름으로). 없으면 [].
 *  - `pet_policy_text` — 사이트 원문이 있고, 판단이 사실로 다르다(`petPolicyFactChanges`). 원문이 비었으면 보강(`fillColumns`)이다.
 *  - `stay_price_text` — 숙소이고 사이트 요금 원문이 있고, 후보 원문의 금액이 다르다.
 *  - `stay_environment` — 둘 다 값이 있는 칸이 다르다.
 * 이름·주소·좌표·카테고리·홈페이지·소개·숙소 시설은 **세지 않는다**(머리 주석) — 그 칸들은 덮어쓰기 화면에서 여전히 고를 수 있다.
 *
 * @param {object} placeRow  places 행(snake_case)
 * @param {object} extracted  후보의 extracted(toCandidateRow 가 만든 모양)
 * @returns {string[]}
 */
export function siteChanges(placeRow, extracted) {
  if (!placeRow || !extracted) return [];
  const patch = overwriteWithLatest(placeRow, extracted)?.patch ?? {};
  const out = [];
  if ('pet_policy_text' in patch && !isBlank(placeRow.pet_policy_text) && petPolicyFactChanges(placeRow.pet_policy, extracted.petPolicy).length > 0) {
    out.push('pet_policy_text');
  }
  if ('stay_price_text' in patch && !isBlank(placeRow.stay_price_text)) {
    const next = [...new Set(amountsInWon(extracted.stayPriceText))].sort((a, b) => a - b);
    const site = [...new Set(amountsInWon(placeRow.stay_price_text))].sort((a, b) => a - b);
    if (next.length > 0 && !sameList(next, site)) out.push('stay_price_text');
  }
  if ('stay_environment' in patch && environmentChanges(placeRow.stay_environment, extracted.stayEnvironment).length > 0) {
    out.push('stay_environment');
  }
  return out;
}

/**
 * 후보가 채울 **빈 칸**들 — `mergeIntoExisting` 의 patch 칸 이름. `review_url` 은 넣지 않는다(글 링크라 어느 글이든 채운다 —
 * 그것만으로 '보강' 이 되면 출처 링크가 빈 장소를 쓴 글이 전부 줄을 먹는다).
 */
export function fillColumns(placeRow, extracted) {
  if (!placeRow || !extracted) return [];
  return Object.keys(mergeIntoExisting(placeRow, extracted) ?? {});
}
