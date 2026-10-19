'use client';

import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { historyDepth } from '../../lib/appHistory';
import { normalizeRoute } from '../../lib/appRoutes';
import {
  focusArrivalTargetOf,
  linkPathOf,
  noteFocusArrival,
  nthOfLink,
  openerIndexOf,
  type TFocusOpener,
} from '../../lib/appShellFocusTarget';

/**
 * 도착 뒤 지켜보는 프레임 수(약 0.5초). 덜 그려진 화면을 기다리고, 둔 노드가 곧바로 갈아 끼워지면 다시 둔다.
 * 뒤로가기는 캐시에서 바로 그려 보통 첫 프레임에 정해진다.
 */
const WATCH_FRAMES = 30;

/** 그려져 있고 가려 둔 층(걷히는 그림의 복제본 · 시트 뒤) 밖인가. `sr-only` 제목은 1px 이라도 그려져 있어 남는다. */
const isShown = (element: Element) =>
  element.getClientRects().length > 0 && !element.closest('[aria-hidden="true"], [inert]');

/**
 * `<main>` 밖이어도 연 링크로 적고 돌아와 다시 찾는 층의 표지. 지도 시트의 카드(`mapPageSheet`)가 단다 — 시트는 react-aria 가 body 로
 * 포털해 `<main>` 밖이다(14 W261019.15b). 표지를 단 곳만 보는 이유: `<main>` 밖은 탭바·토스트·업데이트 알림처럼 화면을 넘어 사는 것이라,
 * 아무 곳이나 뒤지면 화면의 카드가 아닌 것을 "연 링크" 로 적는다.
 */
const FOCUS_RETURN_LAYER = '[data-focus-return]';

/** 화면의 보이는 링크 — `<main>` 안, 그다음 `<main>` 밖 표지 층. 적을 때와 찾을 때가 같은 목록이어야 몇 번째가 맞는다. */
const shownLinksIn = (main: HTMLElement) => {
  const layers = [...document.querySelectorAll<HTMLElement>(FOCUS_RETURN_LAYER)].filter((layer) => !main.contains(layer));
  return [main, ...layers].flatMap((root) => [...root.querySelectorAll<HTMLAnchorElement>('a[href]')]).filter(isShown);
};

/** 화면의 제목. 지도는 폭마다 h1 이 하나씩 숨어 있어 보이는 것을 고른다. */
const headingIn = (main: HTMLElement) => [...main.querySelectorAll<HTMLElement>('h1')].find(isShown) ?? null;

const pathOf = (link: HTMLAnchorElement) => linkPathOf(link.href, window.location.href);

/**
 * 제목은 누르는 것이 아니라 대개 tabIndex 가 없어 `focus()` 가 아무 일도 안 한다 — 코드로만 받게 열어 준다(Tab 순서엔 안 들어간다).
 * 연 김에 링을 끈다: 키보드로 온 사람에게 `:focus-visible` 링이 제목 둘레에 그려지는데, 누를 수 없는 것이라 말하는 것이 없다
 * (상세 h1 의 `outline-hidden` 과 같은 판단).
 */
const focusHeading = (heading: HTMLElement) => {
  if (!heading.hasAttribute('tabindex')) {
    heading.setAttribute('tabindex', '-1');
    heading.style.outline = 'none';
  }
  heading.focus({ preventScroll: true });
};

type TPendingFocus = {
  /** 돌아온 화면이면 그 화면을 떠날 때 누른 링크. */
  opener: TFocusOpener | null;
  /** 주소가 바뀐 순간(layout effect)의 포커스. 화면의 effect 가 옮겼는지 이것과 견준다. */
  activeAtArrival: Element | null;
};

/**
 * 화면이 바뀐 뒤 포커스를 둔다 — 뒤로 오면 방금 연 링크로, 잃었으면 그 화면의 h1 으로(`lib/appShellFocusTarget.ts`).
 *
 * 화면마다 ref 를 달지 않고 셸이 한 곳에서 한다. 들어갈 때 누른 링크는 화면이 모르는 일이고(상세는 목록·지도·저장한 곳·근처 어디서든
 * 열린다), 돌아왔을 때 그 링크를 다시 찾는 것은 "같은 곳으로 가는 링크" 라는 주소의 말로 충분하다.
 *
 * **옮기는 시점이 요점이다.**
 *   - 누른 링크는 문서에 **capture** 로 단 click 이 본다 — 화면이 바뀐 뒤엔 그 링크가 없다(`appShellStack` 이 스냅샷을 뜨는 자리와 같다).
 *     키보드 Enter 도 click 으로 온다.
 *   - 깊이는 셸의 경로 layout effect 가 새긴 **뒤에** 읽는다(`arrive`).
 *   - 포커스는 **passive effect** 에서 옮긴다. 부모(셸)의 effect 는 자식(화면)의 effect 뒤에 돌아, 화면이 스스로 포커스를 옮겼으면
 *     그것을 보고 비킨다. layout effect 에서 옮기면 화면의 effect 가 그 뒤에 다시 빼앗고, 둘이 번갈아 옮기면 스크린리더가 두 번 읽는다.
 *   - 덮기·걷기 그림이 끝나기를 기다리지 않는다. `preventScroll` 포커스는 `<main>` 의 transform 과 싸우지 않고, 걷히는 층은
 *     `inert` 라 Tab 이 그리로 가지 않는다 — 기다리면 그 340ms 동안 누른 Tab 이 다시 문서 맨 처음에서 출발한다.
 *     가장자리 끌기·모션 줄임·iOS Safari 처럼 그림이 없는 길도 같은 자리를 지난다.
 */
export function useAppShellFocus({ pathname, mainRef }: { pathname: string; mainRef: RefObject<HTMLElement | null> }) {
  /** 깊이 → 그 깊이의 화면을 떠날 때 누른 링크. `appShellStack` 의 스냅샷과 같이 깊이로 맡긴다. */
  const book = useRef(new Map<number, TFocusOpener>());
  /** 떠나기 직전에 누른 링크. 다음 도착이 쓰거나 버린다. */
  const clicked = useRef<TFocusOpener | null>(null);
  /** 이번 이동이 뒤로/앞으로(popstate)인가. */
  const traversed = useRef(false);
  /** 지금 화면의 주소. popstate 가 올 때 `location` 은 이미 다음 주소라 이것으로 견준다. */
  const current = useRef(pathname);
  const pending = useRef<TPendingFocus | null>(null);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      traversed.current = false;
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const main = mainRef.current;
      const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!main || !(anchor instanceof HTMLAnchorElement)) return;
      if (!main.contains(anchor) && !anchor.closest(FOCUS_RETURN_LAYER)) return;
      if ((anchor.target && anchor.target !== '_self') || anchor.hasAttribute('download')) return;
      const links = shownLinksIn(main);
      const index = links.indexOf(anchor);
      const paths = links.map(pathOf);
      const path = paths[index];
      if (index < 0 || path == null) return;
      clicked.current = { route: normalizeRoute(current.current), path, nth: nthOfLink(paths, index) };
    };
    const onPopState = () => {
      clicked.current = null;
      // 쿼리만 되감은 popstate 는 도착이 없다 — 표식이 남으면 다음에 링크로 쌓은 것을 앞으로 가기로 읽는다.
      traversed.current = normalizeRoute(window.location.pathname) !== normalizeRoute(current.current);
    };
    document.addEventListener('click', onClick, true);
    window.addEventListener('popstate', onPopState, true);
    return () => {
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('popstate', onPopState, true);
    };
  }, [mainRef]);

  /** 주소가 바뀐 직후 셸이 부른다(layout effect — 깊이 새기기 뒤). 옮기는 것은 아래 effect 다. */
  const arrive = useCallback(
    (from: string, depthDelta: number) => {
      current.current = pathname;
      const opener = noteFocusArrival(book.current, {
        from,
        to: pathname,
        depth: historyDepth(),
        depthDelta,
        traversed: traversed.current,
        clicked: clicked.current,
      });
      traversed.current = false;
      clicked.current = null;
      // 검수 화면은 앱의 길 밖이고(`appShell` 의 `bare`) 표 안에서 스스로 포커스를 옮긴다.
      pending.current = normalizeRoute(pathname).startsWith('/admin')
        ? null
        : { opener, activeAtArrival: document.activeElement };
    },
    [pathname],
  );

  useEffect(() => {
    const arrival = pending.current;
    pending.current = null;
    if (!arrival) return;
    let frame = 0;
    let tries = 0;
    /** 포커스를 둔 요소. 둔 뒤에도 몇 프레임 지켜본다 — 아래 `attempt` 참고. */
    let placed: HTMLElement | null = null;
    /** 둔 것이 h1 인가 — 연 링크가 `<main>` 밖 층(지도 시트)에 늦게 뜨면 그리로 옮긴다. */
    let placedHeading = false;
    const attempt = () => {
      const main = mainRef.current;
      if (!main) return;
      const lastTry = tries >= WATCH_FRAMES;
      tries += 1;
      const active = document.activeElement;
      const focusLost = active === null || active === document.body;
      /*
       * 둔 노드를 화면이 곧바로 갈아 끼우면 포커스가 그 노드와 함께 body 로 떨어진다 — `/saved` 는 주소의 `?ids=` 를 읽기 전의
       * 자리표시 머리를 다음 렌더에 새 h1 로 바꿔 단다(`appBar` 의 `swapWatch` 와 같은 사정). 그때만 다시 정한다. 그 사이 누가
       * 포커스를 옮겼으면(Tab) 그대로 둔다.
       */
      const replaced = placed !== null && !placed.isConnected && focusLost;
      /*
       * 연 링크가 지도 시트 안이면 시트가 화면보다 늦게 뜰 수 있다(저장 목록을 마운트 뒤에 읽는 저장 모드). 그때 셸은 이미 h1 '지도' 에
       * 두었고, 시트가 열리면 react-aria 가 `<main>` 을 숨겨 그 h1 이 포커스를 잃는다 — 지켜보는 동안 연 링크가 뜨면 옮긴다(14 W261019.15b).
       */
      const awaitingOpener = placedHeading && arrival.opener !== null && !replaced;
      if (placed === null || replaced || awaitingOpener) {
        const links = arrival.opener ? shownLinksIn(main) : [];
        const paths = links.map(pathOf);
        const openerIndex = arrival.opener ? openerIndexOf(paths, arrival.opener) : -1;
        const heading = headingIn(main);
        const target = focusArrivalTargetOf({
          opener: arrival.opener,
          links: paths,
          hasHeading: heading !== null,
          // 다시 정할 때는 이미 둔 뒤라 "화면이 옮겼나" 를 묻지 않는다 — 떨어뜨린 것은 화면이 아니라 노드 교체다.
          // 늦은 연 링크를 기다리는 동안은 셸이 둔 h1 에서 누가 옮겼나를 본다.
          focusMoved:
            placed === null ? active !== arrival.activeAtArrival : awaitingOpener && !focusLost && active !== placed,
          // `<main>` 밖 층(시트 dialog)이 열리며 스스로 가져간 포커스 — 그 층 안에 연 링크가 있으면 양보받는다.
          focusHoldsOpener:
            openerIndex >= 0 &&
            !main.contains(links[openerIndex]) &&
            !focusLost &&
            active !== null &&
            active.contains(links[openerIndex]),
          headingPlaced: awaitingOpener,
          focusLost,
          lastTry,
        });
        if (target.kind === 'none') return;
        if (target.kind === 'opener') {
          placed = links[target.index];
          placedHeading = false;
          placed.focus({ preventScroll: true });
        } else if (target.kind === 'heading' && heading) {
          placed = heading;
          placedHeading = true;
          focusHeading(heading);
        } else if (target.kind === 'main') {
          placed = main;
          placedHeading = false;
          main.focus({ preventScroll: true });
        }
      }
      if (!lastTry) frame = requestAnimationFrame(attempt);
    };
    attempt();
    return () => cancelAnimationFrame(frame);
  }, [pathname, mainRef]);

  return { arrive };
}
