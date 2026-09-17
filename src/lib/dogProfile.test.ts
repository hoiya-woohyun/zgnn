import { describe, expect, it } from 'vitest';
import { sanitizeDog } from './dogProfile';

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
