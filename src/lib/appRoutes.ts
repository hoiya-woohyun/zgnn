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
import { PLACE_TYPES, getPlace, typeTint } from './places';

/** 주소 끝의 `/` 를 떼어 비교를 한 가지 모양으로 맞춘다(정적 내보내기라 `/dog/` 로도 들어온다). */
const normalize = (pathname: string) => {
  const trimmed = pathname.replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
};

/**
 * 탭바·사이드바로 한 번에 갈 수 있는 화면. 여기 있는 경로에는 뒤로가기가 붙지 않는다.
 *
 * 둘러보기는 종류마다 주소가 다르지만(`/places/stay|restaurant|cafe`) 사용자에게는
 * 한 화면 안의 탭 전환이라 셋 다 루트다 — 카페 목록에서 뒤로가기가 나오면 안 된다.
 */
const ROOT_ROUTES = new Set<string>([
  '/',
  '/map',
  ...PLACE_TYPES.map((type) => `/places/${type}`),
  '/checklist',
  '/settings',
]);

export const isRootRoute = (pathname: string): boolean => ROOT_ROUTES.has(normalize(pathname));

/**
 * 되감을 앱 안 화면이 없을 때(딥링크로 바로 들어온 경우) 올라갈 부모 경로.
 *
 * 상세는 장소의 종류에 따라 부모 탭이 갈린다 — 카페 상세에서 올라갔는데 숙소 목록이
 * 나오면 안 되므로 경로만 보지 않고 데이터를 본다. 데이터는 빌드 시점에 묶여 있어
 * 클라이언트에서 그냥 읽을 수 있다. 저장한 곳·강아지 프로필은 설정 탭 안의 화면이라
 * 설정으로, 그 밖의 화면은 홈으로 올려보낸다.
 */
export const parentRouteOf = (pathname: string): string => {
  const path = normalize(pathname);

  if (path.startsWith('/place/')) {
    const place = getPlace(path.slice('/place/'.length));
    return place ? `/places/${place.type}` : '/places/stay';
  }

  if (path === '/saved' || path === '/dog') return '/settings';

  return '/';
};

/**
 * 화면 맨 위 면의 색 — 상태바(safe-area-inset-top) 뒤를 이 색으로 칠한다.
 *
 * 인셋 처리는 뒤로가기와 같은 이유로 셸이 맡는다(ADR-010). 화면마다 "위쪽 판을 인셋만큼
 * 끌어올려 자기 색으로 채우기" 를 반복하면 새 화면을 만들 때마다 그 계산을 기억해야 하고,
 * 하나만 빠져도 노치 기기에서만 제목이 상태바 밑으로 들어간다. 대신 셸이 인셋 높이의 띠를
 * 화면 위에 고정해 두고, 어느 색으로 칠할지만 여기서 답한다.
 *
 * - 홈: 현무암 히어로(잉크)가 맨 위 면이라 그 색.
 * - 상세: 종류 색 워시 판. 판이 위에서 아래로 옅어지는 그라디언트라 **맨 위 색**(22% tint)을 쓴다.
 * - 지도: `null` — 타일이 상태바 밑까지 깔리는 편이 지도답다. 셸은 띠도 위 여백도 두지 않는다.
 * - 나머지: 페이지 바탕(크림). 모르는 경로도 이쪽 — 새 화면의 기본값이다.
 */
export const topSurfaceColorOf = (pathname: string): string | null => {
  const path = normalize(pathname);

  if (path === '/') return 'var(--color-ink)';
  if (path === '/map') return null;

  if (path.startsWith('/place/')) {
    const place = getPlace(path.slice('/place/'.length));
    if (place) return typeTint(place.type, 22);
  }

  return 'var(--color-bg-secondary)';
};
