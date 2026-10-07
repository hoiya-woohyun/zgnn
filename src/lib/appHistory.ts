/**
 * 이 탭의 history 항목마다 "앱 안에서 몇 번째 화면인가" 를 새겨 둔다.
 *
 * 상세 화면의 뒤로가기는 history 를 되감는데, 링크를 받아 상세로 바로 들어온 경우에는
 * 되감을 앱 안 화면이 없어 앱 밖으로 나가 버린다. react-router 는 그 첫 진입을
 * `location.key === 'default'` 로 알려줬지만 next/navigation 에는 같은 값이 없다.
 *
 * "한 번이라도 이동했으면 true" 인 모듈 전역 플래그로는 부족하다. 플래그는 한 번 서면
 * 내려가지 않아서, 딥링크로 들어온 첫 화면으로 되돌아온 뒤 다시 뒤로가기를 누르면
 * 앱 밖으로 나간다. 항목별로 값이 달라야 하므로 값을 history.state 에 새긴다.
 *
 * Next App Router 의 동작을 근거로 삼는다(node_modules/next/dist/client/components/
 * app-router.js 와 segment-cache/navigation.js 확인):
 * - `HistoryUpdater` 가 `useInsertionEffect` 로 history 를 먼저 쓰고, 그 뒤에 우리
 *   `useEffect` 가 돈다. 그래서 우리가 읽는 state 는 이미 새 항목의 것이다.
 * - 앞으로 가는 이동(`completeSoftNavigation`)은 `preserveCustomHistoryState: false` 라
 *   우리 값이 딸려오지 않는다. 그 "값 없음" 이 곧 새 항목이라는 증거다.
 * - 뒤로/앞으로(`completeTraverseNavigation`)와 최초 상태는 `true` 라 우리 값이 살아남는다.
 *   새로고침해도 브라우저가 state 를 보존하므로 깊이가 유지된다.
 */

import { isTabSwitch, normalizeRoute, ownerRootOf } from './appRoutes';

const DEPTH_KEY = 'zgnnDepth';
/** 이 항목이 어느 탭 화면 밑에 쌓여 있나(`ownerRootOf`). 뒤로가기로 돌아온 화면이 제 탭에 불을 다시 켜는 근거다. */
const ROOT_KEY = 'zgnnRoot';

/** 지금 보고 있는 history 항목의 깊이. 문서를 새로 불러오면 null 부터 다시 센다. */
let currentDepth: number | null = null;

/** 지금 보고 있는 history 항목의 탭. 문서를 새로 불러오면 null. */
let currentRoot: string | null = null;

/** 마지막으로 새긴 항목의 주소와 탭 — 탭바가 구독한다(`historyOwnerRoot`). 새길 때만 새 객체가 된다. */
type TOwnerStamp = { pathname: string; root: string };
let ownerStamp: TOwnerStamp | null = null;
const ownerListeners = new Set<() => void>();

/** 다음 stamp 는 새 항목이 아니라 같은 항목을 덮어쓴 것이라는 표시. */
let replacedPending = false;

/**
 * 새로 들어온 항목의 깊이를 정한다. window 를 건드리지 않는 순수 함수다.
 *
 * @param stampedDepth history.state 에서 읽은 값. 숫자면 이미 다녀간 항목이다.
 * @param prevDepth 직전 항목의 깊이. null 이면 이 문서에서의 첫 화면이다.
 * @param replaced 새 항목을 쌓은 게 아니라 현재 항목을 갈아 끼운 이동이었는지.
 */
export const resolveDepth = (
  stampedDepth: unknown,
  prevDepth: number | null,
  replaced = false,
): number => {
  if (typeof stampedDepth === 'number' && Number.isInteger(stampedDepth) && stampedDepth >= 0) {
    return stampedDepth;
  }
  if (prevDepth === null) return 0;
  return replaced ? prevDepth : prevDepth + 1;
};

/**
 * 뒤로가기가 앱 안 화면으로 되돌아가는 대신 현재 항목을 갈아 끼웠음을 알린다.
 * `router.replace` 는 항목을 늘리지 않으므로 깊이도 늘어나면 안 된다.
 */
export const markReplacedNavigation = () => {
  replacedPending = true;
};

/**
 * 현재 history 항목에 깊이와 탭을 새긴다. 경로가 바뀔 때마다 한 번씩 부른다.
 *
 * 직전 항목보다 얼마나 깊어졌는지를 돌려준다 — 셸이 이 이동을 쌓기(+)로 그릴지 걷기(-)로 그릴지 정하는
 * 근거다(`lib/stackTransition.ts`). 문서의 첫 화면이면 0.
 *
 * 탭은 탭바가 렌더 중에 같은 함수(`ownerRootOf`)로 먼저 계산해 둔다(`useNavHighlightPath`) — 여기 새기는 것은
 * 다음에 이 항목으로 **돌아올 때** 읽을 값이다. 둘이 같은 답을 내는 이유는 그 훅에 적었다.
 */
export const stampHistoryDepth = (): number => {
  if (typeof window === 'undefined') return 0;

  const state = window.history.state as Record<string, unknown> | null;
  const replaced = replacedPending;
  replacedPending = false;

  const previous = currentDepth;
  const depth = resolveDepth(state?.[DEPTH_KEY], previous, replaced);
  currentDepth = depth;
  currentRoot = ownerRootOf({ pathname: window.location.pathname, stamped: state?.[ROOT_KEY], previous: currentRoot });
  ownerStamp = { pathname: normalizeRoute(window.location.pathname), root: currentRoot };

  // 주소는 그대로 두고 state 만 덧쓴다. Next 가 심어 둔 `__NA` 를 함께 넘기므로
  // Next 의 replaceState 패치는 이 호출을 자기 것으로 보고 그대로 통과시킨다.
  window.history.replaceState({ ...state, [DEPTH_KEY]: depth, [ROOT_KEY]: currentRoot }, '');
  for (const listener of ownerListeners) listener();
  return previous === null ? 0 : depth - previous;
};

/**
 * 지금 history 항목에 새겨진 탭. 렌더 중에 읽는다(`useNavHighlightPath`) — 그때 history 는
 *   - 앞으로 가는 이동이면 아직 **떠나는** 항목이다(Next 가 commit 단계에서 쌓는다). 새 하위 화면은 그 탭을 물려받으므로 맞는 값이다.
 *   - 뒤로/앞으로면 이미 **도착한** 항목이다. 처음 들어올 때 새긴 제 탭이라 역시 맞는 값이다.
 */
export const stampedOwnerRoot = (): unknown =>
  typeof window === 'undefined' ? undefined : (window.history.state as Record<string, unknown> | null)?.[ROOT_KEY];

/**
 * 마지막으로 새긴 항목의 주소와 탭(`useSyncExternalStore` 의 스냅샷). 새로고침 직후 탭바가 정적 HTML 의 답을
 * history 에 남은 답으로 고칠 때 쓴다.
 */
export const historyOwnerRoot = () => ownerStamp;

export const subscribeHistoryOwnerRoot = (listener: () => void) => {
  ownerListeners.add(listener);
  return () => {
    ownerListeners.delete(listener);
  };
};

/**
 * 탭 화면끼리의 이동은 history 를 **쌓지 않고 갈아 끼운다**(`isTabSwitch`). 문서를 불러올 때 한 번 부른다.
 *
 * 탭바·사이드바·좌우 스와이프·종류 알약·화면 안의 링크(홈의 "지도에서 보기" 등)가 전부 탭 사이를 옮기는데, 그 길마다
 * `replace` 를 챙기게 두면 새 링크 하나가 잊는 날 탭 뒤에 탭이 쌓인다. 그래서 길 하나하나가 아니라 **history 가 쌓이는
 * 자리**에서 가른다 — Next 는 앞으로 가는 이동을 `history.pushState` 한 번으로 남긴다(app-router 의 `HistoryUpdater`).
 *
 * **Next 보다 먼저 감싼다.** Next 도 자기 effect 에서 그때의 `pushState` 를 붙잡아 감싸고(바깥에서 부른 pushState 를
 * 라우터에 반영하려고) 언마운트 때 붙잡아 둔 것으로 되돌린다. 셸 모듈 최상단에서 불러 두면 우리 것이 그 "붙잡아 둔 것" 이
 * 되어 Next 가 되돌려도 남는다. 우리 감싸개는 되돌리지 않는다(문서 하나에 한 번, HMR 로 다시 불려도 한 번).
 *
 * 갈아 끼운 항목은 깊이가 그대로다(`markReplacedNavigation` — Next 는 앞으로 가는 이동에 우리 state 를 싣지 않는다).
 */
export const keepTabsOffHistory = () => {
  if (typeof window === 'undefined') return;
  const history = window.history as History & { zgnnTabsOffHistory?: true };
  if (history.zgnnTabsOffHistory) return;
  history.zgnnTabsOffHistory = true;

  const nativePush = history.pushState.bind(history);
  const nativeReplace = history.replaceState.bind(history);
  history.pushState = (data: unknown, unused: string, url?: string | URL | null) => {
    if (url != null) {
      const to = new URL(url, window.location.href);
      if (to.origin === window.location.origin && isTabSwitch(window.location.pathname, to.pathname)) {
        markReplacedNavigation();
        nativeReplace(data, unused, url);
        return;
      }
    }
    nativePush(data, unused, url);
  };
};

/** 지금 보고 있는 history 항목의 깊이. 셸이 화면 스냅샷을 깊이별로 맡겨 둘 때 쓴다. */
export const historyDepth = () => currentDepth ?? 0;

/** 되감을 앱 안 화면이 남아 있는지. */
export const canGoBackInApp = () => (currentDepth ?? 0) > 0;
