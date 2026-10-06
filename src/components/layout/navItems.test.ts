import { describe, expect, it } from 'vitest';
import { isNavActive, NAV_ITEMS, navHighlightPath } from './navItems';

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

describe('/dog 의 탭 불은 들어온 탭을 따른다 (14 W261006.10)', () => {
  const lit = (pathname: string, origin: string | null) =>
    NAV_ITEMS.filter((item) => isNavActive(item, navHighlightPath(pathname, origin))).map((item) => item.label);

  it('홈 카드에서 들어오면 홈', () => {
    expect(lit('/dog', '/')).toEqual(['홈']);
    expect(lit('/dog/', '/')).toEqual(['홈']);
  });

  it('설정에서 들어오면 설정, 상세에서 들어오면 둘러보기', () => {
    expect(lit('/dog', '/settings')).toEqual(['설정']);
    expect(lit('/dog', '/place/abc')).toEqual(['둘러보기']);
  });

  it('딥링크로 바로 들어오면 어느 탭도 켜지 않는다', () => {
    expect(lit('/dog', null)).toEqual([]);
  });

  it('다른 화면은 직전 주소와 무관하게 지금 주소를 본다', () => {
    expect(lit('/settings', '/')).toEqual(['설정']);
    expect(lit('/saved', null)).toEqual(['홈']);
  });
});
