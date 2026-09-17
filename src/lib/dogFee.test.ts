import { describe, expect, it } from 'vitest';
import { formatDogFee, formatWon } from './dogFee';
import { PLACES } from './places';
import type { TPetPolicy } from './petPolicy';
import type { TDogProfile } from '../types';

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
    expect(formatDogFee(policyWith(['1마리당 3만원'], { maxDogs: 1 }), AKDONG_TOFU)).toBe('악동이와 두부 · 1마리당 3만원');
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
    expect(formatDogFee(policy, BORI_AND_KONG)).toBe('보리와 콩이 · 청소비 3만원 추가');
  });

  it('구간 금액이 범위("1~5kg 1-2만원")면 합산하지 않고 그 줄을 그대로', () => {
    expect(formatDogFee(policyWith(['1~5kg 1-2만원']), AKDONG)).toBe('악동이 · 1~5kg 1-2만원');
  });
});

describe('formatDogFee — 다른 줄에 마릿수·무게 조건이 남아 있으면 곱하지 않는다', () => {
  // 캄(Kalm): "1마리당 3만원. (2마리 또는 10kg 이상 4만원)" — 첫 줄만 곱하면 2마리가 6만원(원문은 4만원).
  const kalm = policyWith(['1마리당 3만원', '(2마리 또는 10kg 이상 4만원)']);

  it('1마리도 곱하지 않는다 — 12kg 이면 첫 줄이 아니라 둘째 줄이 적용된다', () => {
    const heavy: TDogProfile = { dogs: [{ name: '두부', weightKg: 12 }], carrier: 'none' };
    expect(formatDogFee(kalm, heavy)).toBe('두부 · 1마리당 3만원 · 2마리 또는 10kg 이상 4만원');
  });

  it('2마리: 줄 전부를 그대로 보여준다(한 줄만 보여주면 반쪽 정보)', () => {
    expect(formatDogFee(kalm, AKDONG_TOFU)).toBe('악동이와 두부 · 1마리당 3만원 · 2마리 또는 10kg 이상 4만원');
  });

  it('조건이 아닌 줄(청소비)만 더 있으면 곱셈은 그대로 한다', () => {
    expect(formatDogFee(policyWith(['1마리당 3만원', '숙박일 관계없이 청소비 5만원 추가']), AKDONG_TOFU)).toBe(
      '악동이와 두부는 6만원 (1마리당 3만원)',
    );
  });

  it('구간 합산도 마릿수 상한을 넘으면 하지 않는다', () => {
    const policy = policyWith(['1~5kg 1만원', '6~10kg 1.5만원'], { maxDogs: 1 });
    // 최대 몸무게(8kg)가 들어가는 구간 줄 하나로 물러난다 — 예전 `feeForDog` 와 같은 선택.
    expect(formatDogFee(policy, AKDONG_TOFU)).toBe('악동이와 두부 · 6~10kg 1.5만원');
  });
});

describe('formatDogFee — 확실하지 않은 줄은 곱하지 않고 "{이름들} · {줄}"', () => {
  it.each([
    ['1마리당 1-2만원', '악동이와 두부 · 1마리당 1-2만원'],
    ['5만원', '악동이와 두부 · 5만원'],
    ['(2만원 추가)', '악동이와 두부 · 2만원 추가'],
    ['1마리 이상 2만원 추가', '악동이와 두부 · 1마리 이상 2만원 추가'],
    ['(2마리 또는 10kg 이상 4만원)', '악동이와 두부 · 2마리 또는 10kg 이상 4만원'],
    ['숙박일 관계없이 청소비 5만원 추가', '악동이와 두부 · 숙박일 관계없이 청소비 5만원 추가'],
  ])('%s', (line, expected) => {
    expect(formatDogFee(policyWith([line]), AKDONG_TOFU)).toBe(expected);
  });
});
