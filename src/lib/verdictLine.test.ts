import { describe, expect, it } from 'vitest';
import { judgeEligibility, type TEligibility } from './eligibility';
import { parsePetPolicy, toPetBadges } from './petPolicy';
import { cardConditions, OUTDOOR_SEAT_NOTE, VERDICT_TEXT_CLASS, verdictTone, verdictWords } from './verdictLine';
import type { TDogProfile } from '../types';

const TOFU: TDogProfile = { dogs: [{ name: '두부', weightKg: 4 }], carrier: 'bag' };
const judged = (level: TEligibility['level'], rule?: string): TEligibility => ({
  level,
  reasons: rule ? [{ level: level === 'ok' ? 'info' : level, text: '', rule }] : [],
});

describe('verdictWords — 판정 넷 = 글자색 넷', () => {
  it('넷이 서로 다른 글자색이다(예전엔 야외만=확인 필요, 정보 없음≈어려움)', () => {
    expect(new Set(Object.values(VERDICT_TEXT_CLASS)).size).toBe(4);
    expect(VERDICT_TEXT_CLASS).toEqual({
      ok: 'text-brand-secondary',
      cond: 'text-warning-primary',
      unknown: 'text-tertiary',
      hard: 'text-error-primary',
    });
  });

  it("야외 자리만은 판정이 아니라 조건 — '갈 수 있어요 · 야외 자리만', 색은 갈 수 있어요", () => {
    expect(verdictWords(judged('cond', 'C1'))).toEqual({ tone: 'ok', head: '갈 수 있어요', note: OUTDOOR_SEAT_NOTE });
    expect(verdictTone(judged('cond', 'C4'))).toBe('ok');
  });

  it('야외 자리 규칙 밖의 확인이 하나라도 있으면 확인이 필요해요', () => {
    const e: TEligibility = {
      level: 'cond',
      reasons: [
        { level: 'cond', text: '', rule: 'C1' },
        { level: 'cond', text: '', rule: 'C6' },
      ],
    };
    expect(verdictWords(e)).toEqual({ tone: 'cond', head: '확인이 필요해요' });
  });

  it('나머지는 레벨 그대로', () => {
    expect(verdictWords(judged('ok'))).toEqual({ tone: 'ok', head: '갈 수 있어요' });
    expect(verdictWords(judged('unknown'))).toEqual({ tone: 'unknown', head: '확인된 정보가 없어요' });
    expect(verdictWords(judged('hard', 'H0'))).toEqual({ tone: 'hard', head: '이용하기 어려워요' });
  });

  it('실제 원문 — 야외석만 되는 곳', () => {
    const e = judgeEligibility(TOFU, parsePetPolicy('야외석만 가능해요'));
    expect(verdictWords(e).note).toBe(OUTDOOR_SEAT_NOTE);
  });
});

describe('cardConditions — 판정 옆 조건 몇 개 · 외 N개', () => {
  const policy = parsePetPolicy('10kg 이하 2마리까지. 1마리당 2만원 추가. 청소비 5만원. 예방접종 필수');

  it('limit 없으면 전부, 접힌 것 0', () => {
    const { shown, hidden } = cardConditions({ policy });
    expect(shown.map((b) => b.label)).toEqual(toPetBadges(policy).map((b) => b.label));
    expect(hidden).toBe(0);
  });

  it('limit 자리에선 요금 줄을 하나만 세우고, 숨긴 요금 줄도 외 N개에 센다', () => {
    const all = toPetBadges(policy);
    const { shown, hidden } = cardConditions({ policy, limit: 2 });
    expect(shown.filter((b) => b.axis === 'fee')).toHaveLength(1);
    expect(shown).toHaveLength(2);
    expect(hidden).toBe(all.length - 2);
  });

  it('카드가 요금 한 줄을 따로 세우면 요금 칩을 빼고, 외 N개에서도 뺀다', () => {
    const all = toPetBadges(policy);
    const { shown, hidden } = cardConditions({ policy, limit: 2, feeLine: '두부는 2만원' });
    expect(shown.some((b) => b.axis === 'fee')).toBe(false);
    expect(hidden).toBe(all.length - shown.length - 1);
  });

  it('hide 로 뺀 것은 외 N개에 세지 않는다', () => {
    const { shown, hidden } = cardConditions({ policy, limit: 10, hide: (b) => b.axis === 'fee' });
    expect(shown.some((b) => b.axis === 'fee')).toBe(false);
    expect(hidden).toBe(0);
  });
});

describe('cardConditions — lead 여럿은 그 순서로 맨 앞(14 W261027.1)', () => {
  it('"7kg 미만 1마리" 곳 — lead 두 칩이 순서대로 서고 나머지는 외 N개', () => {
    const policy = parsePetPolicy('7kg 미만 최대 1마리 가능. 추가 1만원. 방문 전 전화 확인');
    const labels = toPetBadges(policy).map((b) => b.label);
    expect(labels).toEqual(expect.arrayContaining(['7kg 미만', '최대 1마리']));
    const { shown, hidden } = cardConditions({ policy, limit: 2, lead: ['7kg 미만', '최대 1마리'] });
    expect(shown.map((b) => b.label)).toEqual(['7kg 미만', '최대 1마리']);
    expect(hidden).toBe(labels.length - 2);
    // 한 칸짜리(근처 장소)도 그대로 받는다.
    expect(cardConditions({ policy, limit: 2, lead: '최대 1마리' }).shown[0].label).toBe('최대 1마리');
  });
});
