/**
 * 쌓이는 화면(stack) 사이를 옮길 때 **어느 쪽으로 미끄러뜨리나**를 정한다. DOM 을 모른다.
 *
 * 앱에는 두 종류의 이동이 있다.
 *   - 탭바 화면끼리(홈 · 둘러보기 · 지도 · 준비물 · 설정) — **나란히** 놓여 옆으로 밀린다(ADR-014).
 *   - 그 안으로 들어가는 화면(`/dog` · `/saved` · `/place/:id`) — **위에 쌓인다**. 들어갈 때 오른쪽에서
 *     덮고(push), 나올 때 오른쪽으로 걷힌다(pop). 네이티브 앱의 내비게이션 스택과 같은 문법이다.
 *
 * 둘은 손가락에게 다른 말을 한다 — 옆으로 미는 것은 "이웃으로", 걷어 내는 것은 "되돌아" 다. 그래서
 * 이동 하나가 어느 쪽인지를 **여기 한 곳에서** 답한다. 셸(`appShellStack`)이 주소가 바뀐 직후 묻는다.
 *
 * 방향을 history 깊이(`appHistory`)로 보는 이유: 같은 `/place/:id` 에 처음 들어가는 것과 뒤로가기로
 * 돌아오는 것은 주소로 구별되지 않는다(`appScroll.ts` 의 같은 이야기). 깊이가 늘었으면 쌓은 것이고
 * 줄었으면 걷은 것이다. 딥링크의 뒤로가기는 예외다 — 되감을 곳이 없어 부모로 **갈아 끼우므로**
 * 깊이가 그대로인데, 사용자에게는 분명히 "되돌아" 다. 그 이동을 거는 쪽이 `popRequested` 로 말한다.
 */
import { isRootRoute, normalizeRoute } from './appRoutes';
import { BACK_SWIPE_EDGE_PX } from './swipePager';

export type TStackTransition = 'push' | 'pop' | 'none';

export type TStackMove = {
  /** 떠난 주소. */
  from: string;
  /** 도착한 주소. */
  to: string;
  /** 도착한 history 항목의 깊이 - 떠난 항목의 깊이. 문서의 첫 화면이면 0. */
  depthDelta: number;
  /** 셸의 뒤로가기(버튼·가장자리 스와이프)가 건 이동인가 — 갈아 끼우는 뒤로가기는 깊이가 그대로라 이것으로만 안다. */
  popRequested: boolean;
};

/**
 * 쌓이는 화면인가 — 탭바 화면이 아니고, 검수 화면(`/admin`)도 아닌 곳.
 *
 * `/admin` 은 `ROOT_ROUTES` 밖이라 그냥 두면 하위 화면으로 쳐진다. 그런데 거기는 앱의 길 밖이라(셸이 뒤로가기도
 * 사이드바도 안 붙인다, `appShell` 의 `bare`) 쌓였다 걷힐 부모가 없다. 표 안에서 탭을 바꿀 때마다 화면이 덮이면 고장이다.
 */
export const isStackRoute = (pathname: string): boolean => {
  const path = normalizeRoute(pathname);
  return !isRootRoute(path) && !path.startsWith('/admin');
};

/**
 * 이 이동을 어떻게 그리나.
 *
 *   - 같은 주소(쿼리만 바뀜 · 끝 `/` 차이) → 화면이 바뀐 것이 아니다.
 *   - 탭바 화면끼리 → 옆으로 미는 페이저(ADR-014)의 몫이라 여기선 손대지 않는다.
 *   - 쌓이는 화면으로 깊어졌다 → push. 상세 → 근처 상세처럼 쌓인 위에 또 쌓는 것도 push 다.
 *   - 쌓이는 화면에서 얕아졌다, 또는 셸이 되돌아가라고 했다 → pop.
 *   - 그 밖(쌓이는 화면에서 탭바를 눌러 탭으로 나감 등) → none. 탭바는 "되돌아" 가 아니라 "다른 데로" 다.
 */
export const stackTransitionOf = ({ from, to, depthDelta, popRequested }: TStackMove): TStackTransition => {
  const fromPath = normalizeRoute(from);
  const toPath = normalizeRoute(to);
  if (fromPath === toPath) return 'none';
  if (isStackRoute(fromPath) && (popRequested || depthDelta < 0)) return 'pop';
  if (isStackRoute(toPath) && depthDelta > 0 && !fromPath.startsWith('/admin')) return 'push';
  return 'none';
};

/**
 * 쌓인 화면에서 이 자리(`clientX`)부터 끌면 **걷어 내는 제스처**로 받는가 — 왼쪽 가장자리 띠에서만.
 *
 * 화면 한가운데서 시작한 가로 끌기까지 받으면 상세의 사진 줄·알약 줄 같은 가로 스크롤과 싸운다. iOS 의 내비게이션 스택도
 * 가장자리에서만 받는다. 띠의 폭은 **어디서 열었나**로 갈린다.
 *   - 홈 화면 앱(standalone): 시스템 뒤로가기 제스처가 없다 — 맨 끝부터 `BACK_SWIPE_EDGE_PX * 2`(48px)까지 전부 우리 몫.
 *   - 브라우저: 맨 왼쪽 24px 는 Safari 가 자기 뒤로가기로 가져간다(셸의 다른 인식기도 비켜 선다, ADR-014) —
 *     그다음 띠(24~48px)만 쓴다. 지도에서 탭 페이저가 쓰는 왼쪽 띠와 같은 자리다.
 *
 * 띠는 화면이 아니라 **본문의 왼쪽 끝**(`surfaceLeft`)에서 잰다 — md+ 에선 사이드바(256px)가 왼쪽을 차지해 화면 기준 띠가
 * 사이드바 밑에 깔려 끌기를 시작할 수 없었다(12 U4.5). Safari 몫은 화면 기준(`clientX`) 그대로라, 본문이 그보다 오른쪽이면 띠 전체가 우리 몫이다.
 */
export const canStartStackBackAt = (clientX: number, standalone: boolean, surfaceLeft = 0): boolean => {
  const fromEdge = clientX - surfaceLeft;
  if (fromEdge < 0 || fromEdge >= BACK_SWIPE_EDGE_PX * 2) return false;
  return standalone || clientX > BACK_SWIPE_EDGE_PX;
};
