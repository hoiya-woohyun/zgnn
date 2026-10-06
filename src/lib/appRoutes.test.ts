import { describe, expect, it } from 'vitest';
import {
  SWIPE_ROUTES,
  canStartSwipeAt,
  hasSwipeSurface,
  isRootRoute,
  isWithinPlacesSwipe,
  parentRouteOf,
  swipeIndexOf,
  takesHorizontalPan,
} from './appRoutes';
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
    expect(parentRouteOf('/saved')).toBe('/');
    expect(parentRouteOf('/dog')).toBe('/settings');
    expect(parentRouteOf('/dog/')).toBe('/settings');
  });

  it('그 밖의 하위 화면은 홈으로 올라간다', () => {
    expect(parentRouteOf('/something-new')).toBe('/');
  });
});

describe('SWIPE_ROUTES — 손가락으로 넘기는 한 줄', () => {
  it('탭바 순서대로이되 둘러보기만 종류 셋으로 펼쳐져 있다', () => {
    expect([...SWIPE_ROUTES]).toEqual([
      '/',
      '/places/stay',
      '/places/restaurant',
      '/places/cafe',
      '/map',
      '/checklist',
      '/settings',
    ]);
  });

  it('루트 화면과 같은 집합이다 — 스와이프로 가는데 뒤로가기가 붙으면 그게 버그다', () => {
    for (const route of SWIPE_ROUTES) expect(isRootRoute(route)).toBe(true);
  });

  it('카페에서 한 번 더 밀면 지도다 — 둘러보기의 끝은 막다른 길이 아니다', () => {
    expect(SWIPE_ROUTES[swipeIndexOf('/places/cafe') + 1]).toBe('/map');
  });

  it('홈에서 왼쪽으로 밀면 둘러보기의 첫 종류로 들어온다', () => {
    expect(SWIPE_ROUTES[swipeIndexOf('/') + 1]).toBe('/places/stay');
  });

  it('지도는 가운데다 — 탭바의 솟은 원형 버튼 자리와 같다(navItems 의 prominent)', () => {
    expect(swipeIndexOf('/map')).toBe(4);
    expect(SWIPE_ROUTES[swipeIndexOf('/map') + 1]).toBe('/checklist');
  });

  it('수열에 없는 화면은 -1 이다', () => {
    expect(swipeIndexOf('/saved')).toBe(-1);
  });
});

describe('isWithinPlacesSwipe — 제스처의 주인을 가른다', () => {
  it('둘러보기 안에서 끝나면 화면 쪽(placesPageSwipe)의 것이다', () => {
    expect(isWithinPlacesSwipe(swipeIndexOf('/places/stay'), swipeIndexOf('/places/restaurant'))).toBe(true);
  });

  it('둘러보기 밖으로 나가면 셸(appShellSwipe)의 것이다', () => {
    expect(isWithinPlacesSwipe(swipeIndexOf('/places/stay'), swipeIndexOf('/map'))).toBe(false);
    expect(isWithinPlacesSwipe(swipeIndexOf('/places/cafe'), swipeIndexOf('/checklist'))).toBe(false);
  });

  it('수열 밖(끝을 넘어선 자리)은 아무의 것도 아니다', () => {
    expect(isWithinPlacesSwipe(swipeIndexOf('/settings'), SWIPE_ROUTES.length)).toBe(false);
    expect(isWithinPlacesSwipe(swipeIndexOf('/'), -1)).toBe(false);
  });
});

describe('canStartSwipeAt — 어디서 밀기 시작할 수 있나', () => {
  const W = 390;

  describe('지도는 가장자리 띠에서만 — 가운데 가로 끌기는 네이버 지도의 것이다', () => {
    it('가운데는 안 된다', () => {
      expect(canStartSwipeAt('/map', W / 2, W)).toBe(false);
    });

    it('왼쪽 두 번째 띠(24 < x < 48)는 된다 — 맨 왼쪽 24px 는 iOS 뒤로가기 몫이라 그다음 띠', () => {
      expect(canStartSwipeAt('/map', 30, W)).toBe(true);
    });

    it('맨 왼쪽 24px 는 안 된다 — iOS 뒤로가기 제스처와 겹친다', () => {
      expect(canStartSwipeAt('/map', 10, W)).toBe(false);
      expect(canStartSwipeAt('/map', 24, W)).toBe(false);
    });

    it('두 번째 띠를 넘으면(48px~) 다시 지도의 것이다', () => {
      expect(canStartSwipeAt('/map', 48, W)).toBe(false);
    });

    it('오른쪽 끝 24px 는 된다', () => {
      expect(canStartSwipeAt('/map', W - 10, W)).toBe(true);
      expect(canStartSwipeAt('/map', W - 30, W)).toBe(false);
    });
  });

  it('지도를 뺀 탭바 화면에서는 자리와 무관하게 시작할 수 있다', () => {
    for (const route of SWIPE_ROUTES.filter((value) => value !== '/map')) {
      expect(canStartSwipeAt(route, W / 2, W)).toBe(true);
    }
  });

  it('하위 화면에서는 시작할 수 없다 — 거기엔 뒤로가기가 있다', () => {
    expect(canStartSwipeAt(`/place/${cafeId}`, W / 2, W)).toBe(false);
    expect(canStartSwipeAt('/saved', W - 10, W)).toBe(false);
  });
});

describe('hasSwipeSurface · takesHorizontalPan', () => {
  it('지도에도 표면은 달지만 가로 pan 은 받지 않는다 — 지도를 끄는 동작을 브라우저가 가로채지 않게', () => {
    expect(hasSwipeSurface('/map')).toBe(true);
    expect(takesHorizontalPan('/map')).toBe(false);
  });

  it('다른 탭바 화면은 둘 다, 하위 화면은 둘 다 아니다', () => {
    expect(hasSwipeSurface('/checklist')).toBe(true);
    expect(takesHorizontalPan('/checklist')).toBe(true);
    expect(hasSwipeSurface(`/place/${cafeId}`)).toBe(false);
    expect(takesHorizontalPan(`/place/${cafeId}`)).toBe(false);
  });
});
