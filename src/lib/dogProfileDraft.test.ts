import { describe, expect, it } from 'vitest';
import { dogProfileFormDirty, dogProfileFormOf, restorableDogProfileDraft } from './dogProfileDraft';
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
