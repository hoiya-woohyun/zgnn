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
