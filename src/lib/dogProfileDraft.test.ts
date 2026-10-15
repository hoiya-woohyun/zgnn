import { describe, expect, it } from 'vitest';
import {
  dogFormRowEmpty,
  dogProfileFormDirty,
  dogProfileFormOf,
  dogRowFocusAfterRemove,
  restorableDogProfileDraft,
  restoreDogFormRow,
} from './dogProfileDraft';
import type { TDogProfile } from '../types';

const profile: TDogProfile = { dogs: [{ name: '두부', weightKg: 7 }], carrier: 'bag' };

describe('dogProfileFormDirty', () => {
  it('기준 그대로면 손대지 않은 것이다 — 빈 폼도, 채운 폼도', () => {
    expect(dogProfileFormDirty(dogProfileFormOf(null), null)).toBe(false);
    expect(dogProfileFormDirty(dogProfileFormOf(profile), profile)).toBe(false);
  });

  it('이름·몸무게·행 수·이동 수단·크기 하나만 달라도 손댄 것이다', () => {
    const seed = dogProfileFormOf(profile);
    expect(dogProfileFormDirty({ ...seed, rows: [{ name: '두부', weightKg: '8' }] }, profile)).toBe(true);
    expect(dogProfileFormDirty({ ...seed, rows: [...seed.rows, { name: '', weightKg: '' }] }, profile)).toBe(true);
    expect(dogProfileFormDirty({ ...seed, carrier: 'none' }, profile)).toBe(true);
    expect(dogProfileFormDirty({ ...seed, sizeOverride: 'medium' }, profile)).toBe(true);
    expect(dogProfileFormDirty({ ...dogProfileFormOf(null), rows: [{ name: '보리', weightKg: '' }] }, null)).toBe(true);
  });
});

describe('restorableDogProfileDraft', () => {
  const form = { ...dogProfileFormOf(profile), rows: [{ name: '두부', weightKg: '8' }] };

  it('기준 프로필이 그대로면 초안을 돌려준다 — 같은 값이면 다른 객체여도', () => {
    expect(restorableDogProfileDraft({ form, base: profile }, { ...profile, dogs: [{ name: '두부', weightKg: 7 }] })).toBe(form);
  });

  it('그 사이 프로필이 바뀌었으면(지움 등) 되살리지 않는다', () => {
    expect(restorableDogProfileDraft({ form, base: profile }, null)).toBeNull();
    expect(restorableDogProfileDraft(null, profile)).toBeNull();
  });
});

describe('dogFormRowEmpty — 빼도 잃을 게 없는 행', () => {
  it('이름·몸무게 둘 다 비었을 때만(공백만 있어도 빈 것)', () => {
    expect(dogFormRowEmpty({ name: '', weightKg: '' })).toBe(true);
    expect(dogFormRowEmpty({ name: '  ', weightKg: ' ' })).toBe(true);
    expect(dogFormRowEmpty({ name: '두부', weightKg: '' })).toBe(false);
    expect(dogFormRowEmpty({ name: '', weightKg: '7' })).toBe(false);
  });
});

describe('restoreDogFormRow — ✕ 의 되돌리기(14 W261010.7a)', () => {
  const dubu = { name: '두부', weightKg: '7' };
  const bori = { name: '보리', weightKg: '5' };
  const kong = { name: '콩', weightKg: '3' };
  const empty = { name: '', weightKg: '' };

  it('뺀 자리에 그대로 되넣는다 — 가운데·맨 앞', () => {
    expect(restoreDogFormRow([dubu, kong], 1, bori)).toEqual([dubu, bori, kong]);
    expect(restoreDogFormRow([bori, kong], 0, dubu)).toEqual([dubu, bori, kong]);
  });

  it('그 사이 행이 줄었으면 끝에 붙인다', () => {
    expect(restoreDogFormRow([dubu], 2, kong)).toEqual([dubu, kong]);
  });

  it('빼고 나서 빈 행을 더했으면 그 빈 행을 내주고 제자리에 — 상한을 넘기지 않는다', () => {
    expect(restoreDogFormRow([dubu, kong, empty], 1, bori)).toEqual([dubu, bori, kong]);
  });

  it('빈 행도 없이 꽉 찼으면 되넣지 않는다(넘긴 채 저장하면 다음에 프로필이 통째로 비워진다)', () => {
    expect(restoreDogFormRow([dubu, kong, { name: '모카', weightKg: '4' }], 1, bori)).toBeNull();
  });

  it('되넣는 행 자신이 비었어도 다른 빈 행을 내준다', () => {
    expect(restoreDogFormRow([dubu, kong, empty], 0, empty)).toEqual([empty, dubu, kong]);
  });
});

describe('dogRowFocusAfterRemove — ✕ 로 뺀 뒤 포커스(14 W261010.7b)', () => {
  it('뒤에 행이 있었으면 한 칸 올라온 그 행의 이름 칸 — 같은 자리 ✕ 에 남아 Enter 한 번 더에 다음 마리가 빠지지 않게', () => {
    expect(dogRowFocusAfterRemove(1, 3)).toBe(1);
    expect(dogRowFocusAfterRemove(0, 2)).toBe(0);
  });

  it("마지막 행이었으면 '한 마리 더' — 두 마리 → 한 마리로 ✕ 열이 사라질 때도", () => {
    expect(dogRowFocusAfterRemove(2, 3)).toBe('add');
    expect(dogRowFocusAfterRemove(1, 2)).toBe('add');
  });
});
