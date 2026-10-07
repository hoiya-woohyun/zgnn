/**
 * 교차점검 판단(`scripts/analyze/verifyPlaces.mjs`)을 검수 화면의 표식으로.
 *
 * 왜 따로 있나 — 이 값에는 **셋이 아니라 다섯**의 상태가 있고, 그중 하나가 조용히 사라지기 쉽다:
 *   미점검(`null`) · 동반 확인 · 동반 표기만 · 동반 근거 없음 · 동반 불가 정황.
 * `verify` 의 truthy 만 보면 미점검과 '근거 없음' 이 같은 모양이 되고, 그러면 아직 안 본 후보가 "괜찮다" 로 읽힌다.
 * 그 오독이 이 패스를 만든 이유(조건 문장 없는 후보를 그냥 승인하던 것)를 그대로 되돌린다.
 *
 * '동반 표기만'(2026-10-04)은 `petAllowedHere: 'yes'` 인데 `dogWasThere: false` — 본문이 "애견동반카페" 라고 **적었을 뿐** 글쓴이의 강아지가
 * 그 자리에 있었다는 서술은 없다. 예전엔 둘을 OR 로 묶어 '동반 확인' 이라 했고, 메모("…명시했지만 강아지가 함께 있었다는 서술은 없다")와
 * 뱃지가 서로를 반박했다. **표시만 가른다** — 걸러 내기(`kindOf` 의 weak · `isNoPetEvidenceNew`)와 `ok`(근거를 찾았다)는 그대로라
 * 결정 줄의 기본 동작·일괄 집계가 바뀌지 않는다.
 *
 * CLI 의 `verifyLabel`(같은 이름·같은 갈래)과 **문구가 같아야 한다** — 터미널과 화면이 같은 후보를 다르게 부르면
 * 운영자가 둘을 대조할 수 없다. 규칙을 고칠 일이 생기면 양쪽을 같이 고친다(`adminCandidates.ts` 의 `factsLine` 과 같은 계약).
 */

import type { TCandidateVerify } from './adminCandidates';
import { spansOf, type TTextRange, type TTextSpan } from './textSpans';

export type TVerifyTone = 'success' | 'warning' | 'error';
/** 점검한 것의 네 갈래(미점검은 `verifyView` 가 null 로 말한다). */
export type TVerifyState = 'confirmed' | 'listedOnly' | 'noEvidence' | 'denied';
export type TVerifyView = { label: string; tone: TVerifyTone; ok: boolean; state: TVerifyState };

/**
 * 표식 하나. 미점검이면 `null` — **표식을 안 그리는 것**이 맞다(초록도 회색도 거짓말이다).
 * `ok` 는 "근거를 찾았다"(동반 확인 · 동반 표기만)이고, 걸러 보기 칩·결정 줄의 기본 동작이 이 값으로 정한다.
 * 갈래는 `state` 로 읽는다 — `ok` 로 가르면 '동반 표기만' 이 '동반 확인' 과 같은 모양이 된다.
 */
export function verifyView(verify: TCandidateVerify | null | undefined): TVerifyView | null {
  if (!verify) return null;
  if (verify.petAllowedHere === 'no') return { label: '동반 불가 정황', tone: 'error', ok: false, state: 'denied' };
  if (verify.dogWasThere) return { label: '동반 확인', tone: 'success', ok: true, state: 'confirmed' };
  if (verify.petAllowedHere === 'yes') return { label: '동반 표기만', tone: 'warning', ok: true, state: 'listedOnly' };
  return { label: '동반 근거 없음', tone: 'warning', ok: false, state: 'noEvidence' };
}

/** 걸러 보기('동반 표기만인 것')의 기준 — 본문이 동반 가능이라 적었을 뿐 강아지가 있었다는 서술은 없다. 미점검은 세지 않는다. */
export function verifyListedOnly(verify: TCandidateVerify | null | undefined): boolean {
  return verifyView(verify)?.state === 'listedOnly';
}

/**
 * 걸러 보기('근거 없는 것만')의 기준. **점검한 것 중** 근거를 못 찾은 것만 센다 —
 * 미점검을 여기 넣으면 칩이 "아직 안 본 것" 과 "보고 못 찾은 것" 을 한 숫자로 뭉쳐, 두 번째 패스가
 * 꺼진 실행에서도 칩이 잔뜩 켜진다(그러면 운영자가 근거 없는 후보를 찾는 길이 사라진다).
 */
export function verifyNeedsLook(verify: TCandidateVerify | null | undefined): boolean {
  const view = verifyView(verify);
  return view !== null && !view.ok;
}

/**
 * '동반 불가 정황' 인용에서 칠할 말(06 G). **표시 전용**이다 — 불가라는 판단은 교차점검이 이미 했고, 여기는 운영자가
 * 문장 하나를 다 읽지 않아도 "어느 말 때문인가" 를 보게 할 뿐이다. 그래서 넓게 잡는다(놓치면 칠한 곳이 0 이 된다).
 *
 * - 부정어는 들어가기·데려가기·동반 말 **뒤**(12자 안)에 붙은 것만 — `주차 불가` 처럼 동반과 무관한 '불가' 를 칠하지 않는다.
 * - '노펫존', 강아지를 차·숙소에 두고 갔다는 정황(프롬프트가 '그 장소에 함께 있지 않았다' 의 예로 드는 말)도 칠한다.
 * 실데이터의 '불가 정황' 이 아직 0건이라(2026-10-07 원격 읽기) 어휘는 프롬프트와 판정의 `NOT_ALLOWED_PATTERNS` 에서 왔다.
 */
const DENIED_CUES: readonly RegExp[] = [
  /노\s*(펫|독|도그)(\s*존)?/g,
  /(동반|출입|입장|입실|반입|들어가|들어갈|들어올|데려가|데려갈|데리고)[^.,!?\n]{0,12}?(불가|금지|사절|안\s*(돼|됩|된|되)|못|어렵|어려워|제한)/g,
  /못\s*(들어|데려)/g,
  /(차|차량|숙소)(에|에서)\s*(두고|놔두고|남겨|기다)/g,
];

export type TDeniedQuoteView = {
  spans: TTextSpan[];
  /** 칠한 말(중복 제거, 나온 순). 비었으면 칠할 말을 못 찾은 것이다 — 화면이 "문장 전체를 읽어 달라" 고 글로 말한다. */
  found: string[];
};

/** 미점검·불가 아님·인용 없음이면 `null` — 칠할 문장이 없다. */
export function deniedQuoteView(verify: TCandidateVerify | null | undefined): TDeniedQuoteView | null {
  const quote = verify?.quote?.trim() ? verify.quote : null;
  if (!quote || verifyView(verify)?.state !== 'denied') return null;
  const ranges: TTextRange[] = DENIED_CUES.flatMap((cue) =>
    [...quote.matchAll(new RegExp(cue.source, cue.flags))].map((match) => ({ start: match.index, end: match.index + match[0].length })),
  );
  const spans = spansOf(quote, ranges);
  return { spans, found: [...new Set(spans.filter((span) => span.mark).map((span) => span.text))] };
}
