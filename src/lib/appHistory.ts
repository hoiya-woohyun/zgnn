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
/** 이 탭 화면 항목 **밑이 홈**이다 — 비 iOS 에서 홈을 떠날 때 남긴 한 칸(`tabSwitchHistoryOf`). 탭끼리 갈아 끼워도 따라간다. */
const HOME_BELOW_KEY = 'zgnnHomeBelow';

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

/** 홈 위의 탭 항목을 걷으려고 건 `history.back()` — 그 popstate 는 장부 정리라 아무도 그리지 않는다(`keepTabsOffHistory`). */
let rewindPending = false;

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
  currentRoot = ownerRootOf({
    pathname: window.location.pathname,
    search: window.location.search,
    stamped: state?.[ROOT_KEY],
    previous: currentRoot,
  });
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

/** 지금 주소의 쿼리 — 정해 둔 부모(`parentRouteOf`)가 쿼리로 갈리는 화면 때문에 셸이 넘긴다. 서버(정적 내보내기)에선 빈 값. */
export const locationSearch = (): string => (typeof window === 'undefined' ? '' : window.location.search);

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
 * 같은 화면 안에서 주소만 고치는 `replaceState`(쿼리·끝 `/` — 지도의 `?saved=1`, 저장한 곳의 주소 정리)에 지금 항목의
 * 깊이·탭을 잇는다. 순수 함수.
 *
 * Next 는 `router.replace` 에도 우리 값을 싣지 않는다(`preserveCustomHistoryState: false` — 새 state 는 `{ __NA, … }` 뿐).
 * 그런데 경로가 그대로라 셸이 다시 새기지(`stampHistoryDepth`) 않는다. 그대로 두면 그 항목은 값을 잃고, 나중에 뒤로가기로
 * 돌아올 때 **처음 온 항목**으로 읽혀(`resolveDepth` 가 직전 + 1) 걷기가 덮기로 그려지고 탭 불도 제 탭을 잃는다.
 * 경로가 바뀌는 replace 는 잇지 않는다 — 그건 새 화면이고 셸이 곧 새긴다(갈아 끼운 깊이는 `markReplacedNavigation` 이 맡는다).
 */
export const carryHistoryStamp = (current: unknown, next: unknown, samePath: boolean): unknown => {
  if (!samePath || typeof next !== 'object' || typeof current !== 'object' || current === null) return next;
  const from = current as Record<string, unknown>;
  const to = (next ?? {}) as Record<string, unknown>;
  if (from[DEPTH_KEY] === undefined || to[DEPTH_KEY] !== undefined) return next;
  return { ...to, [DEPTH_KEY]: from[DEPTH_KEY], [ROOT_KEY]: from[ROOT_KEY] };
};

/**
 * iPhone·iPad 인가 — 가장자리 뒤로가기(Safari)가 있거나 하드웨어 뒤로가 없는 쪽. iPadOS 는 데스크톱 Safari 로 자신을 소개해 터치로 가른다.
 * 홈 한 칸(`tabSwitchHistoryOf`)과 브라우저가 이미 그린 뒤로가기(`appShellStack`)가 같은 답을 쓴다.
 */
export const isIOS = () =>
  typeof navigator !== 'undefined' &&
  (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

/**
 * 탭 화면 → 다른 탭 화면 이동을 history 에 어떻게 남기나. window 를 모르는 순수 함수다(ADR-025 결정 7).
 *
 *   - `replace` — 갈아 끼운다. 탭 뒤에 탭이 쌓이지 않는다(탭 사이를 뒤로가기로 되짚지 않는다).
 *   - `push` — 홈에서 떠날 때만, 홈 한 칸을 밑에 남긴다. 안드로이드의 '시작 목적지' 다 — 어느 탭에서든 뒤로 = 홈, 홈에서 뒤로 = 앱 밖.
 *     홈 '식당' 카드·가운데 지도 버튼 다음 폰 뒤로가기가 빈 화면(앱 밖)이었다(14 W261019.6, 반복 4회).
 *   - `rewind` — 홈 위의 탭에서 홈으로. 갈아 끼우면 홈 위에 홈이 쌓여 뒤로가기 한 번이 아무 일도 안 하므로, 밑의 홈으로 되감는다.
 *
 * **iOS 는 늘 `replace`**(`keepHomeBelow` false). Safari 의 가장자리 뒤로가기가 그 한 칸으로 걷히면 같은 화면의 같은 방향 끌기가
 * 탭 페이저(왼쪽 이웃 탭)와 두 뜻이 되고, 홈 화면 앱엔 하드웨어 뒤로가 없어 남길 까닭도 없다.
 */
export type TTabSwitchHistory = 'replace' | 'push' | 'rewind';

export const tabSwitchHistoryOf = ({
  from,
  to,
  homeBelow,
  keepHomeBelow,
}: {
  from: string;
  to: string;
  /** 떠나는 항목 밑이 홈인가(`HOME_BELOW_KEY`). */
  homeBelow: boolean;
  keepHomeBelow: boolean;
}): TTabSwitchHistory => {
  if (!keepHomeBelow) return 'replace';
  if (normalizeRoute(from) === '/') return 'push';
  if (normalizeRoute(to) === '/' && homeBelow) return 'rewind';
  return 'replace';
};

/**
 * 탭 화면끼리의 이동은 history 를 **쌓지 않고 갈아 끼운다**(`isTabSwitch`). 문서를 불러올 때 한 번 부른다.
 * 예외 하나 — 비 iOS 에서 홈을 떠날 때는 홈 한 칸을 밑에 남긴다(`tabSwitchHistoryOf`).
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
  const keepHomeBelow = !isIOS();
  history.pushState = (data: unknown, unused: string, url?: string | URL | null) => {
    if (url != null) {
      const to = new URL(url, window.location.href);
      if (to.origin === window.location.origin && isTabSwitch(window.location.pathname, to.pathname)) {
        const homeBelow = (history.state as Record<string, unknown> | null)?.[HOME_BELOW_KEY] === true;
        const move = tabSwitchHistoryOf({ from: window.location.pathname, to: to.pathname, homeBelow, keepHomeBelow });
        if (move === 'push') {
          nativePush({ ...(data as Record<string, unknown> | null), [HOME_BELOW_KEY]: true }, unused, url);
          return;
        }
        markReplacedNavigation();
        // 갈아 끼우는 탭 항목도 밑은 그대로 홈이다 — 표식을 잇는다(Next 의 새 state 엔 우리 값이 없다).
        nativeReplace(homeBelow && move === 'replace' ? { ...(data as Record<string, unknown> | null), [HOME_BELOW_KEY]: true } : data, unused, url);
        if (move === 'rewind') {
          // Next 가 이미 홈을 그렸고 주소·state 도 홈으로 갈아 끼웠다. 남은 것은 밑의 같은 홈으로 한 칸 되감아 위 칸을 앞으로 가기 쪽으로 보내는 일뿐 —
          // 그 popstate 는 아래 리스너가 삼킨다. Next 를 거쳐 홈 → 홈 이동을 한 번 더 일으키지 않는 것이 요점이다.
          rewindPending = true;
          history.back();
        }
        return;
      }
    }
    nativePush(data, unused, url);
  };
  // 셸·Next 보다 먼저(모듈 최상단 · capture) 듣는다. 되감기는 같은 주소라 셸의 layout effect 가 다시 새기지 않으므로 여기서 새긴다.
  window.addEventListener(
    'popstate',
    (event) => {
      if (!rewindPending) return;
      rewindPending = false;
      event.stopImmediatePropagation();
      stampHistoryDepth();
    },
    true,
  );
  // 같은 경로의 replace 가 새긴 값을 지우지 않게(`carryHistoryStamp`). 우리 자신의 새기기는 `url` 없이 부르므로 그대로 지난다.
  history.replaceState = (data: unknown, unused: string, url?: string | URL | null) => {
    const samePath =
      url != null && normalizeRoute(new URL(url, window.location.href).pathname) === normalizeRoute(window.location.pathname);
    nativeReplace(carryHistoryStamp(history.state, data, samePath), unused, url);
  };
};

/** 지금 보고 있는 history 항목의 깊이. 셸이 화면 스냅샷을 깊이별로 맡겨 둘 때 쓴다. */
export const historyDepth = () => currentDepth ?? 0;

/** 되감을 앱 안 화면이 남아 있는지. */
export const canGoBackInApp = () => (currentDepth ?? 0) > 0;
