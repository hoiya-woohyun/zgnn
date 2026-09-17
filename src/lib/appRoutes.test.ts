import { describe, expect, it } from 'vitest';
import { isRootRoute, parentRouteOf } from './appRoutes';
import { PLACES } from './places';

const cafeId = PLACES.find((place) => place.type === 'cafe')!.id;

describe('isRootRoute — 뒤로가기를 붙일지 가르는 기준', () => {
  it('메인 탭 다섯 곳은 루트다', () => {
    for (const path of ['/', '/map', '/places/stay', '/checklist', '/settings']) {
      expect(isRootRoute(path)).toBe(true);
    }
  });

  it('둘러보기는 종류가 달라도 전부 루트다 — 한 화면 안의 탭 전환이라서', () => {
    expect(isRootRoute('/places/restaurant')).toBe(true);
    expect(isRootRoute('/places/cafe')).toBe(true);
  });

  it('탭 안으로 들어간 화면은 루트가 아니다 — 저장한 곳도 설정 안으로 들어갔다', () => {
    expect(isRootRoute('/dog')).toBe(false);
    expect(isRootRoute('/saved')).toBe(false);
    expect(isRootRoute(`/place/${cafeId}`)).toBe(false);
  });

  it('모르는 경로는 하위 화면으로 친다 — 새 화면에 뒤로가기가 저절로 붙게', () => {
    expect(isRootRoute('/something-new')).toBe(false);
  });

  it('끝의 슬래시는 있으나 없으나 같다 — 정적 내보내기라 /dog/ 로도 들어온다', () => {
    expect(isRootRoute('/checklist/')).toBe(true);
    expect(isRootRoute('/dog/')).toBe(false);
  });
});

describe('parentRouteOf — 되감을 화면이 없을 때 올라갈 곳', () => {
  it('상세는 그 장소의 종류 목록으로 올라간다 — 카페에서 숙소 목록이 나오면 안 된다', () => {
    expect(parentRouteOf(`/place/${cafeId}`)).toBe('/places/cafe');
  });

  it('없는 장소 id 는 둘러보기 첫 탭으로 보낸다', () => {
    expect(parentRouteOf('/place/없는id')).toBe('/places/stay');
  });

  it('저장한 곳·강아지 프로필은 설정으로 올라간다 — 설정 탭 안의 화면이라서', () => {
    expect(parentRouteOf('/saved')).toBe('/settings');
    expect(parentRouteOf('/dog')).toBe('/settings');
    expect(parentRouteOf('/dog/')).toBe('/settings');
  });

  it('그 밖의 하위 화면은 홈으로 올라간다', () => {
    expect(parentRouteOf('/something-new')).toBe('/');
  });
});
