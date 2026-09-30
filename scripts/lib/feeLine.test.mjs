import { describe, expect, it } from 'vitest';
import { amountsInWon, normalizeFeeLines } from './feeLine.mjs';
import { correctPetPolicyFacts } from './petPolicyFacts.mjs';

describe('normalizeFeeLines', () => {
  // 시드·후보에 실제로 있던 줄들(2026-09-30 실측). 왼쪽이 원문 줄, 오른쪽이 배지 라벨.
  it.each([
    ['(2만원 추가)', ['추가 2만원']],
    ['1마리 이상 2만원 추가', ['1마리 이상 2만원']],
    ['숙박일 관계없이 청소비 5만원 추가', ['청소비 5만원']],
    ['1마리당 1-2만원', ['1마리당 1~2만원']],
    ['(2마리 또는 10kg 이상 4만원)', ['2마리 또는 10kg 이상 4만원']],
    ['두 마리부터 한 마리당 2만원의 추가 요금', ['2마리부터 1마리당 2만원']],
    ['마리당 15,000원', ['1마리당 1.5만원']],
    ['19kg 이하 1마리당 20,000원, 20kg 이상 1마리당 30,000원', ['19kg 이하 1마리당 2만원', '20kg 이상 1마리당 3만원']],
  ])('%s', (line, expected) => {
    expect(normalizeFeeLines([line])).toEqual(expected);
  });

  it('앱이 이미 읽는 모양은 그대로 둔다 — dogFee 의 곱셈·eligibility 의 kg 조건이 이 모양을 읽는다', () => {
    const lines = ['1마리당 3만원', '1~5kg 1만원', '6~10kg 1.5만원', '1박당 2만원', '주말 5만원'];
    expect(normalizeFeeLines(lines)).toEqual(lines);
  });

  it('마리당인지 원문이 말하지 않으면 마리당을 붙이지 않는다', () => {
    expect(normalizeFeeLines(['(3만원 추가)'])).toEqual(['추가 3만원']);
  });

  it('나눈 조각 중 금액 없는 설명문은 버리고, 같은 라벨은 한 번만 — 배지 key 가 라벨이다', () => {
    const lines = [
      '19kg 이하 1마리당 20,000원, 20kg 이상 1마리당 30,000원',
      '반려견 추가 요금은 몸무게에 따라 달라져요 / 19kg 이하 1마리당 20,000원 / 20kg 이상 1마리당 30,000원',
    ];
    expect(normalizeFeeLines(lines)).toEqual(['19kg 이하 1마리당 2만원', '20kg 이상 1마리당 3만원']);
  });

  it('두 번 불러도 같다 — 분석 시점과 앱이 각각 부른다', () => {
    const once = normalizeFeeLines(['(2만원 추가)', '두 마리부터 한 마리당 2만원의 추가 요금', '마리당 15,000원']);
    expect(normalizeFeeLines(once)).toEqual(once);
  });
});

describe('amountsInWon', () => {
  it('표기가 달라도 같은 금액은 같은 숫자다', () => {
    expect(amountsInWon('2만원 · 20,000원 · 20000원 · 2 만 원')).toEqual([20000, 20000, 20000, 20000]);
  });

  it('15만원 안의 5만원을 잡지 않는다', () => {
    expect(amountsInWon('1박 15만원부터')).toEqual([150000]);
  });
});

describe('정규화한 줄이 원문 대조를 통과한다', () => {
  it('20,000원 → 2만원 으로 바꾼 줄을 앱이 다시 대 봐도 살아남는다', () => {
    const text = '19kg 이하 1마리당 20,000원, 20kg 이상 1마리당 30,000원';
    const feeLines = normalizeFeeLines([text]);
    const { facts } = correctPetPolicyFacts({ indoor: 'unknown', feeFree: false, feeLines }, text);
    expect(facts.feeLines).toEqual(feeLines);
  });

  it('숫자로 대 봐도 지어낸 금액은 여전히 빠진다', () => {
    const { facts } = correctPetPolicyFacts({ indoor: 'unknown', feeFree: false, feeLines: ['청소비 5만원'] }, '1박 15만원부터');
    expect(facts.feeLines).toEqual([]);
  });
});
