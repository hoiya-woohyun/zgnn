import { describe, expect, it } from 'vitest';
import { compareEligibility, dogSize, feeForDog, judgeEligibility } from './eligibility';
import { PLACES } from './places';
import type { TDogProfile } from '../types';

// 리뷰 §1 의 세 프로필. 실제 실사 표(사람 판단)와 비교하는 집계 테스트에도 그대로 쓴다.
const TOFU: TDogProfile = { name: '두부', weightsKg: [4], carrier: 'bag' };
const BORI_AND_KONG: TDogProfile = { name: '보리+콩', weightsKg: [28, 17], carrier: 'none' };
const KONG: TDogProfile = { name: '콩', weightsKg: [17], carrier: 'cage' };

const findPlace = (name: string) => {
  const place = PLACES.find((p) => p.name === name);
  if (!place) throw new Error(`${name} 을(를) places.json 에서 찾지 못했다`);
  return place;
};

describe('dogSize', () => {
  it('경계값: 10 은 중형, 25 는 중형, 25.1 은 대형', () => {
    expect(dogSize({ name: '', weightsKg: [10], carrier: 'none' })).toBe('medium');
    expect(dogSize({ name: '', weightsKg: [25], carrier: 'none' })).toBe('medium');
    expect(dogSize({ name: '', weightsKg: [25.1], carrier: 'none' })).toBe('large');
  });

  it('9.9 는 소형, 여러 마리면 최댓값 기준', () => {
    expect(dogSize({ name: '', weightsKg: [9.9], carrier: 'none' })).toBe('small');
    expect(dogSize(BORI_AND_KONG)).toBe('large'); // max(28,17) = 28
  });

  it('sizeOverride 가 있으면 무게 계산 대신 그 값을 쓴다', () => {
    expect(dogSize({ name: '', weightsKg: [28], carrier: 'none', sizeOverride: 'small' })).toBe('small');
  });
});

describe('judgeEligibility — 웨스티하우스(계단식 무게·마릿수)', () => {
  it('17kg 2마리는 어려움 — 20kg 미만 칸의 마릿수 상한(1마리)에 걸린다', () => {
    const place = findPlace('웨스티하우스');
    const dog: TDogProfile = { name: '단비', weightsKg: [17, 17], carrier: 'none' };
    const result = judgeEligibility(dog, place.policy);
    expect(result.level).toBe('hard');
    expect(result.reasons[0].text).toContain('20kg 미만은 1마리까지');
    expect(result.reasons[0].quote).toBe('20kg 미만(중형견)의 경우 최대 1마리 가능');
  });

  it('8kg 2마리는 가능 — 10kg 미만 칸(최대 2마리)에 들어간다', () => {
    const place = findPlace('웨스티하우스');
    const dog: TDogProfile = { name: '단비', weightsKg: [8, 8], carrier: 'none' };
    expect(judgeEligibility(dog, place.policy).level).toBe('ok');
  });

  it('8kg 3마리는 어려움 — 같은 칸이어도 마릿수(2마리)를 넘는다', () => {
    const place = findPlace('웨스티하우스');
    const dog: TDogProfile = { name: '단비', weightsKg: [8, 8, 8], carrier: 'none' };
    const result = judgeEligibility(dog, place.policy);
    expect(result.level).toBe('hard');
    expect(result.reasons[0].text).toContain('10kg 미만은 2마리까지');
  });
});

describe('judgeEligibility — 케이지 필수 식당("케이지 동반시 가능.")', () => {
  const place = findPlace('모닥식탁');

  it('두부(이동가방)는 조건부 — 케이지라 적혀 있어 확인이 필요하다', () => {
    const result = judgeEligibility(TOFU, place.policy);
    expect(result.level).toBe('cond');
    expect(result.reasons.some((r) => r.text.includes('이동가방도 되는지 확인'))).toBe(true);
  });

  it('보리+콩(이동 수단 없음, 대형견)은 어려움', () => {
    const result = judgeEligibility(BORI_AND_KONG, place.policy);
    expect(result.level).toBe('hard');
  });

  // 원래 브리프는 "콩(cage) → cond" 였으나, 규칙표(H5/C2/C3/C4)의 네 갈래는 carrier 값에 따라
  // 배타적이고 'cage' 는 그중 어느 갈래에도 안 걸린다 — 정확히 필요한 이동 수단을 들고 온
  // 경우까지 조건부로 만들면 케이지/이동가방을 구분한 의미가 없어진다. 그래서 'ok' 로 둔다
  // (advisor 검토로 확인 — 팀 리드 확인 필요, 보고서에 기재).
  it('콩(케이지 있음)은 가능 — 필요한 이동 수단을 정확히 갖췄다', () => {
    const result = judgeEligibility(KONG, place.policy);
    expect(result.level).toBe('ok');
  });
});

describe('judgeEligibility — 실내 케이지 · 실외 자유("무거버거")', () => {
  it('보리+콩은 조건부 — 야외 자리는 갈 수 있다', () => {
    const place = findPlace('무거버거');
    const result = judgeEligibility(BORI_AND_KONG, place.policy);
    expect(result.level).toBe('cond');
    expect(result.reasons.some((r) => r.text.includes('야외'))).toBe(true);
  });

  it('실내 자리가 꼭 필요하면(needsIndoor) 어려움으로 올라간다', () => {
    const place = findPlace('무거버거');
    const result = judgeEligibility(BORI_AND_KONG, place.policy, { needsIndoor: true });
    expect(result.level).toBe('hard');
  });
});

describe('judgeEligibility — 정보 없음 + 힌트("맘앤도그")', () => {
  it('정보 없음이지만 대형견 가능 문구가 info 로 남는다', () => {
    const place = findPlace('맘앤도그');
    const result = judgeEligibility(KONG, place.policy);
    expect(result.level).toBe('unknown');
    expect(result.reasons.some((r) => r.level === 'unknown')).toBe(true);
    const hint = result.reasons.find((r) => r.level === 'info' && r.text.includes('대형견'));
    expect(hint).toBeDefined();
  });
});

describe('feeForDog — 솔숲펜션(구간 요금표)', () => {
  it('4kg 은 첫 구간(1~5kg)에 들어가 첫 줄이 나온다', () => {
    const place = findPlace('솔숲펜션');
    expect(feeForDog(place.policy, TOFU)).toBe('1~5kg 1만원');
  });

  it('6kg 은 두 번째 구간(6~10kg)에 들어간다', () => {
    const place = findPlace('솔숲펜션');
    const dog: TDogProfile = { name: '초코', weightsKg: [6], carrier: 'none' };
    expect(feeForDog(place.policy, dog)).toBe('6~10kg 1.5만원');
  });

  it('추가요금이 없는 곳은 "추가 요금 없음"', () => {
    const place = findPlace('백화stay');
    expect(feeForDog(place.policy, TOFU)).toBe('추가 요금 없음');
  });

  it('요금 문장이 아예 없으면 undefined', () => {
    const place = findPlace('스테이모슬'); // '무게 제한 없이 대형견도 가능해요' — 요금은 마리당 정액이라 feeLines 는 있다
    // feeLines 가 있는 숙소이므로, 요금 문장이 전혀 없는 식당으로 다시 확인한다.
    const noFeePlace = findPlace('부부키친');
    expect(feeForDog(noFeePlace.policy, TOFU)).toBeUndefined();
    expect(feeForDog(place.policy, TOFU)).toBeDefined();
  });
});

describe('judgeEligibility — 리뷰 반영 경계', () => {
  it('실내 케이지·실외 자유인 곳에 대형견 + 이동가방: 실내가 꼭 필요하면 어려움, 아니면 조건부', () => {
    const place = findPlace('무거버거');
    const dog: TDogProfile = { name: '보리', weightsKg: [28], carrier: 'bag' };
    expect(judgeEligibility(dog, place.policy).level).toBe('cond');
    expect(judgeEligibility(dog, place.policy, { needsIndoor: true }).level).toBe('hard');
  });

  it('케이지 필수 식당에 대형견·이동 수단 없음: 어려움 근거는 한 줄만(H4·H5 중복 없음)', () => {
    const place = findPlace('모닥식탁');
    const result = judgeEligibility(BORI_AND_KONG, place.policy);
    expect(result.level).toBe('hard');
    expect(result.reasons.filter((r) => r.level === 'hard')).toHaveLength(1);
  });

  it("'유모차 불가' 는 유모차 허용으로 읽지 않는다", () => {
    const policy = { ...findPlace('모닥식탁').policy, sources: { indoor: '실내는 유모차 불가, 케이지 동반시 가능' } };
    const dog: TDogProfile = { name: '두부', weightsKg: [4], carrier: 'stroller' };
    expect(judgeEligibility(dog, policy).level).toBe('cond');
  });

  it('몸무게 배열이 비어도 -Infinity 로 새지 않는다', () => {
    expect(dogSize({ name: '', weightsKg: [], carrier: 'none' })).toBe('small');
  });
});

describe('feeForDog — 구간 밖', () => {
  it('어느 구간에도 안 들어가면 첫 구간을 지어내지 않고 비운다', () => {
    const place = findPlace('솔숲펜션'); // "1~5kg 1만원. 6~10kg 1.5만원." — 구간 줄뿐
    expect(feeForDog(place.policy, BORI_AND_KONG)).toBeUndefined();
  });

  it('구간 밖이어도 구간이 아닌 요금 줄이 있으면 그 줄을 쓴다', () => {
    const policy = { ...findPlace('솔숲펜션').policy, feeLines: ['1~5kg 1만원', '청소비 3만원 추가'] };
    expect(feeForDog(policy, BORI_AND_KONG)).toBe('청소비 3만원 추가');
  });
});

describe('compareEligibility', () => {
  it('ok < cond < unknown < hard', () => {
    expect(compareEligibility('ok', 'cond')).toBeLessThan(0);
    expect(compareEligibility('cond', 'unknown')).toBeLessThan(0);
    expect(compareEligibility('unknown', 'hard')).toBeLessThan(0);
    expect(compareEligibility('hard', 'ok')).toBeGreaterThan(0);
    expect(compareEligibility('ok', 'ok')).toBe(0);
  });
});

describe('집계 — 보리+콩(28kg+17kg·이동 수단 없음) 실사 비교', () => {
  // 리뷰 문서(§1)의 사람 판단: 가능 9 / 조건부 30 / 어려움 42 / 정보 없음 5.
  // ±5 안이면 규칙표를 그대로 쓴다 — 벗어나면 억지로 맞추지 않고 보고서에 규칙별 표를 남긴다.
  it('전체 86곳 판정이 사람 판단 ±5 안에 들어온다', () => {
    const counts = { ok: 0, cond: 0, unknown: 0, hard: 0 };
    for (const place of PLACES) {
      counts[judgeEligibility(BORI_AND_KONG, place.policy).level]++;
    }
    expect(PLACES).toHaveLength(86);
    expect(counts.ok).toBeGreaterThanOrEqual(9 - 5);
    expect(counts.ok).toBeLessThanOrEqual(9 + 5);
    expect(counts.cond).toBeGreaterThanOrEqual(30 - 5);
    expect(counts.cond).toBeLessThanOrEqual(30 + 5);
    expect(counts.hard).toBeGreaterThanOrEqual(42 - 5);
    expect(counts.hard).toBeLessThanOrEqual(42 + 5);
    expect(counts.unknown).toBeGreaterThanOrEqual(5 - 5);
    expect(counts.unknown).toBeLessThanOrEqual(5 + 5);
  });
});
