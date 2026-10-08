import { describe, expect, it } from 'vitest';
import { feeChipForWeight, feeUnitNote, formatDogFee, formatWon } from './dogFee';
import { parsePetPolicy, toPetBadges } from './petPolicy';
import { FEE_EX, SYSTEM_PROMPT } from '../../scripts/analyze/extractPlaces.mjs';
import { judgeEligibility } from './eligibility';
import { PLACES } from './places';
import type { TPetPolicy } from './petPolicy';
import type { TDogProfile, TFeeRule } from '../types';

const AKDONG: TDogProfile = { dogs: [{ name: '악동', weightKg: 4 }], carrier: 'bag' };
const AKDONG_TOFU: TDogProfile = {
  dogs: [
    { name: '악동', weightKg: 4 },
    { name: '두부', weightKg: 8 },
  ],
  carrier: 'bag',
};
const BORI_AND_KONG: TDogProfile = {
  dogs: [
    { name: '보리', weightKg: 28 },
    { name: '콩', weightKg: 17 },
  ],
  carrier: 'none',
};

const findPlace = (name: string) => {
  const place = PLACES.find((p) => p.name === name);
  if (!place) throw new Error(`${name} 을(를) places.json 에서 찾지 못했다`);
  return place;
};

/** 요금 줄만 바꾼 정책. 실제 장소 하나를 바탕으로 feeLines 만 갈아 끼운다. */
const policyWith = (feeLines: string[], extra: Partial<TPetPolicy> = {}): TPetPolicy => ({
  ...findPlace('솔숲펜션').policy,
  feeFree: false,
  feeLines,
  maxDogs: undefined,
  ...extra,
});

describe('formatWon', () => {
  it('만원 단위 소수 1자리, 1만 미만은 원 단위', () => {
    expect(formatWon(15000)).toBe('1.5만원');
    expect(formatWon(60000)).toBe('6만원');
    expect(formatWon(25000)).toBe('2.5만원');
    expect(formatWon(5000)).toBe('5,000원');
  });
});

describe('formatDogFee — 추가 요금 없음 · 요금 줄 없음', () => {
  it('feeFree 면 이름 + 추가 요금 없음', () => {
    expect(formatDogFee(findPlace('백화stay').policy, AKDONG)).toBe('악동이는 추가 요금 없음');
    expect(formatDogFee(findPlace('백화stay').policy, AKDONG_TOFU)).toBe('악동이와 두부는 추가 요금 없음');
  });

  it('요금 문장이 아예 없으면 undefined', () => {
    expect(formatDogFee(findPlace('부부키친').policy, AKDONG)).toBeUndefined();
  });
});

describe('formatDogFee — 마리당 단일 금액은 마릿수만큼 곱한다', () => {
  it('1마리: "악동이는 3만원"', () => {
    expect(formatDogFee(policyWith(['1마리당 3만원']), AKDONG)).toBe('악동이는 3만원');
  });

  it('2마리: 합계 + 마리당 근거', () => {
    expect(formatDogFee(policyWith(['1마리당 3만원']), AKDONG_TOFU)).toBe('악동이와 두부는 6만원 (1마리당 3만원)');
    expect(formatDogFee(policyWith(['1마리당 1.5만원']), AKDONG_TOFU)).toBe('악동이와 두부는 3만원 (1마리당 1.5만원)');
  });

  it('괄호로 싸여 있어도 같은 줄로 읽는다', () => {
    expect(formatDogFee(policyWith(['(1마리당 1만원)']), AKDONG)).toBe('악동이는 1만원');
  });

  it('마릿수 상한을 넘으면 곱하지 않는다 — 그 요금이 우리에게 적용된다고 볼 수 없다', () => {
    expect(formatDogFee(policyWith(['1마리당 3만원'], { maxDogs: 1 }), AKDONG_TOFU)).toBe('적힌 요금 · 1마리당 3만원');
    expect(formatDogFee(policyWith(['1마리당 3만원'], { maxDogs: 2 }), AKDONG_TOFU)).toBe(
      '악동이와 두부는 6만원 (1마리당 3만원)',
    );
  });
});

describe('formatDogFee — 무게 구간은 마리별 몸무게로 각자 찾아 합산한다', () => {
  const place = findPlace('솔숲펜션'); // "1~5kg 1만원. 6~10kg 1.5만원." — 구간 줄뿐

  it('1마리: 금액 + 들어간 구간', () => {
    expect(formatDogFee(place.policy, AKDONG)).toBe('악동이는 1만원 (1~5kg)');
    const choco: TDogProfile = { dogs: [{ name: '초코', weightKg: 6 }], carrier: 'none' };
    expect(formatDogFee(place.policy, choco)).toBe('초코는 1.5만원 (6~10kg)');
  });

  it('2마리가 다른 구간: 합산 + 쓰인 구간을 feeLines 순서로', () => {
    expect(formatDogFee(place.policy, AKDONG_TOFU)).toBe('악동이와 두부는 2.5만원 (1~5kg 1만원 · 6~10kg 1.5만원)');
    const reversed: TDogProfile = { ...AKDONG_TOFU, dogs: [...AKDONG_TOFU.dogs].reverse() };
    expect(formatDogFee(place.policy, reversed)).toBe('두부와 악동이는 2.5만원 (1~5kg 1만원 · 6~10kg 1.5만원)');
  });

  it('2마리가 같은 구간: 구간은 한 번만', () => {
    const two: TDogProfile = {
      dogs: [
        { name: '악동', weightKg: 3 },
        { name: '두부', weightKg: 4 },
      ],
      carrier: 'none',
    };
    expect(formatDogFee(place.policy, two)).toBe('악동이와 두부는 2만원 (1~5kg 1만원)');
  });

  it('한 마리라도 구간 밖이면 곱하지 않고, 구간 아닌 줄도 없으면 비운다', () => {
    expect(formatDogFee(place.policy, BORI_AND_KONG)).toBeUndefined();
  });

  it('구간 밖이어도 구간이 아닌 요금 줄이 있으면 그 줄로 물러난다(곱하지 않는다)', () => {
    const policy = policyWith(['1~5kg 1만원', '청소비 3만원 추가']);
    expect(formatDogFee(policy, BORI_AND_KONG)).toBe('적힌 요금 · 청소비 3만원 추가');
  });

  it('구간 금액이 범위("1~5kg 1-2만원")면 합산하지 않고 그 줄을 그대로', () => {
    expect(formatDogFee(policyWith(['1~5kg 1-2만원']), AKDONG)).toBe('적힌 요금 · 1~5kg 1-2만원');
  });
});

describe('formatDogFee — 다른 줄에 마릿수·무게 조건이 남아 있으면 곱하지 않는다', () => {
  // 캄(Kalm): "1마리당 3만원. (2마리 또는 10kg 이상 4만원)" — 첫 줄만 곱하면 2마리가 6만원(원문은 4만원).
  // 둘째 줄은 곱하는 줄이 아니라 **바꿔 붙는** 줄이다(14 W261006.2) — 조건이 맞으면 그 금액, 아니면 첫 줄.
  const kalm = policyWith(['1마리당 3만원', '(2마리 또는 10kg 이상 4만원)']);
  const one = (weightKg: number): TDogProfile => ({ dogs: [{ name: '두부', weightKg }], carrier: 'none' });

  it('10kg 미만 1마리는 첫 줄', () => {
    expect(formatDogFee(kalm, one(4))).toBe('두부는 3만원 (1마리당 3만원)');
  });

  it.each([12, 10, 30])('%skg 1마리는 둘째 줄', (kg) => {
    expect(formatDogFee(kalm, one(kg))).toBe('두부는 4만원 (2마리 또는 10kg 이상 4만원)');
  });

  it('2마리는 곱하지 않고 두 읽기의 범위 — 둘째 줄이 합계면 4만원, 기본에 더하면 7만원(14 W261007.6)', () => {
    expect(formatDogFee(kalm, AKDONG_TOFU)).toBe('악동이와 두부는 4만~7만원 (1마리당 3만원 · 2마리 또는 10kg 이상 4만원)');
    expect(formatDogFee(kalm, BORI_AND_KONG)).toBe('보리와 콩이는 4만~7만원 (1마리당 3만원 · 2마리 또는 10kg 이상 4만원)');
  });

  it('3마리는 원문이 말하지 않는다 — 줄 전부를 그대로', () => {
    const three: TDogProfile = { dogs: [...AKDONG_TOFU.dogs, { name: '콩', weightKg: 3 }], carrier: 'bag' };
    expect(formatDogFee(kalm, three)).toBe('적힌 요금 · 1마리당 3만원 · 2마리 또는 10kg 이상 4만원');
  });

  it('마릿수 상한을 넘으면 고르지 않는다', () => {
    expect(formatDogFee(policyWith(kalm.feeLines, { maxDogs: 1 }), AKDONG_TOFU)).toBe(
      '적힌 요금 · 1마리당 3만원 · 2마리 또는 10kg 이상 4만원',
    );
  });

  it('places.json 의 캄 : Kalm 도 같은 길을 탄다', () => {
    expect(formatDogFee(findPlace('캄 : Kalm').policy, one(12))).toBe('두부는 4만원 (2마리 또는 10kg 이상 4만원)');
  });

  it('조건이 아닌 줄(청소비)만 더 있으면 곱셈은 그대로 한다', () => {
    expect(formatDogFee(policyWith(['1마리당 3만원', '숙박일 관계없이 청소비 5만원 추가']), AKDONG_TOFU)).toBe(
      '악동이와 두부는 6만원 (1마리당 3만원)',
    );
  });

  it('구간 합산도 마릿수 상한을 넘으면 하지 않는다', () => {
    const policy = policyWith(['1~5kg 1만원', '6~10kg 1.5만원'], { maxDogs: 1 });
    // 최대 몸무게(8kg)가 들어가는 구간 줄 하나로 물러난다 — 예전 `feeForDog` 와 같은 선택.
    expect(formatDogFee(policy, AKDONG_TOFU)).toBe('적힌 요금 · 6~10kg 1.5만원');
  });
});

describe('formatDogFee — 확실하지 않은 줄은 곱하지 않고 "원문 요금 · {줄}"', () => {
  it.each([
    ['1마리당 1-2만원', '적힌 요금 · 1마리당 1-2만원'],
    ['5만원', '적힌 요금 · 5만원'],
    ['(2만원 추가)', '적힌 요금 · 2만원 추가'],
    ['1마리 이상 2만원 추가', '적힌 요금 · 1마리 이상 2만원 추가'],
    ['(2마리 또는 10kg 이상 4만원)', '적힌 요금 · 2마리 또는 10kg 이상 4만원'],
    ['숙박일 관계없이 청소비 5만원 추가', '적힌 요금 · 숙박일 관계없이 청소비 5만원 추가'],
  ])('%s', (line, expected) => {
    expect(formatDogFee(policyWith([line]), AKDONG_TOFU)).toBe(expected);
  });
});

describe('formatDogFee — 곱하지 못한 줄에는 강아지 이름을 붙이지 않는다', () => {
  it('그리너리빌리지 원문 + 28·17kg 두 마리 → "원문 요금" 으로 시작', () => {
    const policy = parsePetPolicy(findPlace('그리너리빌리지 펜션').petPolicyText);
    const dog: TDogProfile = {
      dogs: [
        { name: '대장', weightKg: 28 },
        { name: '초코', weightKg: 17 },
      ],
      carrier: 'none',
    };
    const fee = formatDogFee(policy, dog);
    expect(fee?.startsWith('대장이')).toBe(false);
    expect(fee?.startsWith('적힌 요금')).toBe(true);
  });
});

/** 요금 구조로 계산하는 정책 — `feeLines` 는 label 이다(`withPolicyFacts` 가 만드는 모양). */
const policyWithRules = (rules: TFeeRule[], extra: Partial<TPetPolicy> = {}): TPetPolicy =>
  policyWith(
    rules.map((r) => r.label),
    { feeRules: rules, ...extra },
  );

const BIG: TDogProfile = { dogs: [{ name: '보리', weightKg: 25 }], carrier: 'none' };

/**
 * **프롬프트 예시 계약.** 추출 프롬프트가 `fees` 의 예로 드는 구조(`FEE_EX`)가 앱의 계산(`sumByRules`)에서 뜻대로
 * 읽히는지 확인한다(ADR-017 v5). 특히 "칸으로 표현 못 하면 `amountWon: null`" — 이것이 무너지면 앱이 틀린 금액을
 * **확정 문장**으로 낸다(캄 "2마리 또는 10kg 이상 4만원" 을 2마리 6만원으로).
 */
describe('프롬프트 예시 계약 — FEE_EX 가 앱에서 읽히는가', () => {
  it('예시가 프롬프트 본문에 그대로 실려 있다', () => {
    for (const example of Object.values(FEE_EX)) expect(SYSTEM_PROMPT).toContain(JSON.stringify(example));
  });

  it('마리당 금액은 마릿수만큼 곱해진다', () => {
    expect(formatDogFee(policyWithRules([FEE_EX.perDog]), AKDONG)).toBe('악동이는 3만원');
    expect(formatDogFee(policyWithRules([FEE_EX.perDog]), AKDONG_TOFU)).toBe('악동이와 두부는 6만원 (1마리당 3만원)');
  });

  /** 다와풀빌라 — 줄 모양을 정규식으로 읽던 동안은 "원문 요금 · …" 으로 물러났다. */
  it('무게 이하/이상 두 줄은 마리별로 골라 합산된다', () => {
    const policy = policyWithRules([FEE_EX.upToKg, FEE_EX.fromKg]);
    expect(formatDogFee(policy, AKDONG)).toBe('악동이는 2만원 (19kg 이하 1마리당 2만원)');
    expect(formatDogFee(policy, BIG)).toBe('보리는 3만원 (20kg 이상 1마리당 3만원)');
    expect(formatDogFee(policy, BORI_AND_KONG)).toBe('보리와 콩이는 5만원 (19kg 이하 1마리당 2만원 · 20kg 이상 1마리당 3만원)');
  });

  it('두 경계 사이에 끼는 몸무게는 계산하지 않는다 — 원문이 말하지 않은 칸이다', () => {
    const policy = policyWithRules([FEE_EX.upToKg, FEE_EX.fromKg]);
    const between: TDogProfile = { dogs: [{ name: '보리', weightKg: 19.5 }], carrier: 'none' };
    expect(formatDogFee(policy, between)).toBe('적힌 요금 · 19kg 이하 1마리당 2만원 · 20kg 이상 1마리당 3만원');
  });

  /** 애단비 — "한 마리까지 추가금 없고, 두 마리부터 한 마리당 2만원". */
  it('N번째 마리부터 붙는 요금은 앞 순번을 0원으로 센다', () => {
    const policy = policyWithRules([FEE_EX.fromSecond]);
    expect(formatDogFee(policy, AKDONG)).toBe('악동이는 추가 요금 없음 (2마리부터 1마리당 2만원)');
    expect(formatDogFee(policy, AKDONG_TOFU)).toBe('악동이와 두부는 2만원 (2마리부터 1마리당 2만원)');
  });

  /** 휘닉스 아일랜드·소노벨 — "기본 1마리, 추가 1마리 N원". 한 마리만 데려가면 붙지 않는다(docs/todo/13 §5.1). */
  it('추가 1마리 요금은 기본 마릿수를 넘는 마리에만 붙는다', () => {
    const policy = policyWithRules([FEE_EX.extraDog]);
    expect(formatDogFee(policy, AKDONG)).toBe('악동이는 추가 요금 없음 (추가 1마리 5만원)');
    expect(formatDogFee(policy, AKDONG_TOFU)).toBe('악동이와 두부는 5만원 (추가 1마리 5만원)');
  });

  // 구조(feeRules)가 없는 옛 후보·시드 길 — `추가 1마리 5만원` 줄을 "1마리 5만원" 으로 곱해 확정 문장을 내면 안 된다.
  it('feeRules 없이 feeLines 만 있는 `추가 1마리 5만원` 은 확정 문장 없이 원문 요금으로 물러난다', () => {
    const policy = policyWith(['추가 1마리 5만원']);
    expect(formatDogFee(policy, AKDONG)).toBe('적힌 요금 · 추가 1마리 5만원');
    expect(formatDogFee(policy, AKDONG_TOFU)).toBe('적힌 요금 · 추가 1마리 5만원');
  });

  it('여러 줄이 맞으면 가장 늦게 시작하는 줄이 그 마리의 요금이다', () => {
    const first = { ...FEE_EX.perDog, label: '1마리당 3만원' };
    expect(formatDogFee(policyWithRules([first, FEE_EX.fromSecond]), AKDONG_TOFU)).toBe(
      '악동이와 두부는 5만원 (1마리당 3만원 · 2마리부터 1마리당 2만원)',
    );
  });

  /** "몇째" 는 프로필 행 순서라 몸무게 조건과 섞이면 [25kg, 5kg] 와 [5kg, 25kg] 의 합계가 달라진다. */
  it('몇째 마리 조건과 몸무게 조건이 섞이면 계산하지 않는다', () => {
    const policy = policyWithRules([FEE_EX.fromKg, FEE_EX.fromSecond]);
    expect(formatDogFee(policy, BORI_AND_KONG)?.startsWith('적힌 요금')).toBe(true);
  });

  it('청소비는 마릿수와 무관하게 한 번 더한다', () => {
    expect(formatDogFee(policyWithRules([FEE_EX.perDog, FEE_EX.cleaning]), AKDONG_TOFU)).toBe(
      '악동이와 두부는 11만원 (1마리당 3만원 · 청소비 5만원)',
    );
  });

  it('1박마다 붙는 요금은 1박 기준으로 말하고, 한 번 붙는 요금과는 합치지 않는다', () => {
    expect(formatDogFee(policyWithRules([FEE_EX.perNight]), AKDONG_TOFU)).toBe('악동이와 두부는 1박 4만원 (1박당 2만원)');
    expect(formatDogFee(policyWithRules([FEE_EX.perNight, FEE_EX.cleaning]), AKDONG)).toBe('적힌 요금 · 1박당 2만원 · 청소비 5만원');
  });

  /** 칸으로 표현 못 한 줄(금액 범위)은 계산 전체를 멈춘다. */
  it('칸으로 표현 못 한 줄(범위 금액)이 있으면 계산하지 않는다', () => {
    const policy = policyWithRules([FEE_EX.perDog, FEE_EX.amountRange]);
    expect(formatDogFee(policy, AKDONG_TOFU)).toBe(`적힌 요금 · ${FEE_EX.perDog.label} · ${FEE_EX.amountRange.label}`);
  });

  /** 캄(Kalm) — 구조는 "또는" 줄을 칸으로 못 담지만(`amountWon: null`), 줄 모양으로 바꿔 붙는 요금을 고른다(14 W261006.2). */
  it('조건부 줄(2마리 또는 10kg 이상)은 구조가 못 담아도 줄 모양으로 고른다 — 2마리는 6만원이 아니라 4만~7만원', () => {
    const policy = policyWithRules([FEE_EX.perDog, FEE_EX.conditional]);
    expect(formatDogFee(policy, AKDONG_TOFU)).toBe(`악동이와 두부는 4만~7만원 (${FEE_EX.perDog.label} · ${FEE_EX.conditional.label})`);
  });

  it('마릿수 상한을 넘으면 계산하지 않는다', () => {
    expect(formatDogFee(policyWithRules([FEE_EX.perDog], { maxDogs: 1 }), AKDONG_TOFU)?.startsWith('적힌 요금')).toBe(true);
  });

  /** 조건부 줄의 `10kg 이상` 은 판정이 대형견 보호자에게 알리는 근거다(`eligibility.ts` 의 `FEE_MIN_KG_RE`). */
  it('조건부 줄에 kg 절이 남아 있어 판정이 그것을 읽는다', () => {
    const reasons = judgeEligibility(BORI_AND_KONG, policyWithRules([FEE_EX.conditional])).reasons;
    expect(reasons.some((reason) => reason.text.includes('10kg 이상 요금'))).toBe(true);
  });
});

describe('feeChipForWeight — 카드의 요금 칩 하나를 우리 강아지 구간으로(07 U5)', () => {
  const tiers = ['1~5kg 1만원', '6~10kg 1.5만원'];

  it('몸무게가 들어가는 구간 줄을 고른다 — 첫 줄이 아니라', () => {
    expect(feeChipForWeight(tiers, 3)).toBe('1~5kg 1만원');
    expect(feeChipForWeight(tiers, 7)).toBe('6~10kg 1.5만원');
  });

  it('어느 구간에도 안 들면 금액을 고르지 않고 표의 끝만 말한다 — 20kg 에게 "1~5kg 1만원" 을 세우지 않는다', () => {
    expect(feeChipForWeight(tiers, 20)).toBe('10kg 까지 요금표');
    // 구간 사이(5.5kg)도 고르지 않는다 — formatDogFee 도 이때 금액을 확정하지 않는다
    expect(feeChipForWeight(tiers, 5.5)).toBe('10kg 까지 요금표');
  });

  it('몸무게 조건이 없는 기본 줄이 있으면 구간 밖일 때 그 줄 — 캄', () => {
    const kalm = ['1마리당 3만원', '2마리 또는 10kg 이상 4만원'];
    expect(feeChipForWeight(kalm, 5)).toBe('1마리당 3만원');
    expect(feeChipForWeight(kalm, 15)).toBe('2마리 또는 10kg 이상 4만원');
  });

  it('마릿수 조건도 본다 — 캄에 5kg 두 마리면 칩도 요금 한 줄도 4만원 줄(07 U5 후속)', () => {
    // places.json 의 실제 배지 라벨로 — 정규화한 라벨 모양이 바뀌어도 여기서 드러난다
    const policy = findPlace('캄 : Kalm').policy;
    const labels = toPetBadges(policy).filter((b) => b.axis === 'fee').map((b) => b.label);
    const twoSmall: TDogProfile = {
      dogs: [
        { name: '악동', weightKg: 5 },
        { name: '두부', weightKg: 5 },
      ],
      carrier: 'bag',
    };
    expect(feeChipForWeight(labels, 5, 1)).toBe('1마리당 3만원');
    expect(feeChipForWeight(labels, 5, 2)).toBe('2마리 또는 10kg 이상 4만원');
    expect(formatDogFee(policy, twoSmall)).toBe('악동이와 두부는 4만~7만원 (1마리당 3만원 · 2마리 또는 10kg 이상 4만원)');
    // 마릿수 조건만 있는 줄은 조건 아래면 기본 줄로 — "2마리 이상" 이 한 마리에게 서지 않는다
    expect(feeChipForWeight(['2마리 이상 5만원', '1마리당 2만원'], 5, 1)).toBe('1마리당 2만원');
    expect(feeChipForWeight(['2마리 이상 5만원', '1마리당 2만원'], 5, 2)).toBe('2마리 이상 5만원');
  });

  it('하한 줄만 있고 그 아래면 칩을 뺀다 — 원문이 말하지 않는 몸무게', () => {
    expect(feeChipForWeight(['10kg 이상 2만원'], 5)).toBeNull();
    expect(feeChipForWeight(['10kg 이하 1만원'], 15)).toBe('10kg 까지 요금표');
  });

  it('몸무게로 갈리지 않는 줄은 첫 줄 그대로', () => {
    expect(feeChipForWeight(['1마리당 2만원', '청소비 5만원'], 30)).toBe('1마리당 2만원');
    expect(feeChipForWeight([], 5)).toBeNull();
  });
});

describe('feeUnitNote — 1박마다인지 원문이 말하지 않으면 상세가 한 줄 붙인다(08 T5.1)', () => {
  const NOTE = '1박 기준인지는 원문에 없어요';
  const seed = (name: string) => {
    const place = PLACES.find((p) => p.name === name);
    if (!place) throw new Error(`시드에 없다: ${name}`);
    return place;
  };
  const noteFor = (name: string, dog: TDogProfile = AKDONG) => {
    const place = seed(name);
    return feeUnitNote(place.type, place.petPolicyText, place.policy, formatDogFee(place.policy, dog));
  };

  it('"1마리당 3만원" 은 단위가 없다 — 붙인다', () => {
    expect(noteFor('호텔 핀코')).toBe(NOTE);
  });

  it('"숙박일 관계없이 청소비" 는 한 번이라는 말이다 — 붙이지 않는다', () => {
    expect(noteFor('그리너리빌리지 펜션')).toBeNull();
  });

  it('구조가 1박마다라고 했으면 한 줄이 이미 "1박 …" 이다 — 붙이지 않는다', () => {
    const policy = parsePetPolicy('1마리당 2만원.');
    const rule: TFeeRule = { label: '1마리당 2만원', basis: 'perDog', amountWon: 20000, minKg: null, maxKg: null, fromDog: null, perNight: true };
    expect(feeUnitNote('stay', '1마리당 2만원.', { ...policy, feeRules: [rule] }, '악동은 1박 2만원')).toBeNull();
  });

  it('요금 줄이 없거나 추가 요금 없음 · 숙소가 아니면 붙이지 않는다', () => {
    const policy = parsePetPolicy('1마리당 2만원.');
    expect(feeUnitNote('stay', '1마리당 2만원.', policy, undefined)).toBeNull();
    expect(feeUnitNote('stay', '추가 요금 없음.', policy, '악동은 추가 요금 없음')).toBeNull();
    expect(feeUnitNote('restaurant', '1마리당 2만원.', policy, '악동은 2만원')).toBeNull();
  });

  it('"1박당" · "1회" 를 말하는 원문은 붙이지 않는다', () => {
    const policy = parsePetPolicy('1마리당 2만원.');
    expect(feeUnitNote('stay', '1박당 1마리 2만원.', policy, '악동은 2만원')).toBeNull();
    expect(feeUnitNote('stay', '1회 청소비 3만원.', policy, '적힌 요금 · 청소비 3만원')).toBeNull();
  });
});

/** 14 W261007.6 — 요금 한 줄이 받아 주는지보다 앞서지 않게, 따로 적힌 `(마리당)` 도 읽게. */
describe('요금 한 줄 — 받아 주는지·마리당 주석(14 W261007.6)', () => {
  const BORI: TDogProfile = { dogs: [{ name: '보리', weightKg: 30 }], carrier: 'none' };

  it('달중이네 쉬멍 — 다음 문장의 "(마리당)" 을 붙여 합계를 낸다', () => {
    const p = parsePetPolicy('최대 3마리까지 가능. (15kg까지)\n1마리 이상 2만원 추가. (마리당)');
    expect(p.feeLines).toEqual(['1마리 이상 2만원 추가 (마리당)']);
    expect(formatDogFee(p, AKDONG)).toBe('악동이는 2만원');
    expect(formatDogFee(p, AKDONG_TOFU)).toBe('악동이와 두부는 4만원 (1마리당 2만원)');
  });

  it('"(마리당)" 이 없으면 정액인지 몰라 곱하지 않는다', () => {
    expect(formatDogFee(parsePetPolicy('1마리 이상 2만원 추가.'), AKDONG_TOFU)).toBe('적힌 요금 · 1마리 이상 2만원 추가');
  });

  it('돌담연가 — 대형견 언급이 없어 받아 주는지 확인해야 하면 "받아 준다면"', () => {
    const p = parsePetPolicy('1마리당 5만원.');
    expect(judgeEligibility(BORI, p).fee).toBe('받아 준다면 보리는 5만원');
    expect(judgeEligibility(AKDONG, p).fee).toBe('악동이는 5만원');
  });

  it('야외 자리·전화 먼저 같은 확인은 받아 주는 곳이라 붙이지 않는다', () => {
    const p = parsePetPolicy('야외석만 가능. 1마리당 1만원.');
    expect(judgeEligibility(AKDONG, p).fee).toBe('악동이는 1만원');
  });
});
