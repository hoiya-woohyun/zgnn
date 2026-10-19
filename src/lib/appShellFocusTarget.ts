/**
 * 화면이 바뀐 뒤 **포커스를 어디에 둘까**를 정한다. DOM 을 모른다 — 셸(`components/layout/appShellFocus.ts`)이 후보를 재서 묻는다.
 *
 * 화면을 갈아 끼우면 포커스를 받고 있던 요소(누른 카드·뒤로 가기 버튼)가 옛 화면과 함께 사라지고, 브라우저는 포커스를 `body` 로
 * 떨어뜨린다. 키보드·스크린리더 사용자는 그때마다 문서 맨 처음(건너뛰기 링크)부터 다시 걸어 와야 했다 — 상세에서 뒤로 오면
 * 방금 연 카드가 어디였는지, 종류 알약을 누르면 새 목록이 어디서 시작하는지를 잃는다(14 W261019.15a · ux-expert-22, WCAG 2.4.3).
 *
 * 규칙은 셋이다.
 *   - **뒤로 왔으면 방금 연 링크로.** 들어갈 때 누른 링크를 깊이별로 적어 두었다가(`noteFocusArrival`), 그 깊이로 되돌아오면 같은
 *     주소로 가는 링크를 다시 찾는다. 스크롤은 셸이 떠날 때의 자리로 돌려 두므로 그 링크는 화면 안에 있다.
 *   - **잃었으면 그 화면의 제목(h1)으로.** 들어갈 때 · 탭을 옮길 때 · 돌아왔는데 링크를 못 찾았을 때.
 *   - **화면이 스스로 옮겼거나 포커스가 살아 있으면 손대지 않는다.** 탭바의 링크는 화면 밖이라 탭을 옮겨도 그대로 남는다 —
 *     거기서 Enter 를 친 사람은 다음 탭으로 옮겨 가려는 것이라 빼앗지 않는다.
 *
 * 들어온 길을 주소로 가르지 않는다 — 같은 `/place/:id` 에 처음 들어가는 것과 되돌아오는 것은 주소로 구별되지 않는다(`appScroll.ts` 와
 * 같은 이야기). 깊이가 줄었으면 돌아온 것이다(`appHistory` 의 `stampHistoryDepth`).
 */
import { normalizeRoute } from './appRoutes';

/** 하위 화면을 연 링크 하나 — 돌아왔을 때 포커스를 돌려줄 자리. */
export type TFocusOpener = {
  /** 링크가 있던 화면(정규화한 경로). 돌아온 화면이 이것과 같을 때만 쓴다. */
  route: string;
  /** 링크가 가리킨 곳 — 정규화한 경로 + 쿼리(`linkPathOf`). */
  path: string;
  /** 그 화면에서 같은 곳을 가리키는 보이는 링크 중 몇 번째였나(0 부터). 설정에는 `/dog` 로 가는 카드가 둘일 수 있다. */
  nth: number;
};

/**
 * 링크의 `href` 를 비교할 수 있는 모양으로 — 정규화한 경로 + 쿼리. 다른 출처·읽을 수 없는 주소는 null.
 *
 * 렌더된 `href` 는 끝 `/` 가 붙거나(`trailingSlash`) 안 붙어 있어 글자 그대로 맞추면 갈린다.
 */
export const linkPathOf = (href: string, base: string): string | null => {
  try {
    const url = new URL(href, base);
    if (url.origin !== new URL(base).origin) return null;
    return `${normalizeRoute(url.pathname)}${url.search}`;
  } catch {
    return null;
  }
};

/** 링크 목록의 `index` 번째가 같은 곳을 가리키는 링크 중 몇 번째인가. */
export const nthOfLink = (paths: readonly (string | null)[], index: number): number => {
  const path = paths[index];
  return paths.slice(0, index).filter((other) => other === path).length;
};

/**
 * 돌아온 화면의 링크 목록에서 연 링크를 고른다 — 같은 번째를 먼저, 그 사이 줄었으면 같은 곳으로 가는 마지막 링크. 없으면 -1.
 */
export const openerIndexOf = (paths: readonly (string | null)[], opener: Pick<TFocusOpener, 'path' | 'nth'>): number => {
  const matches = paths.flatMap((path, index) => (path === opener.path ? [index] : []));
  if (matches.length === 0) return -1;
  return matches[Math.min(opener.nth, matches.length - 1)];
};

export type TFocusArrivalMove = {
  /** 떠난 주소. */
  from: string;
  /** 도착한 주소. */
  to: string;
  /** 도착한 history 항목의 깊이(`historyDepth`). */
  depth: number;
  /** 도착한 깊이 - 떠난 깊이(`stampHistoryDepth`). 늘었으면 들어간 것, 줄었으면 돌아온 것. */
  depthDelta: number;
  /** 뒤로/앞으로(popstate)로 온 이동인가. 앞으로 가기는 깊이가 늘어도 새로 연 것이 아니라 적어 둔 것을 지우지 않는다. */
  traversed: boolean;
  /** 떠나기 직전에 누른 링크(없으면 null). 도착한 곳을 가리키지 않으면 화면을 바꾼 클릭이 아니다. */
  clicked: TFocusOpener | null;
};

/**
 * 도착 하나를 적고, 돌아온 것이면 그 화면을 떠날 때 누른 링크를 돌려준다. `book` 은 깊이 → 그 깊이의 화면에서 누른 링크.
 *
 *   - 새로 쌓았다(깊이 +, popstate 아님): 그 위 칸들은 브라우저가 버렸으니 지우고, 떠난 칸에 이번에 누른 링크를 적는다.
 *     링크 없이 옮겼으면(버튼의 `router.push`) 그 칸은 비운다 — 옛 링크가 남으면 연 적 없는 카드로 돌아간다.
 *   - 돌아왔다(깊이 -): 그 칸을 읽는다. 지우지 않는다 — 앞으로 갔다 다시 돌아와도 같은 카드다.
 *   - 그 밖(갈아 끼움·탭 전환·앞으로 가기): 읽지도 적지도 않는다.
 */
export const noteFocusArrival = (book: Map<number, TFocusOpener>, move: TFocusArrivalMove): TFocusOpener | null => {
  const from = normalizeRoute(move.from);
  const to = normalizeRoute(move.to);
  if (move.depthDelta > 0 && !move.traversed) {
    for (const key of book.keys()) if (key >= move.depth - 1) book.delete(key);
    const clicked = move.clicked;
    // 누른 링크가 떠난 화면에 있었고 도착한 곳을 가리켜야 이번 이동을 연 링크다 — 새 탭으로 연 클릭 같은 것이 남은 것일 수 있다.
    if (clicked && clicked.route === from && clicked.path.split('?')[0] === to) book.set(move.depth - 1, clicked);
    return null;
  }
  if (move.depthDelta < 0) {
    const opener = book.get(move.depth);
    return opener && opener.route === to ? opener : null;
  }
  return null;
};

export type TFocusArrivalScene = {
  /** 돌아온 화면이면 그 화면을 떠날 때 누른 링크(`noteFocusArrival`). */
  opener: Pick<TFocusOpener, 'path' | 'nth'> | null;
  /** 지금 화면(`<main>`)의 보이는 링크들이 가리키는 곳(`linkPathOf`), 문서 순서대로. */
  links: readonly (string | null)[];
  /** 보이는 h1 이 있나 — 없으면 화면이 아직 안 그려졌을 수 있다. */
  hasHeading: boolean;
  /** 도착한 뒤 화면이 스스로 포커스를 옮겼나(도착 순간의 포커스와 다르다). */
  focusMoved: boolean;
  /** 포커스가 `body` 에 떨어져 있나. */
  focusLost: boolean;
  /** 더 기다리지 않는다 — 이번에 못 정하면 그만둔다. */
  lastTry: boolean;
};

export type TFocusArrivalTarget =
  | { kind: 'opener'; index: number }
  | { kind: 'heading' }
  /** h1 이 끝내 없는 화면 — 본문(`<main>`, 건너뛰기 링크의 과녁)으로. */
  | { kind: 'main' }
  /** 화면이 아직 덜 그려졌다 — 다음 프레임에 다시 묻는다. */
  | { kind: 'wait' }
  | { kind: 'none' };

/** 도착한 화면에서 포커스를 어디에 둘까. 위 파일 머리의 세 규칙. */
export const focusArrivalTargetOf = (scene: TFocusArrivalScene): TFocusArrivalTarget => {
  if (scene.focusMoved) return { kind: 'none' };
  if (scene.opener) {
    const index = openerIndexOf(scene.links, scene.opener);
    // 뒤로 가기 버튼처럼 화면을 넘어 살아남은 요소에 포커스가 있어도 연 링크가 먼저다 — 돌아온 사람이 찾는 것은 그 카드다.
    if (index >= 0) return { kind: 'opener', index };
    if (!scene.hasHeading && !scene.lastTry) return { kind: 'wait' };
  }
  if (!scene.focusLost) return { kind: 'none' };
  if (scene.hasHeading) return { kind: 'heading' };
  return scene.lastTry ? { kind: 'main' } : { kind: 'wait' };
};
