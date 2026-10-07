'use client';

import { useRouter } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useRef,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import { canGoBackInApp, historyDepth, markReplacedNavigation } from '../../lib/appHistory';
import { normalizeRoute, parentRouteOf } from '../../lib/appRoutes';
import { canStartStackBackAt, isStackRoute, stackTransitionOf, type TStackTransition } from '../../lib/stackTransition';
import {
  AXIS_SLOP_PX,
  SETTLE_EASING,
  STACK_PARALLAX,
  STACK_SLIDE_EASING,
  STACK_SLIDE_MS,
  recentSamples,
  settleDurationOf,
  settleSwipe,
  velocityOf,
  type TSample,
} from '../../lib/swipePager';
import { STUCK_MS } from './appShellSwipe';

/** 덮이는 화면 위에 내려앉는 그늘의 최대 짙기(`bg-overlay` 의 불투명도). 깊이를 말할 만큼만. */
const DIM_OPACITY = 0.12;

/** 떠나기 직전의 `<main>` 한 장. 주소가 바뀌면 React 가 그 자리를 새 화면으로 갈아 끼우므로 그 전에 떠 둔다. */
export type TStackSnapshot = {
  /** 이 장이 그려진 주소. 도착한 이동의 출발지와 같아야 쓴다 — 다르면 엉뚱한 클릭이 남긴 것이다. */
  from: string;
  node: HTMLElement;
  /** 떠날 때의 세로 위치. 스냅샷은 자기 상자 안에서 이 자리를 보여 준다(엿보기와 같은 이유, ADR-014 결정 5). */
  scrollY: number;
};

type TAppShellStackArgs = {
  pathname: string;
  mainRef: RefObject<HTMLElement | null>;
  /** 손가락을 받는 표면(셸의 스와이프 표면과 같은 상자). 잠긴 뒤 세로 스크롤을 막는 데 쓴다. */
  surfaceRef: RefObject<HTMLDivElement | null>;
};

/** 가장자리에서 끌어 걷어 내는 제스처 하나. 탭 페이저(`appShellSwipe`)의 `TGesture` 와 같은 모양이다. */
type TBackGesture = {
  pointerId: number;
  startX: number;
  startY: number;
  /** pending: 아직 방향 모름 / x: 오른쪽으로 잠김 / off: 세로이거나 왼쪽이라 이 제스처는 포기 */
  axis: 'pending' | 'x' | 'off';
  samples: TSample[];
  /** 화면에 옮긴 거리(0 이상 — 왼쪽으로는 갈 곳이 없다). */
  dx: number;
  width: number;
  /** 밑에 깐 장이 물러나 있는 거리(px). 손가락을 따라 0 으로 돌아온다. */
  behind: number;
  sheet: HTMLElement | null;
  dim: HTMLElement | null;
};

const isIOS = () =>
  /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

/**
 * 셸의 뒤로가기를 셸 밖에서 부르는 문. 헤더의 화살표(`AppBar`)와 화면 안의 "저장하고 돌아가기"(`dogProfilePage`)가
 * 같은 길을 타야 한다 — 하나라도 `router.back()` 을 직접 부르면 그 길만 걷히는 그림 없이 갈아 끼워진다.
 * 셸은 레이아웃이라 늘 떠 있으므로 비어 있을 일은 없지만, 비었으면 브라우저에게 맡긴다.
 */
let shellBack: ((backTo: string) => void) | null = null;

export const goBackInApp = (backTo: string) => {
  if (shellBack) shellBack(backTo);
  else if (canGoBackInApp()) window.history.back();
  else window.location.replace(backTo);
};

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** 같은 문서 안의 앱 주소로 가는 평범한 클릭인가 — 새 탭·다운로드·바깥 링크는 화면을 떠나지 않는다. */
const inAppTarget = (event: MouseEvent): string | null => {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
  if (!(anchor instanceof HTMLAnchorElement)) return null;
  if ((anchor.target && anchor.target !== '_self') || anchor.hasAttribute('download')) return null;
  const url = new URL(anchor.href, window.location.href);
  if (url.origin !== window.location.origin) return null;
  return normalizeRoute(url.pathname);
};

/**
 * 셸이 소유하는 쌓이는 화면 전환 — 하위 화면으로 들어가면 오른쪽에서 덮고, 나오면 오른쪽으로 걷는다.
 *
 * 탭바 화면끼리의 좌우 페이저(`appShellSwipe`, ADR-014)와 같은 재료로 만든다 — `<main>` 에 WAAPI 를 걸고, 옆 장은
 * `<main>` 밖 `fixed` 층에 띄운다. 다른 것은 **옆 장이 무엇이냐**다. 페이저의 이웃은 정해져 있어 진짜 화면을 그리면
 * 되지만, 쌓인 화면의 이웃은 **방금 떠난 화면**이라 어떤 화면이든 될 수 있다(상세 → 근처 상세 → …). 그래서 진짜
 * 화면을 다시 그리지 않고 떠나기 직전의 `<main>` 을 **DOM 그대로 복제**해 둔다. 다시 그리면 상세의 미니 지도가
 * 한 번 더 뜨고, 폼이면 입력이 처음으로 돌아간다 — 복제는 그 순간의 모습 그대로다(캔버스만 빈다, 지도 대역과 같은 이유).
 *
 * **떠 두는 시점이 이 파일의 요점이다.** 주소가 바뀐 뒤(layout effect)엔 `<main>` 이 이미 새 화면이다. 그래서
 *   - 들어갈 때: 문서에 **capture** 로 단 click 이 링크를 먼저 본다(Next 의 `<Link>` 는 React 위임이라 그 뒤에 돈다).
 *   - 뒤로/앞으로: `popstate` 를 **capture** 로 듣는다. React 19 는 popstate 안에서 시작된 전환을 그 자리에서 동기로
 *     그려 버려(`shouldAttemptEagerTransition`) Next 의 bubble 리스너 뒤면 이미 늦다.
 *   - 셸의 뒤로가기(`goBack`): 거는 쪽이 직접 뜬다. 갈아 끼우는 뒤로가기(딥링크)는 popstate 가 없다.
 * 떠 둔 것은 **추측**이다 — 그 클릭이 화면을 안 바꿀 수도 있다. 주소가 바뀌면 출발지가 맞는지 보고 쓰거나 버린다.
 *
 * **iOS Safari(브라우저)의 가장자리 뒤로가기는 그리지 않는다.** Safari 가 이미 자기 그림으로 한 장을 걷은 뒤에
 * popstate 를 주므로, 여기서 또 걷으면 같은 화면이 두 번 걷힌다. 홈 화면 앱(standalone)에는 그 제스처가 없다.
 * Navigation API 가 있으면 `hasUAVisualTransition` 이 같은 말을 정확히 한다.
 */
export function useAppShellStack({ pathname, mainRef, surfaceRef }: TAppShellStackArgs) {
  const router = useRouter();
  /** 지금 화면을 떠나기 직전에 떠 둔 것. 다음 주소 변경이 쓰거나 버린다. */
  const candidate = useRef<TStackSnapshot | null>(null);
  /** 셸의 뒤로가기가 건 이동 — 갈아 끼우는 뒤로가기는 깊이가 그대로라 이것으로만 pop 인 줄 안다. */
  const popRequested = useRef(false);
  /** 브라우저가 이미 자기 그림으로 걷은 이동이라 그리지 않는다. */
  const skipNext = useRef(false);
  /** 가장 최근 `navigate` 이벤트가 브라우저 자신의 전환을 동반했나(Navigation API). */
  const uaTransition = useRef(false);
  /**
   * 깊이별로 맡겨 둔 화면. **들어갈 때 떠난 화면**을 그 깊이에 둔다 — 가장자리 스와이프로 걷을 때 밑에 깔 장이다.
   * 걷고 나면 더 깊은 칸은 지운다(다시 들어가면 새로 뜬다).
   */
  const parents = useRef(new Map<number, TStackSnapshot>());
  /** 지금 화면의 주소. popstate 가 올 때 `location` 은 이미 다음 주소라 이것으로 출발지를 적는다. */
  const current = useRef(pathname);
  const running = useRef<Animation[]>([]);
  const layer = useRef<HTMLDivElement | null>(null);
  const gesture = useRef<TBackGesture | null>(null);
  /** 이번 제스처가 스와이프였으면 뒤따르는 click 을 삼킨다(탭 페이저와 같은 규칙). */
  const swiped = useRef(false);
  /**
   * 손가락으로 이미 다 걷어 낸 뒤 주소를 바꾸는 중. 도착하면 **그리지 않고** 층만 치운다 — 밑에 깔았던 장이 곧 도착한 화면이다.
   * 주소가 끝내 안 바뀌면(조각을 못 받음) 제자리로 돌린다 — 화면 밖에 밀어 둔 채 갇히지 않게(`STUCK_MS`, ADR-014).
   */
  const backByGesture = useRef<{ timer: number } | null>(null);
  const stackScreen = isStackRoute(pathname);

  const capture = useCallback((): TStackSnapshot | null => {
    const main = mainRef.current;
    if (!main) return null;
    const node = main.cloneNode(true) as HTMLElement;
    // 복제본은 보여 주기만 한다 — 같은 id 가 둘이면 "본문으로 건너뛰기" 같은 앵커가 엉뚱한 쪽을 가리킨다.
    node.removeAttribute('id');
    node.removeAttribute('tabindex');
    for (const element of node.querySelectorAll('[id]')) element.removeAttribute('id');
    node.style.transform = '';
    return { from: normalizeRoute(current.current), node, scrollY: window.scrollY };
  }, [mainRef]);

  /** 그리던 것을 전부 걷는다 — 애니메이션 취소(`fill: forwards` 는 끝나도 붙들고 있다, ADR-014) · 층 제거 · `<main>` 원상. */
  const stop = useCallback(() => {
    for (const animation of running.current) animation.cancel();
    running.current = [];
    layer.current?.remove();
    layer.current = null;
    const main = mainRef.current;
    if (!main) return;
    for (const property of ['transform', 'position', 'z-index', 'background-color', 'min-height', 'box-shadow', '--swipe-viewport-top']) {
      main.style.removeProperty(property);
    }
  }, [mainRef]);

  /**
   * 스냅샷 한 장을 `<main>` 밖 `fixed` 층에 띄운다. 쌓을 때는 `<main>` **밑**(새 화면이 그 위로 덮는다), 걷을 때는
   * **위**(떠나는 화면이 걷혀 나간다). 그늘은 늘 덮이는 쪽 위에 앉는다.
   */
  const mountLayer = useCallback(
    // 스냅샷이 없으면(딥링크·새로고침 뒤라 부모를 떠 둔 적이 없다) 크림 한 장만 — 지도 대역과 같이, 아직 안 그려진 화면의 모습이다.
    (kind: Exclude<TStackTransition, 'none'>, snapshot: TStackSnapshot | null) => {
      const root = document.createElement('div');
      root.setAttribute('inert', '');
      root.setAttribute('aria-hidden', 'true');
      // 탭바(z-40)는 늘 위 — 화면을 담는 틀이지 화면이 아니다. 사이드바 칸은 비켜 선다.
      root.className = 'pointer-events-none fixed inset-0 md:left-64';
      root.style.zIndex = kind === 'push' ? '20' : '35';

      const sheet = document.createElement('div');
      sheet.className = 'absolute inset-0 overflow-hidden bg-secondary';
      if (snapshot) sheet.appendChild(snapshot.node);
      const dim = document.createElement('div');
      dim.className = 'absolute inset-0 bg-overlay';
      dim.style.opacity = '0';

      // 쌓을 때: [스냅샷, 그늘] — 그늘이 덮이는 스냅샷 위. 걷을 때: [그늘, 스냅샷] — 그늘이 밑의 `<main>` 위.
      if (kind === 'push') root.append(sheet, dim);
      else root.append(dim, sheet);
      /*
       * `body` 가 아니라 **셸 안**(`<main>` 을 담은 칸의 부모 — 탭바와 같은 쌓임 맥락)에 붙인다. 셸 바깥 상자는 `isolate` 라
       * (바탕 발자국의 음수 z 를 가두려고) 그 밖에 붙이면 z 를 몇으로 주든 탭바까지 통째로 덮는다. 이 상자 자체엔 transform 이
       * 없어 `fixed` 는 여전히 화면 기준이다.
       */
      (mainRef.current?.parentElement?.parentElement ?? document.body).appendChild(root);
      // 상자에 붙은 뒤라야 스크롤이 먹는다. 떠날 때의 자리를 그대로 보여 줘야 덮이는 순간 튀지 않는다.
      sheet.scrollTop = snapshot?.scrollY ?? 0;
      layer.current = root;
      return { sheet, dim };
    },
    [mainRef],
  );

  const play = useCallback(
    (kind: Exclude<TStackTransition, 'none'>, snapshot: TStackSnapshot) => {
      const main = mainRef.current;
      if (!main) return;
      // 한 장의 폭 = `<main>` 이 놓인 칸(사이드바를 뺀 나머지). 화면이 넓어도 그 칸 밖에서 들어오고 그 칸 밖으로 나간다.
      const width = main.parentElement?.clientWidth ?? window.innerWidth;
      const { sheet, dim } = mountLayer(kind, snapshot);

      /*
       * `<main>` 은 바탕이 없다(페이지 바탕이 비친다) — 덮을 때 그대로면 밑의 스냅샷이 비쳐 보인다. 움직이는 동안만 불투명하게,
       * 짧은 화면이어도 한 장을 다 덮게. transform 과 `--swipe-viewport-top` 은 같은 프레임에 건다(ADR-014 「결과」).
       */
      main.style.setProperty('--swipe-viewport-top', `${window.scrollY}px`);
      if (kind === 'push') {
        main.style.position = 'relative';
        main.style.zIndex = '25';
        main.style.backgroundColor = 'var(--color-bg-secondary)';
        main.style.minHeight = '100dvh';
        main.style.boxShadow = 'var(--shadow-xl)';
      } else {
        // 걷을 때 `<main>` 은 층 **밑**이라 칠할 것이 없다 — 칠하면 탭 화면 바탕의 발자국(음수 z)이 그동안 가려진다.
        sheet.style.boxShadow = 'var(--shadow-xl)';
      }

      const options: KeyframeAnimationOptions = { duration: STACK_SLIDE_MS, easing: STACK_SLIDE_EASING, fill: 'forwards' };
      // 물러나는 거리는 칸이 아니라 **한 장(`<main>`)** 기준 — 넓은 화면에서 칸 폭의 30% 면 읽던 글이 화면 반을 건너뛴다.
      const behind = `translateX(${-Math.min(width, main.clientWidth) * STACK_PARALLAX}px)`;
      const offscreen = `translateX(${width}px)`;
      running.current =
        kind === 'push'
          ? [
              main.animate({ transform: [offscreen, 'translateX(0px)'] }, options),
              sheet.animate({ transform: ['translateX(0px)', behind] }, options),
              dim.animate({ opacity: [0, DIM_OPACITY] }, options),
            ]
          : [
              main.animate({ transform: [behind, 'translateX(0px)'] }, options),
              sheet.animate({ transform: ['translateX(0px)', offscreen] }, options),
              dim.animate({ opacity: [DIM_OPACITY, 0] }, options),
            ];
      const animations = running.current;
      void Promise.all(animations.map((animation) => animation.finished)).then(
        () => {
          // 그 사이 다른 이동이 새로 그리기 시작했으면 그쪽 것을 건드리지 않는다.
          if (running.current === animations) stop();
        },
        () => undefined,
      );
    },
    [mainRef, mountLayer, stop],
  );

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const to = inAppTarget(event);
      if (to && to !== normalizeRoute(current.current)) candidate.current = capture();
    };
    const onPopState = () => {
      // 셸의 뒤로가기는 거는 쪽이 이미 떴다. 그 밖(브라우저 뒤로·앞으로·안드로이드 뒤로)은 여기서.
      if (popRequested.current) {
        // 되감은 곳이 같은 주소(쿼리만 다름)면 주소가 안 바뀌어 `arrive` 가 안 불린다 — 표식이 남으면 다음 push 를 pop 으로 그린다.
        if (normalizeRoute(window.location.pathname) === normalizeRoute(current.current)) {
          popRequested.current = false;
          candidate.current = null;
        }
        return;
      }
      candidate.current = capture();
      skipNext.current = uaTransition.current || (isIOS() && !isStandalone());
      uaTransition.current = false;
    };
    type TNavigation = EventTarget & { addEventListener: EventTarget['addEventListener'] };
    const navigation = (window as Window & { navigation?: TNavigation }).navigation;
    const onNavigate = (event: Event) => {
      uaTransition.current = (event as Event & { hasUAVisualTransition?: boolean }).hasUAVisualTransition === true;
    };
    document.addEventListener('click', onClick, true);
    window.addEventListener('popstate', onPopState, true);
    navigation?.addEventListener('navigate', onNavigate);
    return () => {
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('popstate', onPopState, true);
      navigation?.removeEventListener('navigate', onNavigate);
    };
  }, [capture]);

  /**
   * 주소가 바뀐 직후 셸이 부른다(layout effect — 그리기 전). 스크롤 복원과 옆 페이저 정리(`finish`)가 **끝난 뒤**여야
   * 한다 — `finish` 는 `<main>` 의 transform 을 지우므로 먼저 걸면 지워진다.
   */
  const arrive = useCallback(
    (from: string, depthDelta: number) => {
      current.current = pathname;
      const byGesture = backByGesture.current;
      backByGesture.current = null;
      if (byGesture) window.clearTimeout(byGesture.timer);
      const snapshot = candidate.current;
      const requested = popRequested.current;
      const skip = skipNext.current;
      candidate.current = null;
      popRequested.current = false;
      skipNext.current = false;
      /*
       * 끄는 도중에 주소가 바뀌었으면(브라우저 뒤로·안드로이드 뒤로) 그 제스처는 여기서 끝난다. 남겨 두면 도착한 곳이 탭 화면일 때
       * `surfaceProps` 가 비어 손을 떼도 아무도 안 비우고, `axis: 'x'` 가 남아 `lockScroll` 이 앱 전체의 세로 스크롤을 막는다.
       * 쌓인 화면이면 손을 뗄 때 `settleBack` 이 이미 걷힌 층으로 한 번 더 뒤로 간다.
       */
      gesture.current = null;
      stop();

      const kind = stackTransitionOf({ from, to: pathname, depthDelta, popRequested: requested });
      const depth = historyDepth();
      for (const key of parents.current.keys()) if (key >= depth) parents.current.delete(key);
      if (kind === 'none' || !snapshot || snapshot.from !== normalizeRoute(from)) return;
      if (kind === 'push') parents.current.set(depth - 1, snapshot);
      if (byGesture || skip || reducedMotion()) return;
      play(kind, snapshot);
    },
    [pathname, play, stop],
  );

  /**
   * 셸의 뒤로가기 — 헤더의 화살표와 화면 안의 "저장하고 돌아가기" 가 같이 쓴다. 되감을 앱 안 화면이 있으면 되감고,
   * 딥링크로 바로 들어와 없으면 `backTo` 로 갈아 끼운다(앱 밖으로 나가지 않게, `lib/appHistory.ts`).
   */
  const goBack = useCallback(
    (backTo: string) => {
      // 갈아 끼울 곳이 지금 주소면 화면이 안 바뀌어 `arrive` 가 안 불린다 — 그때 세운 표식은 다음 이동까지 남는다.
      const rewind = canGoBackInApp();
      const moves = rewind || normalizeRoute(backTo.split(/[?#]/)[0]) !== normalizeRoute(current.current);
      candidate.current = moves ? capture() : null;
      popRequested.current = moves;
      // 이미 거기다 — 갈아 끼우지 않는다. 끼우면 `markReplacedNavigation` 표식도 남아 다음 push 가 깊이를 못 늘린다.
      if (!moves) return;
      if (rewind) {
        router.back();
        return;
      }
      // 항목을 갈아 끼우는 이동이라 깊이는 그대로여야 한다.
      markReplacedNavigation();
      router.replace(backTo);
    },
    [capture, router],
  );

  useEffect(() => {
    shellBack = goBack;
    return () => {
      if (shellBack === goBack) shellBack = null;
    };
  }, [goBack]);

  useEffect(() => stop, [stop]);

  // 잠긴 가로 끌기 동안 세로 스크롤을 막는다 — 탭 페이저와 같은 자리, 같은 방법(`touch-action: pan-y` 만으로는 대각선이 샌다).
  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    const lockScroll = (event: TouchEvent) => {
      if (gesture.current?.axis === 'x') event.preventDefault();
    };
    surface.addEventListener('touchmove', lockScroll, { passive: false });
    return () => surface.removeEventListener('touchmove', lockScroll);
  }, [surfaceRef]);

  /** 손가락이 끈 만큼 — 위 장은 따라가고, 밑 장은 물러난 자리에서 돌아오고, 그늘은 걷힌다. */
  const paintBack = (current: TBackGesture) => {
    const progress = current.width > 0 ? current.dx / current.width : 0;
    if (mainRef.current) mainRef.current.style.transform = `translateX(${current.dx}px)`;
    if (current.sheet) current.sheet.style.transform = `translateX(${-current.behind * (1 - progress)}px)`;
    if (current.dim) current.dim.style.opacity = String(DIM_OPACITY * (1 - progress));
  };

  /**
   * 놓은 자리에서 끝까지(걷기) 또는 제자리로. 걷었으면 주소를 바꾼다 — 밑 장이 이미 제자리라 도착할 때 다시 그리지 않는다.
   * 놓은 뒤의 곡선·시간은 탭 페이저와 같다(`settleDurationOf` · `SETTLE_EASING`) — 손가락이 남긴 속도를 이어받는다.
   */
  const settleBack = (current: TBackGesture, back: boolean, velocity: number) => {
    const main = mainRef.current;
    if (!main) return;
    const toDx = back ? current.width : 0;
    const options: KeyframeAnimationOptions = {
      duration: reducedMotion() ? 0 : settleDurationOf(Math.abs(toDx - current.dx), velocity),
      easing: SETTLE_EASING,
      fill: 'forwards',
    };
    // 앞 그림을 버리기 전에 끈다 — `fill: forwards` 는 참조를 잃어도 `<main>` 을 붙들고 있어 `stop` 으로도 못 걷는다.
    for (const animation of running.current) animation.cancel();
    const animations = [
      main.animate({ transform: `translateX(${toDx}px)` }, options),
      current.sheet?.animate({ transform: `translateX(${back ? 0 : -current.behind}px)` }, options),
      current.dim?.animate({ opacity: back ? 0 : DIM_OPACITY }, options),
    ].filter((animation) => animation !== undefined);
    running.current = animations;
    void Promise.all(animations.map((animation) => animation.finished)).then(
      () => {
        if (running.current !== animations) return;
        if (!back) {
          stop();
          return;
        }
        backByGesture.current = {
          timer: window.setTimeout(() => {
            backByGesture.current = null;
            popRequested.current = false;
            stop();
          }, STUCK_MS),
        };
        // 셸의 뒤로가기와 같은 길 — 되감거나, 딥링크면 부모로 갈아 끼운다. 떠 둘 것은 없다(손가락이 이미 다 걷었다).
        popRequested.current = true;
        candidate.current = null;
        if (canGoBackInApp()) {
          router.back();
        } else {
          markReplacedNavigation();
          router.replace(parentRouteOf(pathname));
        }
      },
      () => undefined,
    );
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    swiped.current = false;
    if (!stackScreen || event.pointerType !== 'touch' || gesture.current) return;
    // 덮거나 걷는 그림이 도는 중이면 받지 않는다 — 애니메이션과 손가락이 같은 `<main>` 을 두고 싸운다.
    if (running.current.length > 0 || backByGesture.current) return;
    if (!canStartStackBackAt(event.clientX, isStandalone())) return;
    // 시트·대화상자 안에서 시작한 제스처는 그쪽 것이다(탭 페이저와 같은 이유 — React 이벤트는 포털을 넘어 온다).
    if (event.target instanceof Element && event.target.closest('[role="dialog"]')) return;
    gesture.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      axis: 'pending',
      samples: [{ x: event.clientX, t: event.timeStamp }],
      dx: 0,
      width: 0,
      behind: 0,
      sheet: null,
      dim: null,
    };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = gesture.current;
    const main = mainRef.current;
    if (!current || !main || current.pointerId !== event.pointerId || current.axis === 'off') return;

    if (current.axis === 'pending') {
      const dx = event.clientX - current.startX;
      const dy = event.clientY - current.startY;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < AXIS_SLOP_PX) return;
      // 세로이거나 왼쪽이면 우리 것이 아니다 — 왼쪽엔 걷어 낼 것이 없다.
      if (Math.abs(dy) > Math.abs(dx) || dx < 0) {
        current.axis = 'off';
        return;
      }
      current.axis = 'x';
      current.startX = event.clientX;
      current.samples = [{ x: event.clientX, t: event.timeStamp }];
      current.width = main.parentElement?.clientWidth ?? window.innerWidth;
      current.behind = Math.min(current.width, main.clientWidth) * STACK_PARALLAX;
      swiped.current = true;
      // 밑에 깔 장 = 들어올 때 떠 둔 부모. 쌓을 때와 같은 층·같은 `<main>` 차림이다.
      const { sheet, dim } = mountLayer('push', parents.current.get(historyDepth() - 1) ?? null);
      current.sheet = sheet;
      current.dim = dim;
      main.style.setProperty('--swipe-viewport-top', `${window.scrollY}px`);
      main.style.position = 'relative';
      main.style.zIndex = '25';
      main.style.backgroundColor = 'var(--color-bg-secondary)';
      main.style.minHeight = '100dvh';
      main.style.boxShadow = 'var(--shadow-xl)';
      paintBack(current);
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // 그 사이 pointercancel 이 왔으면 cancel 핸들러가 제자리로 돌린다.
      }
      return;
    }

    const sample = { x: event.clientX, t: event.timeStamp };
    current.samples = [...recentSamples(current.samples, sample.t), sample];
    current.dx = Math.max(0, event.clientX - current.startX);
    paintBack(current);
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    gesture.current = null;
    if (current.axis !== 'x') return;
    const velocity = velocityOf(recentSamples(current.samples, event.timeStamp));
    // 두 칸짜리 페이저 — 0 이 부모, 1 이 지금. 넘어가는 문턱·플릭은 옆 페이저와 같다.
    const target = settleSwipe({ index: 1, count: 2, dx: current.dx, velocity, width: current.width });
    settleBack(current, target === 0, velocity);
  };

  const onPointerCancel = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    gesture.current = null;
    if (current.axis === 'x') settleBack(current, false, 0);
  };

  const onClickCapture = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!swiped.current) return;
    event.preventDefault();
    event.stopPropagation();
  };

  return {
    arrive,
    goBack,
    /** 쌓인 화면이면 가로 끌기를 받는다(`touch-action: pan-y`). 탭 화면은 탭 페이저가 받는다 — 둘은 겹치지 않는다. */
    enabled: stackScreen,
    surfaceProps: stackScreen ? { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onClickCapture } : {},
  };
}
