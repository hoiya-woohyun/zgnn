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

const DEPTH_KEY = 'zgnnDepth';

/** 지금 보고 있는 history 항목의 깊이. 문서를 새로 불러오면 null 부터 다시 센다. */
let currentDepth: number | null = null;

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

/** 현재 history 항목에 깊이를 새긴다. 경로가 바뀔 때마다 한 번씩 부른다. */
export const stampHistoryDepth = () => {
  if (typeof window === 'undefined') return;

  const state = window.history.state as Record<string, unknown> | null;
  const replaced = replacedPending;
  replacedPending = false;

  const depth = resolveDepth(state?.[DEPTH_KEY], currentDepth, replaced);
  currentDepth = depth;

  // 주소는 그대로 두고 state 만 덧쓴다. Next 가 심어 둔 `__NA` 를 함께 넘기므로
  // Next 의 replaceState 패치는 이 호출을 자기 것으로 보고 그대로 통과시킨다.
  window.history.replaceState({ ...state, [DEPTH_KEY]: depth }, '');
};

/** 되감을 앱 안 화면이 남아 있는지. */
export const canGoBackInApp = () => (currentDepth ?? 0) > 0;
