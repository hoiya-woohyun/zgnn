/**
 * 표식 매핑이 **전수**인지 지키는 테스트.
 *
 * 이 파일이 막는 것은 하나다 — `reviewCandidates.mjs` 가 내는 표식 중 하나라도 표에서 빠지면 화면이 조용히
 * 원문(`AI≠정규식(실내 free/cage)` 같은 내부 문자열)을 그대로 뱉는다. 옛 `FLAG_COLOR` 가 정확히 그 상태였고,
 * 빌드도 테스트도 초록이었다. 그래서 여기서 **모르는 표식이 회색이 아님**까지 단정한다 — 회색이면 새 표식이 묻힌다.
 */

import { describe, expect, it } from 'vitest';
import { adminFlagView, policyLine } from './adminPreview';
import type { TPolicyPreview } from './adminCandidates';

const preview = (over: Partial<TPolicyPreview> = {}): TPolicyPreview => ({
  regexBadges: [],
  mergedBadges: ['야외만'],
  facts: null,
  flags: [],
  level: '조건',
  ...over,
});

describe('adminFlagView — 표식 전수', () => {
  /** `groupFlags`(mjs:91-95) 5개 + `previewPolicy`(mjs:79-83) 5개. 보간형은 접두어로 잡힌다. */
  it.each([
    ['지역 없음', '지역 없음', 'error'],
    ['동반불가 문장', '동반불가 문장', 'error'],
    ['AI≠정규식(실내 outdoorOnly/cage)', '실내 조건 엇갈림', 'warning'],
    ['AI≠정규식(실내 free/cage)', '실내 조건 엇갈림', 'warning'],
    ['목록글', '목록글', 'gray'],
  ])('%s → 뱃지 "%s"(%s)', (flag, label, tone) => {
    const view = adminFlagView([flag]);
    expect(view.badges).toEqual([{ key: flag, label, tone }]);
    expect(view.notes).toEqual([]);
  });

  it("'좌표 없음' 은 뱃지가 아니라 둘째 줄의 한마디다 — 승인을 막지 않고 지도에만 안 나온다", () => {
    expect(adminFlagView(['좌표 없음'])).toEqual({ badges: [], notes: ['지도에 안 보여요'] });
  });

  it.each(['조건문 없음', 'AI 판단 없음', '중복표시', '짝 없음', '정규식 못읽음'])(
    '%s 은 화면에서 감춘다(다른 자리가 같은 말을 한다)',
    (flag) => {
      expect(adminFlagView([flag])).toEqual({ badges: [], notes: [] });
    },
  );

  it('모르는 표식은 원문 그대로, 그러나 **회색이 아니게** 보인다', () => {
    const view = adminFlagView(['아직 없는 표식']);
    expect(view.badges).toEqual([{ key: '아직 없는 표식', label: '아직 없는 표식', tone: 'warning' }]);
    expect(view.badges[0].tone).not.toBe('gray');
  });

  it('승인을 막는 것이 앞, 참고가 뒤 — 들어온 순서와 무관하게 자리가 정해진다', () => {
    const view = adminFlagView(['목록글', '동반불가 문장', '좌표 없음', '지역 없음']);
    expect(view.badges.map((badge) => badge.label)).toEqual(['지역 없음', '동반불가 문장', '목록글']);
    expect(view.notes).toEqual(['지도에 안 보여요']);
  });

  it('두 함수가 낼 수 있는 표식 전부를 넣으면 감춘 넷만 사라진다', () => {
    const all = [
      '지역 없음',
      '좌표 없음',
      '목록글',
      '중복표시',
      '짝 없음',
      '조건문 없음',
      '정규식 못읽음',
      'AI 판단 없음',
      'AI≠정규식(실내 free/cage)',
      '동반불가 문장',
    ];
    const view = adminFlagView(all);
    expect(view.badges.length + view.notes.length).toBe(all.length - 5);
  });
});

describe('policyLine — 세 갈래', () => {
  it.each([null, undefined, '', '   '])('조건 원문이 %o 면 "조건 문장이 없어요"', (text) => {
    expect(policyLine(preview(), text)).toBe('조건 문장이 없어요');
  });

  it('읽어낸 조건이 있으면 그것을 그대로 — 구분자는 쉼표가 아니라 가운뎃점이다(요금 원문에 쉼표가 있다)', () => {
    expect(policyLine(preview({ mergedBadges: ['야외만', '리드줄'] }), '야외석만 가능해요')).toBe(
      '조건 [야외만 · 리드줄]',
    );
  });

  it('문장은 있는데 아무도 못 읽었으면 "조건을 못 읽었어요" — 옛 화면은 이것을 "자유" 라고 불렀다', () => {
    expect(policyLine(preview({ mergedBadges: [], facts: null }), '애견동반 가능해요!')).toBe('조건을 못 읽었어요');
  });

  /**
   * 뱃지 0개가 곧 "못 읽었다" 는 아니다 — `toPetBadges` 가 `largeDogOk === false` 에 뱃지를 안 만든다.
   * 이 갈래가 없으면 한 카드가 `AI 분석 완료` · `조건을 못 읽었어요` · `AI 가 읽은 것: 대형견 불가` 를 동시에 말한다.
   */
  it('AI 는 읽었는데 뱃지가 안 되는 값이면 못 읽었다고 하지 않는다', () => {
    const facts = { largeDogOk: false } as TPolicyPreview['facts'];
    expect(policyLine(preview({ mergedBadges: [], facts }), '대형견은 어려워요')).toBe(
      'AI 는 읽었는데 사이트에 안 나와요',
    );
  });

  it('판단 객체는 있는데 조각이 0개면 그건 정말 못 읽은 것이다', () => {
    const facts = {} as TPolicyPreview['facts'];
    expect(policyLine(preview({ mergedBadges: [], facts }), '애견동반 가능해요!')).toBe('조건을 못 읽었어요');
  });

  it("원문이 '정보 없음' 이어도 문장은 있는 것이다 — level 이 아니라 원문 유무로 가르는 이유", () => {
    expect(policyLine(preview({ mergedBadges: ['확인된 정보 없음'], level: '정보없음' }), '정보 없음.')).toBe(
      '조건 [확인된 정보 없음]',
    );
  });
});
