import { describe, expect, it } from 'vitest';
import { HEAVY_DOG_CONFIRM_KG, dogProfileSavedMessage, dogWeightSummary, heavyDogs, radioIndexAfterKey, sanitizeDog } from './dogProfile';

describe('dogWeightSummary', () => {
  it('한 마리면 몸무게만 — "1마리 · 최대" 를 쓰지 않는다', () => {
    expect(dogWeightSummary({ dogs: [{ name: '두부', weightKg: 5 }], carrier: 'none' })).toBe('5kg');
  });

  it('두 마리부터 마릿수와 가장 무거운 아이', () => {
    const dog = { dogs: [{ name: '콩', weightKg: 4 }, { name: '해피', weightKg: 12 }], carrier: 'none' as const };
    expect(dogWeightSummary(dog)).toBe('2마리 · 최대 12kg');
  });
});

describe('sanitizeDog — 새 모양', () => {
  it('스펙에 맞는 값은 그대로(이름은 trim)', () => {
    const dog = sanitizeDog({ dogs: [{ name: ' 두부 ', weightKg: 4 }], carrier: 'bag', sizeOverride: 'small' });
    expect(dog).toEqual({ dogs: [{ name: '두부', weightKg: 4 }], carrier: 'bag', sizeOverride: 'small' });
  });

  it('sizeOverride 가 enum 밖이면 버리고 나머지는 살린다', () => {
    const dog = sanitizeDog({ dogs: [{ name: '두부', weightKg: 4 }], carrier: 'none', sizeOverride: 'huge' });
    expect(dog?.sizeOverride).toBeUndefined();
    expect(dog?.dogs).toHaveLength(1);
  });

  it.each([
    ['dogs 가 비었음', { dogs: [], carrier: 'none' }],
    ['4마리', { dogs: Array.from({ length: 4 }, (_, i) => ({ name: `d${i}`, weightKg: 1 })), carrier: 'none' }],
    ['이름이 빈 문자열', { dogs: [{ name: '  ', weightKg: 4 }], carrier: 'none' }],
    ['몸무게 0', { dogs: [{ name: '두부', weightKg: 0 }], carrier: 'none' }],
    ['몸무게가 문자열', { dogs: [{ name: '두부', weightKg: '4' }], carrier: 'none' }],
    ['carrier 가 enum 밖', { dogs: [{ name: '두부', weightKg: 4 }], carrier: 'car' }],
    ['객체가 아님', 'dog'],
    ['null', null],
  ])('어긋난 값은 통째로 null — %s', (_label, value) => {
    expect(sanitizeDog(value)).toBeNull();
  });
});

describe('sanitizeDog — 옛 모양 { name, weightsKg } 올려 변환', () => {
  it('한 마리는 손실 없이 그대로 옮긴다', () => {
    expect(sanitizeDog({ name: '두부', weightsKg: [4], carrier: 'bag' })).toEqual({
      dogs: [{ name: '두부', weightKg: 4 }],
      carrier: 'bag',
      sizeOverride: undefined,
    });
  });

  it('여러 마리는 첫 마리에 이름, 나머지는 둘째·셋째', () => {
    expect(sanitizeDog({ name: '보리', weightsKg: [8, 4], carrier: 'none' })?.dogs).toEqual([
      { name: '보리', weightKg: 8 },
      { name: '둘째', weightKg: 4 },
    ]);
    expect(sanitizeDog({ name: '보리', weightsKg: [8, 4, 3], carrier: 'none' })?.dogs.map((d) => d.name)).toEqual([
      '보리',
      '둘째',
      '셋째',
    ]);
  });

  it('sizeOverride 는 함께 넘어온다', () => {
    expect(sanitizeDog({ name: '보리', weightsKg: [28], carrier: 'none', sizeOverride: 'medium' })?.sizeOverride).toBe(
      'medium',
    );
  });

  it('멱등 — 변환 결과를 다시 넣어도 둘째가 또 붙지 않는다', () => {
    const once = sanitizeDog({ name: '보리', weightsKg: [8, 4], carrier: 'none' });
    expect(sanitizeDog(once)).toEqual(once);
  });

  it('옛 모양이어도 어긋나면 null(빈 이름 · 0 이하 · 4마리)', () => {
    expect(sanitizeDog({ name: '', weightsKg: [4], carrier: 'none' })).toBeNull();
    expect(sanitizeDog({ name: '두부', weightsKg: [0], carrier: 'none' })).toBeNull();
    expect(sanitizeDog({ name: '두부', weightsKg: [1, 1, 1, 1], carrier: 'none' })).toBeNull();
    expect(sanitizeDog({ name: '두부', weightsKg: [], carrier: 'none' })).toBeNull();
  });
});

describe('dogProfileSavedMessage — 저장 뒤 돌아온 화면의 한 줄', () => {
  it('한 마리는 애칭으로', () => {
    expect(dogProfileSavedMessage([{ name: '보리', weightKg: 5 }])).toBe('보리 기준으로 바꿨어요');
    expect(dogProfileSavedMessage([{ name: '우현', weightKg: 5 }])).toBe('우현이 기준으로 바꿨어요');
  });

  it('여러 마리는 함께 부른다', () => {
    expect(
      dogProfileSavedMessage([
        { name: '보리', weightKg: 5 },
        { name: '두부', weightKg: 4 },
      ]),
    ).toBe('보리와 두부 기준으로 바꿨어요');
  });
});

describe('heavyDogs — 저장 전에 한 번 묻는 몸무게', () => {
  it('"7.0" 을 "70" 으로 친 값은 묻는다 · 큰 중형견(45kg)은 묻지 않는다', () => {
    expect(heavyDogs([{ name: '두부', weightKg: 70 }])).toEqual([{ name: '두부', weightKg: 70 }]);
    expect(heavyDogs([{ name: '보리', weightKg: 45 }])).toEqual([]);
  });

  it('경계값은 묻지 않고, 넘으면 그 강아지만 돌려준다', () => {
    const dogs = [
      { name: '보리', weightKg: HEAVY_DOG_CONFIRM_KG },
      { name: '콩', weightKg: 700 },
    ];
    expect(heavyDogs(dogs)).toEqual([{ name: '콩', weightKg: 700 }]);
  });
});

describe('radioIndexAfterKey — 라디오 화살표 이동', () => {
  it('아래·오른쪽은 다음, 위·왼쪽은 이전 — 끝에서 처음으로 이어진다', () => {
    expect(radioIndexAfterKey('ArrowDown', 0, 4)).toBe(1);
    expect(radioIndexAfterKey('ArrowRight', 3, 4)).toBe(0);
    expect(radioIndexAfterKey('ArrowUp', 0, 4)).toBe(3);
    expect(radioIndexAfterKey('ArrowLeft', 2, 4)).toBe(1);
  });

  it('다른 키는 건드리지 않는다', () => {
    expect(radioIndexAfterKey('Tab', 1, 4)).toBeNull();
    expect(radioIndexAfterKey('Enter', 1, 4)).toBeNull();
  });
});
