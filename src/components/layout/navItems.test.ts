import { describe, expect, it } from 'vitest';
import { isNavActive, NAV_ITEMS } from './navItems';
import { ownerRootOf } from '../../lib/appRoutes';

const browse = NAV_ITEMS.find((item) => item.label === '둘러보기')!;

describe('둘러보기 탭의 불', () => {
  it('종류 목록에서 켜진다', () => {
    expect(browse.isActive('/places/stay')).toBe(true);
  });

  it('/places 로 시작하기만 하는 404 주소에서는 켜지지 않는다', () => {
    expect(browse.isActive('/placesX')).toBe(false);
    expect(browse.isActive('/placement')).toBe(false);
  });
});

describe('하위 화면의 탭 불은 들어온 탭을 따른다', () => {
  const lit = (pathname: string, previous: string | null, stamped?: string) =>
    NAV_ITEMS.filter((item) => isNavActive(item, ownerRootOf({ pathname, stamped, previous }))).map(
      (item) => item.label,
    );

  it('강아지 프로필 — 홈 카드에서 오면 홈, 설정에서 오면 설정, 상세(둘러보기 밑)에서 오면 둘러보기 (14 W261006.10)', () => {
    expect(lit('/dog/', '/')).toEqual(['홈']);
    expect(lit('/dog', '/settings')).toEqual(['설정']);
    expect(lit('/dog', '/places/cafe')).toEqual(['둘러보기']);
  });

  it('저장한 곳 — 홈 카드에서 오면 홈, 설정에서 오면 설정, 지도에서 오면 지도', () => {
    expect(lit('/saved', '/')).toEqual(['홈']);
    expect(lit('/saved', '/settings')).toEqual(['설정']);
    expect(lit('/saved', '/map')).toEqual(['지도']);
  });

  it('딥링크로 바로 들어오면 정해 둔 부모의 탭 — 저장한 곳·강아지는 설정', () => {
    expect(lit('/saved', null)).toEqual(['설정']);
    expect(lit('/dog', null)).toEqual(['설정']);
  });

  it('탭 화면은 자기 탭이다', () => {
    expect(lit('/settings', '/')).toEqual(['설정']);
    expect(lit('/map/', '/settings', '/')).toEqual(['지도']);
  });
});
