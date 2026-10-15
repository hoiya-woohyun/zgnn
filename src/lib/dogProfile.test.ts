import { describe, expect, it } from 'vitest';
import {
  HEAVY_DOG_CONFIRM_KG,
  dogProfileActionNote,
  dogProfileSavedMessage,
  dogRowRemovedMessage,
  dogWeightSummary,
  heavyDogs,
  radioIndexAfterKey,
  sanitizeDog,
} from './dogProfile';

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
  it("이름은 적은 그대로 — 받침 있는 '단풍' 에 '이' 를 붙이지 않는다(14 W261010.33h)", () => {
    expect(dogProfileSavedMessage([{ name: '보리', weightKg: 5 }])).toBe('보리 기준으로 바꿨어요');
    expect(dogProfileSavedMessage([{ name: '단풍', weightKg: 5 }])).toBe('단풍 기준으로 바꿨어요');
  });

  it('여러 마리는 한 덩어리로', () => {
    expect(
      dogProfileSavedMessage([
        { name: '보리', weightKg: 5 },
        { name: '두부', weightKg: 4 },
      ]),
    ).toBe('보리와 두부 기준으로 바꿨어요');
    expect(
      dogProfileSavedMessage([
        { name: '보리', weightKg: 12 },
        { name: '단풍', weightKg: 5 },
        { name: '깜지', weightKg: 4 },
      ]),
    ).toBe('보리, 단풍, 깜지 기준으로 바꿨어요');
  });

  it('갈 수 있는 곳 수가 바뀌면 전 → 후, 같으면 그대로, 처음 등록이면 지금 수만(14 W261010.33a)', () => {
    const bori = [{ name: '보리', weightKg: 25 }];
    expect(dogProfileSavedMessage(bori, { before: 10, after: 6 })).toBe('보리 기준으로 바꿨어요 · 갈 수 있는 곳 10 → 6곳');
    expect(dogProfileSavedMessage(bori, { before: 44, after: 44 })).toBe('보리 기준으로 바꿨어요 · 갈 수 있는 곳은 그대로 44곳');
    expect(dogProfileSavedMessage(bori, { before: null, after: 38 })).toBe('보리 기준으로 바꿨어요 · 갈 수 있는 곳 38곳');
  });
});

describe('dogRowRemovedMessage — ✕ 로 한 마리를 뺐을 때(14 W261010.7a)', () => {
  it('이름이 있으면 이름에 받침 맞춰 조사를 붙인다', () => {
    expect(dogRowRemovedMessage('두부', 0)).toBe('두부를 뺐어요');
    expect(dogRowRemovedMessage('콩', 1)).toBe('콩을 뺐어요');
    expect(dogRowRemovedMessage('Coco', 1)).toBe('Coco를 뺐어요');
  });

  it('앞뒤 공백은 떼고, 이름이 비었으면 몇 번째인지로 부른다', () => {
    expect(dogRowRemovedMessage('  보리 ', 0)).toBe('보리를 뺐어요');
    expect(dogRowRemovedMessage('   ', 1)).toBe('2번째 강아지를 뺐어요');
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

describe('dogProfileActionNote — 주 버튼 줄의 한 줄(14 W261013.5)', () => {
  const base = { rowsFailed: false, carrierFailed: false, carrierChosen: false, carrierCount: 4 };

  it('누르기 전엔 이동 수단을 안 골랐을 때만, 몇 가지인지 말한다 — 오류가 아니다', () => {
    expect(dogProfileActionNote(base)).toEqual({ text: '이동 수단 4가지 중 하나를 골라야 등록돼요', failed: false });
    expect(dogProfileActionNote({ ...base, carrierChosen: true })).toBeNull();
  });

  it('막혔으면 빠진 것을 모두 — 고친 것은 빠진다', () => {
    expect(dogProfileActionNote({ ...base, rowsFailed: true, carrierFailed: true })).toEqual({
      text: '이름·몸무게를 확인하고 이동 수단을 골라 주세요',
      failed: true,
    });
    expect(dogProfileActionNote({ ...base, rowsFailed: true, carrierChosen: true })).toEqual({
      text: '이름과 몸무게를 확인해 주세요',
      failed: true,
    });
    expect(dogProfileActionNote({ ...base, carrierFailed: true })).toEqual({ text: '이동 수단을 골라 주세요', failed: true });
  });
});
