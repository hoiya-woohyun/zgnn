/**
 * 넷째 상태(미점검)를 지키는 테스트. `verify` 의 truthy 만 보는 구현이면 여기서 깨진다 —
 * 그 구현은 아직 안 본 후보를 "괜찮다" 로 보여 주고, 그것이 이 패스를 만든 이유를 그대로 되돌린다.
 */

import { describe, expect, it } from 'vitest';
import { verifyListedOnly, verifyNeedsLook, verifyView } from './adminVerify';
import type { TCandidateVerify } from './adminCandidates';

const verify = (over: Partial<TCandidateVerify> = {}): TCandidateVerify => ({
  petAllowedHere: 'unclear',
  dogWasThere: false,
  quote: null,
  why: '이 카페 단락에 강아지 언급이 없다',
  ...over,
});

describe('verifyView', () => {
  it.each([null, undefined])('미점검(%o)은 표식을 그리지 않는다 — 초록도 회색도 거짓말이다', (value) => {
    expect(verifyView(value)).toBeNull();
  });

  it('강아지가 그 자리에 있었으면 동반 확인 — 초록', () => {
    expect(verifyView(verify({ petAllowedHere: 'yes', dogWasThere: true, quote: '강아지랑 테라스에 앉았어요' }))).toEqual({
      label: '동반 확인',
      tone: 'success',
      ok: true,
      state: 'confirmed',
    });
  });

  it("조건은 모르지만 강아지가 그 자리에 있었으면 그것도 근거다", () => {
    expect(verifyView(verify({ dogWasThere: true, quote: '테라스에서 같이 아이스크림을 먹었다' }))).toMatchObject({ ok: true, state: 'confirmed' });
  });

  it('동반 가능이라 적혀 있을 뿐 강아지가 있었다는 서술이 없으면 동반 표기만 — 경고 톤, 근거로는 친다(2026-10-04)', () => {
    // 실측 메모: "본문이 애견동반카페라 명시했지만 글쓴이 강아지가 함께 있었다는 서술은 없다" — 그런데 뱃지는 '동반 확인' 이었다.
    expect(verifyView(verify({ petAllowedHere: 'yes', quote: '애견동반카페예요' }))).toEqual({
      label: '동반 표기만',
      tone: 'warning',
      ok: true,
      state: 'listedOnly',
    });
    expect(verifyListedOnly(verify({ petAllowedHere: 'yes', quote: 'x' }))).toBe(true);
    expect(verifyListedOnly(verify({ petAllowedHere: 'yes', dogWasThere: true, quote: 'x' }))).toBe(false);
    expect(verifyListedOnly(null)).toBe(false);
  });

  it('동반 불가 정황은 빨강 — 승인을 망설이게 하는 쪽이다', () => {
    expect(verifyView(verify({ petAllowedHere: 'no' }))).toMatchObject({ label: '동반 불가 정황', tone: 'error', ok: false, state: 'denied' });
  });

  it('점검했는데 아무 근거가 없으면 그렇게 말한다 — 사용자가 걸린 바로 그 자리다', () => {
    expect(verifyView(verify())).toMatchObject({ label: '동반 근거 없음', tone: 'warning', ok: false, state: 'noEvidence' });
  });
});

describe('verifyNeedsLook — 걸러 보기가 세는 것', () => {
  it.each([null, undefined])('미점검(%o)은 세지 않는다 — 안 본 것과 보고 못 찾은 것을 한 숫자로 뭉치지 않는다', (value) => {
    expect(verifyNeedsLook(value)).toBe(false);
  });

  it.each([
    [verify(), true],
    [verify({ petAllowedHere: 'no' }), true],
    [verify({ petAllowedHere: 'yes', quote: 'x' }), false], // 동반 표기만도 근거로 친다 — 표시만 갈랐다
  ])('%o → %s', (value, expected) => {
    expect(verifyNeedsLook(value)).toBe(expected);
  });
});
