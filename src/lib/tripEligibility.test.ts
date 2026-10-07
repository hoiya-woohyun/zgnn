import { describe, expect, it } from 'vitest';
import { dogSubsetWhatIf } from './dogSubsetWhatIf';
import { judgeEligibility } from './eligibility';
import { parsePetPolicy } from './petPolicy';
import { tripEligibility } from './tripEligibility';
import type { TDogProfile } from '../types';

const DAEJANG_CHOCO: TDogProfile = { dogs: [{ name: '대장', weightKg: 18 }, { name: '초코', weightKg: 12 }], carrier: 'none' };
const CHOCO: TDogProfile = { dogs: [{ name: '초코', weightKg: 12 }], carrier: 'none' };

const day = (...texts: string[]) => texts.map((text, index) => ({ id: `p${index + 1}`, policy: parsePetPolicy(text) }));

describe('tripEligibility', () => {
  it('빈 하루는 판정하지 않는다', () => {
    expect(tripEligibility(DAEJANG_CHOCO, [])).toBeNull();
  });

  it('다 갈 수 있으면 ok — 걸린 곳도, 부분집합도 없다', () => {
    expect(tripEligibility(DAEJANG_CHOCO, day('실내외 모두 가능.', '실내외 모두 가능.'))).toEqual({
      level: 'ok',
      reasons: [],
      subset: null,
    });
  });

  it('가장 나쁜 곳이 하루의 판정 · 걸린 곳은 나쁜 순, 같으면 하루 순서', () => {
    const result = tripEligibility(DAEJANG_CHOCO, day('야외 테라스만 가능', '실내외 모두 가능.', '', '15kg 이하 2마리까지'));
    expect(result?.level).toBe('hard');
    expect(result?.reasons.map((entry) => [entry.id, entry.level])).toEqual([
      ['p4', 'hard'],
      ['p3', 'unknown'],
      ['p1', 'cond'],
    ]);
    expect(result?.reasons[0].reasons.map((reason) => reason.rule)).toEqual(['H1']);
  });

  it('요금(info)은 근거가 아니다', () => {
    const places = day('야외 테라스만 가능, 반려견 1마리당 1만원');
    // 장소 판정에는 요금 줄이 있다 — 묶음에서 빠지는 것을 보려면 먼저 있어야 한다.
    expect(judgeEligibility(CHOCO, places[0].policy).reasons.some((reason) => reason.level === 'info')).toBe(true);
    const result = tripEligibility(CHOCO, places);
    expect(result?.reasons).toHaveLength(1);
    expect(result?.reasons.flatMap((entry) => entry.reasons).some((reason) => reason.level === 'info')).toBe(false);
  });

  it('"이 날은 초코만" — 어려운 곳을 다 풀어 주는 조합', () => {
    const result = tripEligibility(DAEJANG_CHOCO, day('15kg 이하 2마리까지', '실내외 모두 가능.'));
    expect(result?.subset).toEqual({ names: ['초코'], level: 'ok' });
  });

  it('조합의 판정은 하루 전체의 가장 나쁜 곳', () => {
    const result = tripEligibility(DAEJANG_CHOCO, day('15kg 이하 2마리까지', '야외 테라스만 가능'));
    expect(result?.subset).toEqual({ names: ['초코'], level: 'cond' });
  });

  it('원래 정보가 없는 곳은 조합을 막지 않는다', () => {
    const result = tripEligibility(DAEJANG_CHOCO, day('15kg 이하 2마리까지', ''));
    expect(result?.subset).toEqual({ names: ['초코'], level: 'unknown' });
  });

  it('한 곳이라도 누구를 빼도 안 되면 조합이 없다', () => {
    expect(tripEligibility(DAEJANG_CHOCO, day('15kg 이하 2마리까지', '반려견 동반 불가'))?.subset).toBeNull();
    expect(tripEligibility(DAEJANG_CHOCO, day('15kg 이하 2마리까지', '5kg 이하'))?.subset).toBeNull();
  });

  it('어려운 곳이 없거나 한 마리면 묻지 않는다', () => {
    expect(tripEligibility(DAEJANG_CHOCO, day('야외 테라스만 가능'))?.subset).toBeNull();
    expect(tripEligibility(CHOCO, day('5kg 이하'))?.subset).toBeNull();
  });

  it('장소 하나일 때는 dogSubsetWhatIf 와 같은 답', () => {
    const three: TDogProfile = {
      dogs: [{ name: '단비', weightKg: 5 }, { name: '솜', weightKg: 7 }, { name: '구름', weightKg: 6 }],
      carrier: 'none',
    };
    const places = day('2마리까지');
    const single = dogSubsetWhatIf(three, places[0].policy, judgeEligibility(three, places[0].policy));
    expect(single?.names).toEqual(['솜', '구름']);
    expect(tripEligibility(three, places)?.subset).toEqual({ names: single?.names, level: single?.eligibility.level });
  });
});
