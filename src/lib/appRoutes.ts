/**
 * 화면을 "메인 탭" 과 "그 안으로 들어간 화면" 으로 가른다.
 *
 * 사용자가 기대하는 것은 단순하다 — 메인 탭끼리는 그냥 옮겨 다니고, 탭 안으로 한 단계
 * 들어갔으면 되돌아 나올 수단이 있어야 한다. 그래서 메인 탭 다섯 곳만 루트로 두고,
 * 나머지는 전부 하위 화면으로 본다. 하위 화면에는 `appShell` 이 뒤로가기 줄을 자동으로 붙인다.
 *
 * **모르는 경로는 하위 화면으로 친다.** 이 기본값이 이 파일의 요점이다 — 화면을 새로
 * 만들면 뒤로가기가 저절로 생기고, 탭바에 넣을 때에만 이 표에 한 줄을 더한다.
 * 반대로 뒀다면 새 화면마다 "뒤로가기 챙겼나" 를 기억해야 한다.
 *
 * `navItems.ts` 의 `isActive` 를 재사용하면 안 된다 — 둘러보기 항목은 상세(`/place/:id`)까지
 * 자기 것으로 보기 때문에(탭 하이라이트용) 상세가 루트로 분류돼 뒤로가기를 잃는다.
 * 저기는 "어느 탭에 불이 들어오나", 여기는 "되돌아 나올 곳이 있나" 로 질문이 다르다.
 */
import { PLACE_TYPES, getPlace } from './places';
import { BACK_SWIPE_EDGE_PX } from './swipePager';

/** 주소 끝의 `/` 를 떼어 비교를 한 가지 모양으로 맞춘다(정적 내보내기라 `/dog/` 로도 들어온다). */
export const normalizeRoute = (pathname: string) => {
  const trimmed = pathname.replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
};

/**
 * 좌우 스와이프로 넘나드는 화면들을 **한 줄로 늘어놓은 순서**.
 *
 * 탭바(bottomNav)의 다섯 자리와 같은 순서이되, 둘러보기만 종류 셋으로 펼쳐져 있다.
 * 펼쳐 두는 것이 요점이다 — 홈에서 왼쪽으로 밀면 숙소가 나오고, 계속 밀면 식당·카페를
 * 지나 지도·준비물로 간다. "둘러보기 안의 탭 전환" 과 "화면 사이 이동" 은 손가락에게 같은
 * 동작이므로 자리표도 하나여야 한다. 둘을 따로 세면 카페에서 한 번 더 미는 순간
 * "다음이 무엇인가" 에 답할 수 있는 곳이 아무 데도 없다(→ ADR-014).
 *
 * 지도가 **가운데**인 것은 탭바의 솟은 원형 버튼 자리와 맞추기 위해서다(`navItems.ts` 의
 * `prominent`). 탭바 순서를 바꾸면 여기도 같이 바꾼다 — 손가락 순서와 눈 순서가 어긋나면
 * 둘러보기를 누른 뒤 오른쪽으로 밀었는데 홈이 나온다.
 *
 * 탭바의 하이라이트는 여전히 다섯 칸이다(`components/layout/navItems.ts` 의 `isActive`) —
 * 여기는 "다음이 무엇인가", 저기는 "어느 탭에 불이 들어오나" 로 질문이 다르다.
 */
export const SWIPE_ROUTES: readonly string[] = [
  '/',
  ...PLACE_TYPES.map((type) => `/places/${type}`),
  '/map',
  '/checklist',
  '/settings',
];

/**
 * 탭바·사이드바로 한 번에 갈 수 있는 화면. 여기 있는 경로에는 뒤로가기가 붙지 않는다.
 *
 * 둘러보기는 종류마다 주소가 다르지만(`/places/stay|restaurant|cafe`) 사용자에게는
 * 한 화면 안의 탭 전환이라 셋 다 루트다 — 카페 목록에서 뒤로가기가 나오면 안 된다.
 *
 * **`SWIPE_ROUTES` 에서 파생한다** — 둘은 같은 집합이어야 한다. 스와이프로 갈 수 있는데
 * 뒤로가기가 붙는 화면(또는 그 반대)이 생기면 그게 버그다. 따로 적어 두면 한쪽만 고치는 날이 온다.
 */
const ROOT_ROUTES = new Set<string>(SWIPE_ROUTES);

export const isRootRoute = (pathname: string): boolean => ROOT_ROUTES.has(normalizeRoute(pathname));

/** 스와이프 수열에서의 자리. 수열에 없는 화면(= 하위 화면)이면 -1. */
export const swipeIndexOf = (pathname: string): number => SWIPE_ROUTES.indexOf(normalizeRoute(pathname));

/** 그 자리가 둘러보기(`/places/*`)인가. 수열 밖이면 false. */
export const isPlacesSwipeIndex = (index: number): boolean =>
  SWIPE_ROUTES[index]?.startsWith('/places/') ?? false;

/**
 * 둘러보기 안에서 끝나는 이동인가 — `/places/*` 에서 `/places/*` 로.
 *
 * **이 한 줄이 제스처의 주인을 가른다.** 둘러보기 안의 이동은 화면 쪽(`screens/placesPageSwipe`)이
 * 헤더는 세워 둔 채 목록과 알약만 끌고, 경계를 넘는 이동은 셸(`components/layout/appShellSwipe`)이
 * 화면을 통째로 끈다. 두 인식기가 같은 포인터 이벤트를 보면서도 싸우지 않는 이유는 서로
 * 신호를 주고받아서가 아니라 **둘 다 여기에 같은 질문을 던지고 같은 답을 받기 때문**이다.
 */
export const isWithinPlacesSwipe = (from: number, to: number): boolean =>
  isPlacesSwipeIndex(from) && isPlacesSwipeIndex(to);

/**
 * 이 화면에 스와이프 표면(포인터 핸들러)을 다는가 — 탭바 화면이면 전부.
 * 하위 화면(`/place/:id` 등)은 수열 밖이라 여기서 걸린다 — 거기엔 뒤로가기가 있다.
 * 달았다고 어디서나 시작되는 것은 아니다 — 시작 자리는 `canStartSwipeAt` 이 가른다.
 */
export const hasSwipeSurface = (pathname: string): boolean => ROOT_ROUTES.has(normalizeRoute(pathname));

/**
 * 세로는 브라우저에 맡기고 가로만 받는가(`touch-action: pan-y`) — 지도만 아니다.
 * 지도에 걸어 두면 가로 끌기를 브라우저가 우리 몫으로 넘겨줘 지도가 영영 움직이지 않는다.
 */
export const takesHorizontalPan = (pathname: string): boolean =>
  hasSwipeSurface(pathname) && normalizeRoute(pathname) !== '/map';

/**
 * 이 화면의 이 자리(`clientX`)에서 스와이프를 **시작**할 수 있는가.
 *
 * 지도는 화면 전체가 네이버 지도 캔버스라 가로로 끄는 동작이 이미 지도의 것이다. 예전엔 그래서
 * 지도에서는 아예 시작할 수 없었는데, 옆 탭 → 지도는 밀리고 지도 → 다음 탭은 안 밀리는 **일방통행**이
 * 됐다(D10). 그래서 가장자리 두 띠만 스와이프에 내준다 — 지도를 그 띠에서 끌 일은 드물다.
 *   - 왼쪽: `24 < x < 48`. 맨 왼쪽 24px 는 iOS 뒤로가기 제스처 몫이라(`BACK_SWIPE_EDGE_PX`,
 *     셸의 pointerdown 이 따로 막는다) **그다음 띠**를 쓴다.
 *   - 오른쪽: `x > 폭 - 24`. 오른쪽엔 시스템 제스처가 없어 맨 끝 띠를 그대로 쓴다.
 * 다른 탭바 화면은 자리와 무관하다(왼쪽 24px 가드는 셸 몫이라 여기선 보지 않는다).
 */
export const canStartSwipeAt = (pathname: string, clientX: number, viewportWidth: number): boolean => {
  if (!hasSwipeSurface(pathname)) return false;
  if (normalizeRoute(pathname) !== '/map') return true;
  const inLeftBand = clientX > BACK_SWIPE_EDGE_PX && clientX < BACK_SWIPE_EDGE_PX * 2;
  const inRightBand = clientX > viewportWidth - BACK_SWIPE_EDGE_PX;
  return inLeftBand || inRightBand;
};

/**
 * 되감을 앱 안 화면이 없을 때(딥링크로 바로 들어온 경우) 올라갈 부모 경로.
 *
 * 상세는 장소의 종류에 따라 부모 탭이 갈린다 — 카페 상세에서 올라갔는데 숙소 목록이
 * 나오면 안 되므로 경로만 보지 않고 데이터를 본다. 데이터는 빌드 시점에 묶여 있어
 * 클라이언트에서 그냥 읽을 수 있다. 강아지 프로필은 설정 탭 안의 화면이라 설정으로,
 * 그 밖의 화면(저장한 곳 포함)은 홈으로 올려보낸다. 저장한 곳은 홈 카드가 주 진입점이라
 * 홈 아래로 옮겼다 — 설정 밑에 두면 가장 자주 여는 목록이 가장 깊이 묻힌다.
 */
export const parentRouteOf = (pathname: string): string => {
  const path = normalizeRoute(pathname);

  if (path.startsWith('/place/')) {
    const place = getPlace(path.slice('/place/'.length));
    return place ? `/places/${place.type}` : '/places/stay';
  }

  if (path === '/dog') return '/settings';

  return '/';
};
