import { describe, expect, it } from 'vitest';
import { DEFAULT_ADMIN_URL_STATE, parseAdminUrl, writeAdminUrl } from './adminUrlState';

describe('parseAdminUrl', () => {
  it('쿼리가 없으면 기본값(검수 대기 · 전부)', () => {
    expect(parseAdminUrl('')).toEqual(DEFAULT_ADMIN_URL_STATE);
    expect(parseAdminUrl('?')).toEqual(DEFAULT_ADMIN_URL_STATE);
  });

  it('탭과 걸러 보기를 읽는다(앞의 ? 는 있어도 없어도)', () => {
    const expected = { tab: 'archived', tier: 'ask', policy: 'needsLook', type: 'cafe', warn: 'noBasis' };
    expect(parseAdminUrl('?tab=archived&tier=ask&policy=needsLook&type=cafe&warn=noBasis')).toEqual(expected);
    expect(parseAdminUrl('tab=archived&tier=ask&policy=needsLook&type=cafe&warn=noBasis')).toEqual(expected);
  });

  it('모르는 값은 기본값으로 읽는다', () => {
    expect(parseAdminUrl('?tab=nope&tier=zzz&type=hotel')).toEqual(DEFAULT_ADMIN_URL_STATE);
  });
});

describe('writeAdminUrl', () => {
  it('기본값은 쿼리에 적지 않는다', () => {
    expect(writeAdminUrl('', DEFAULT_ADMIN_URL_STATE)).toBe('');
    expect(writeAdminUrl('tab=archived&warn=any', DEFAULT_ADMIN_URL_STATE)).toBe('');
  });

  it('바뀐 것만 적고 다른 키는 건드리지 않는다', () => {
    expect(writeAdminUrl('x=1', { ...DEFAULT_ADMIN_URL_STATE, tab: 'blocks', warn: 'any' })).toBe('x=1&tab=blocks&warn=any');
  });

  it('쓴 것을 다시 읽으면 같은 상태다', () => {
    const state = { tab: 'places', tier: 'new', policy: 'has', type: 'stay', warn: 'region' } as const;
    expect(parseAdminUrl(writeAdminUrl('', state))).toEqual(state);
  });
});
