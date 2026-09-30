import { describe, expect, it } from 'vitest';
import { NAV_ITEMS } from './navItems';

const browse = NAV_ITEMS.find((item) => item.label === '둘러보기')!;

describe('둘러보기 탭의 불', () => {
  it('종류 목록과 상세에서 켜진다', () => {
    expect(browse.isActive('/places/stay')).toBe(true);
    expect(browse.isActive('/place/abc')).toBe(true);
  });

  it('/places 로 시작하기만 하는 404 주소에서는 켜지지 않는다', () => {
    expect(browse.isActive('/placesX')).toBe(false);
    expect(browse.isActive('/placement')).toBe(false);
  });
});
