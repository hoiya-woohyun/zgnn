import { describe, expect, it } from 'vitest';
import { normalizePhone, phoneTelHref } from './phone.mjs';

const ok = (raw) => normalizePhone(raw);

describe('normalizePhone', () => {
  it('빈 값은 지우기(null)다', () => {
    expect(ok('')).toEqual({ phone: null });
    expect(ok('   ')).toEqual({ phone: null });
    expect(ok(undefined)).toEqual({ phone: null });
  });

  it('제주 064 — 7자리·8자리 가입자번호', () => {
    expect(ok('0645551234')).toEqual({ phone: '064-555-1234' });
    expect(ok('064 755 1234')).toEqual({ phone: '064-755-1234' });
    expect(ok('(064) 723-4567')).toEqual({ phone: '064-723-4567' });
    expect(ok('064.1234.5678')).toEqual({ phone: '064-1234-5678' });
  });

  it('휴대폰 010 은 11자리만', () => {
    expect(ok('01012345678')).toEqual({ phone: '010-1234-5678' });
    expect(ok('010-1234-567')).toEqual({ error: expect.any(String) });
    expect(ok('011-123-4567')).toEqual({ phone: '011-123-4567' });
  });

  it('0507 안심번호', () => {
    expect(ok('050712345678')).toEqual({ phone: '0507-1234-5678' });
    expect(ok('0507-123-4567')).toEqual({ phone: '0507-123-4567' });
    expect(ok('05071234')).toEqual({ error: expect.any(String) });
  });

  it('서울 02 · 인터넷전화 070 · 대표번호 1588', () => {
    expect(ok('021234567')).toEqual({ phone: '02-123-4567' });
    expect(ok('0212345678')).toEqual({ phone: '02-1234-5678' });
    expect(ok('07012345678')).toEqual({ phone: '070-1234-5678' });
    expect(ok('1588-1234')).toEqual({ phone: '1588-1234' });
    expect(ok('15881234')).toEqual({ phone: '1588-1234' });
  });

  it('+82 국가번호를 국내 표기로 접는다', () => {
    expect(ok('+82-64-123-4567')).toEqual({ phone: '064-123-4567' });
    expect(ok('+82 (0)64 123 4567')).toEqual({ phone: '064-123-4567' });
    expect(ok('+82 10 1234 5678')).toEqual({ phone: '010-1234-5678' });
  });

  it('지역번호 없는 번호·내선·글자가 섞인 값은 받지 않는다', () => {
    expect(ok('723-4567')).toEqual({ error: expect.any(String) });
    expect(ok('064-123-4567 내선 2')).toEqual({ error: expect.any(String) });
    expect(ok('문의')).toEqual({ error: expect.any(String) });
    expect(ok('099-123-4567')).toEqual({ error: expect.any(String) });
  });

  it('이미 정규 표기면 그대로다(멱등)', () => {
    for (const phone of ['064-123-4567', '010-1234-5678', '0507-1234-5678', '1588-1234', '02-123-4567']) {
      expect(ok(phone)).toEqual({ phone });
    }
  });
});

describe('phoneTelHref', () => {
  it('숫자만 건다', () => {
    expect(phoneTelHref('064-123-4567')).toBe('tel:0641234567');
    expect(phoneTelHref(undefined)).toBeUndefined();
    expect(phoneTelHref('')).toBeUndefined();
  });
});
