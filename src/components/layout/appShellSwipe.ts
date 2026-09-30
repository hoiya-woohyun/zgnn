'use client';

import { useRouter } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  SWIPE_ROUTES,
  canStartSwipeAt,
  hasSwipeSurface,
  isWithinPlacesSwipe,
  normalizeRoute,
  swipeIndexOf,
  takesHorizontalPan,
} from '../../lib/appRoutes';
import { rememberScroll } from '../../lib/appScroll';
import { PLACE_TYPES } from '../../lib/places';
import {
  AXIS_SLOP_PX,
  BACK_SWIPE_EDGE_PX,
  SETTLE_EASING,
  SETTLE_MS,
  recentSamples,
  resistedOffset,
  settleSwipe,
  velocityOf,
  type TSample,
} from '../../lib/swipePager';
import { arriveBySwipe } from '../../screens/placesPageTypeSwitch';

/**
 * 주소를 바꿔 놓고 이만큼(ms) 기다려도 화면이 안 바뀌면 되돌린다.
 *
 * 밀어낸 화면은 `fill: forwards` 로 화면 밖에 세워 둔 채 주소만 바꾼다. 그 주소의 조각을
 * 받아오지 못하면(첫 방문 + 끊긴 망) 사용자는 **빈 화면 앞에 갇힌다** — 탭바만 남고 아무것도
 * 없으니 새로고침 말고는 길이 없다. 그럴 바엔 제자리로 돌려놓고 "안 넘어갔다" 로 보이는 편이 낫다.
 */
const STUCK_MS = 1500;

export type TAppShellPeek = {
  /** 이웃 두 칸. 그 방향으로 셸이 넘길 곳이 없으면 null(= 끝이라 저항만 준다). */
  left: string | null;
  right: string | null;
  /**
   * 엿보기 한 장의 폭(px) = 지금 `<main>` 의 폭.
   *
   * `100%` 로 두면 안 된다. 화면 폭이 넓으면 `<main>` 은 `max-w-3xl` 에서 멈추는데 엿보기 상자는
   * 칸(사이드바를 뺀 나머지)을 다 차지해, 끄는 동안 둘 사이에 빈 크림 띠가 벌어진다.
   * 태블릿 가로(1180px)처럼 **터치가 되는 넓은 화면**에서 실제로 보이는 차이다.
   */
  width: number;
};

type TGesture = {
  pointerId: number;
  startX: number;
  startY: number;
  /** pending: 아직 방향 모름 / x: 가로로 잠김 / off: 세로이거나 둘러보기 안이라 이 제스처는 포기 */
  axis: 'pending' | 'x' | 'off';
  samples: TSample[];
  /** 화면에 옮긴 거리(끝 저항 적용 후). */
  dx: number;
  width: number;
};

/** 둘러보기로 도착하면 "직전에 보던 종류" 를 도착점으로 찍는다(없는 주소면 아무것도 안 한다). */
const markPlacesArrival = (route: string) => {
  const type = PLACE_TYPES.find((value) => route === `/places/${value}`);
  if (type) arriveBySwipe(type);
};

/**
 * 셸이 소유하는 좌우 스와이프 — 홈 · 지도 · 둘러보기 · 준비물 · 설정 사이를 손가락으로 넘긴다.
 *
 * 산수와 느낌은 둘러보기 안의 전환과 **같은 것을 쓴다**(`lib/swipePager.ts`). 다른 것은 무엇이
 * 움직이느냐뿐이다 — 거기서는 헤더를 세워 둔 채 목록과 알약만 끌지만, 여기서는 `<main>` 을
 * 통째로 끈다. 화면이 통째로 바뀌는 이동이라 헤더만 남아 있으면 그게 더 이상하다.
 * 탭바는 움직이지 않는다 — 화면들을 담는 틀이지 화면이 아니다.
 *
 * **이웃은 자리 두 칸으로만 센다.** `SWIPE_ROUTES` 는 일곱 칸이지만, 그중 둘러보기 안에서
 * 끝나는 이동은 화면 쪽이 가져간다(`isWithinPlacesSwipe`). 그래서 여기서 쓰는 페이저는 늘
 * "왼쪽·지금·오른쪽" 최대 세 칸짜리이고, 셸이 갈 수 없는 쪽은 아예 없는 칸으로 둔다 —
 * `lib/swipePager.ts` 의 끝 저항이 그 쪽에 그대로 걸린다. 숙소에서 오른쪽으로 끌다 마음을
 * 바꿔 왼쪽으로 지나쳐도 식당으로 넘어가지 않고 튕기는 이유가 이것이다. 방향이 정해지는
 * 순간 주인이 정해지고, 한 제스처의 주인은 끝까지 바뀌지 않는다.
 *
 * 도착점은 맨 위가 아니라 **그 화면을 떠날 때의 자리**다(`lib/appScroll.ts`). 나란히 떠 있는
 * 것처럼 넘기는 화면이 매번 맨 위로 되감기면 나란한 것이 아니라 매번 새로 여는 것이 된다.
 * 그래서 넘어가기 직전에 지금 자리를 적어 두고, `router.push` 에는 `scroll: false` 를 준다 —
 * Next 의 기본 스크롤 리셋과 셸의 복원이 같은 프레임에 싸우면 어느 쪽이 이겼는지 알 수 없다.
 *
 * 나머지 손가락 규칙(축 고정 10px · iOS 뒤로가기 24px · 세로 스크롤 잠금 · 스와이프 뒤 click
 * 삼키기 · 모션 줄임)은 전부 `screens/placesPageSwipe.ts` 와 같고, 이유도 거기 적혀 있다.
 */
export function useAppShellSwipe(pathname: string) {
  const router = useRouter();
  const index = swipeIndexOf(pathname);
  const hasSurface = hasSwipeSurface(pathname);
  const enabled = takesHorizontalPan(pathname);

  const leftRoute = index > 0 && !isWithinPlacesSwipe(index, index - 1) ? SWIPE_ROUTES[index - 1] : null;
  const rightRoute =
    index >= 0 && index < SWIPE_ROUTES.length - 1 && !isWithinPlacesSwipe(index, index + 1)
      ? SWIPE_ROUTES[index + 1]
      : null;
  // 세 칸짜리 미니 페이저의 자리. 갈 수 없는 쪽은 칸 자체가 없어 끝 저항이 걸린다.
  const slot = leftRoute ? 1 : 0;
  const slots = 1 + (leftRoute ? 1 : 0) + (rightRoute ? 1 : 0);

  const surfaceRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);

  const [peek, setPeek] = useState<TAppShellPeek | null>(null);
  const gesture = useRef<TGesture | null>(null);
  /** 놓고 나서 밀어내는 동안. 이때 새 제스처를 받으면 애니메이션과 손가락이 싸운다. */
  const settling = useRef(false);
  /** 이번 제스처가 스와이프였으면 뒤따르는 click(카드 링크)을 삼킨다. */
  const swiped = useRef(false);
  /**
   * 지금 밀어내고 있는 애니메이션들.
   *
   * **`fill: forwards` 라 끝나도 요소를 계속 붙들고 있다** — 취소하지 않으면 인라인 transform 을
   * 지워도 화면은 그 자리에 남고, 무엇보다 `<main>` 이 계속 transform 을 가진 것으로 쳐져
   * 그 안의 `position: fixed` 가 화면 기준으로 돌아오지 않는다(실측: 되돌린 뒤 축약 줄이
   * 화면 위로 사라졌다). 그래서 넘어갔든 되돌아왔든 `finish` 에서 반드시 취소한다.
   */
  const running = useRef<Animation[]>([]);
  /** 주소를 바꿔 놓고 화면이 오기를 기다리는 중. 안 오면 되돌리려고 타이머만 들고 있다. */
  const pending = useRef<{ timer: number } | null>(null);

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    const lockScroll = (event: TouchEvent) => {
      if (gesture.current?.axis === 'x') event.preventDefault();
    };
    surface.addEventListener('touchmove', lockScroll, { passive: false });
    return () => surface.removeEventListener('touchmove', lockScroll);
  }, []);

  /**
   * 밀던 것을 전부 제자리로 되돌리고 엿보기를 치운다.
   *
   * 되돌아온 경우(제자리)와 넘어간 경우(새 화면이 도착) 둘 다 여기로 끝난다. 넘어간 쪽은
   * 셸이 주소가 바뀐 것을 보고 부르는데, 그때 `<main>` 안은 이미 **새 화면**이라 화면 밖에
   * 세워 둔 transform 만 지우면 그 자리에 들어앉는다. 브라우저가 그리기 전(layout effect)에
   * 해야 한 프레임도 비지 않는다.
   */
  const finish = useCallback(() => {
    const waiting = pending.current;
    pending.current = null;
    if (waiting) window.clearTimeout(waiting.timer);
    for (const animation of running.current) animation.cancel();
    running.current = [];
    for (const ref of [mainRef, leftRef, rightRef]) {
      if (ref.current) ref.current.style.transform = '';
    }
    mainRef.current?.style.removeProperty('--swipe-viewport-top');
    setPeek(null);
    settling.current = false;
    // 셸이 경로 이펙트에서 부르므로 매 렌더 새로 만들면 안 된다 — ref 와 setPeek 만 쓰니 고정할 수 있다.
  }, []);

  const paint = (dx: number) => {
    if (mainRef.current) mainRef.current.style.transform = `translateX(${dx}px)`;
    if (leftRef.current) leftRef.current.style.transform = `translateX(calc(-100% + ${dx}px))`;
    if (rightRef.current) rightRef.current.style.transform = `translateX(calc(100% + ${dx}px))`;
  };

  const settle = (target: number, width: number) => {
    settling.current = true;
    const toDx = target === slot ? 0 : target > slot ? -width : width;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const options: KeyframeAnimationOptions = {
      duration: reduceMotion ? 0 : SETTLE_MS,
      easing: SETTLE_EASING,
      fill: 'forwards',
    };
    // 키프레임을 하나만 주면 지금 그려진 자리(인라인 transform)에서 출발한다.
    const animations = [
      mainRef.current?.animate({ transform: `translateX(${toDx}px)` }, options),
      leftRef.current?.animate({ transform: `translateX(calc(-100% + ${toDx}px))` }, options),
      rightRef.current?.animate({ transform: `translateX(calc(100% + ${toDx}px))` }, options),
    ].filter((animation) => animation !== undefined);
    running.current = animations;

    const route = target === slot ? normalizeRoute(pathname) : ((target > slot ? rightRoute : leftRoute) ?? null);

    void Promise.all(animations.map((animation) => animation.finished)).then(
      () => {
        // 엿보기가 둘러보기였다면 그 마운트가 "직전에 보던 종류" 를 덮어썼다 — 어디에 서든 도착점으로 다시 찍는다.
        if (route) markPlacesArrival(route);
        if (!route || route === normalizeRoute(window.location.pathname)) {
          finish();
          return;
        }
        rememberScroll(pathname, window.scrollY);
        pending.current = {
          timer: window.setTimeout(() => {
            if (normalizeRoute(window.location.pathname) !== route) finish();
          }, STUCK_MS),
        };
        // 스크롤 복원은 셸이 한다 — Next 가 맨 위로 되감으면 엿보기가 보여 준 자리와 어긋난다.
        router.push(route, { scroll: false });
      },
      // 애니메이션이 취소되면(언마운트) 할 일이 없다.
      () => undefined,
    );
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    swiped.current = false;
    if (!hasSurface || event.pointerType !== 'touch' || settling.current || gesture.current) return;
    if (event.clientX < BACK_SWIPE_EDGE_PX) return;
    // 지도는 가장자리 띠에서만 시작한다(canStartSwipeAt). 위의 왼쪽 24px 가드는 그것과 별개로 늘 선다.
    if (!canStartSwipeAt(pathname, event.clientX, window.innerWidth)) return;
    /*
     * 시트·대화상자 안에서 시작한 제스처는 그쪽 것이다. 바텀시트는 react-aria 가 포털로
     * 띄우지만 **React 이벤트는 포털을 넘어 컴포넌트 트리로 거슬러 올라오므로** 여기까지
     * 온다 — 걸러 내지 않으면 열린 시트 안에서 옆으로 쓸었을 때 뒤에 깔린 화면이 넘어간다.
     * (둘러보기 안의 인식기는 무대가 헤더 바깥이라 시트 이벤트를 아예 못 본다.)
     */
    if (event.target instanceof Element && event.target.closest('[role="dialog"]')) return;
    gesture.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      axis: 'pending',
      samples: [{ x: event.clientX, t: event.timeStamp }],
      dx: 0,
      width: 0,
    };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId || current.axis === 'off') return;

    if (current.axis === 'pending') {
      const dx = event.clientX - current.startX;
      const dy = event.clientY - current.startY;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < AXIS_SLOP_PX) return;
      if (Math.abs(dy) > Math.abs(dx)) {
        current.axis = 'off';
        return;
      }
      // 둘러보기 안에서 끝나는 이동은 화면 쪽(placesPageSwipe)이 가져간다 — 같은 질문, 반대 답.
      if (isWithinPlacesSwipe(index, index + (dx < 0 ? 1 : -1))) {
        current.axis = 'off';
        return;
      }
      const surface = surfaceRef.current;
      if (!surface) return;

      current.axis = 'x';
      // 방향을 정하는 데 쓴 거리는 버리고 여기서부터 0 으로 센다 — 잠기는 순간 화면이 10px 튀지 않게.
      current.startX = event.clientX;
      // 나가는 화면과 들어오는 엿보기가 같은 폭으로 움직여야 사이가 벌어지지 않는다.
      current.width = mainRef.current?.clientWidth ?? surface.clientWidth;
      current.samples = [{ x: event.clientX, t: event.timeStamp }];
      swiped.current = true;
      /*
       * `<main>` 에 transform 이 걸리는 순간, 그 안의 `position: fixed` 는 화면이 아니라
       * `<main>` 을 기준으로 잡힌다 — `top: 0` 이 문서 맨 위를 가리키게 되어 내려 본 상태에서는
       * 화면 밖으로 사라진다. 지금 스크롤 값을 넘겨 그만큼 상쇄시킨다(`top: var(--swipe-viewport-top, 0px)`).
       * 잠긴 뒤로는 세로 스크롤을 막으므로 이 값은 제스처 내내 유효하다.
       * 첫 사용처였던 축약 줄(`collapsingTitleBar`)은 v22 에 sticky 제목 줄로 바뀌어 지금 이 변수를 읽는 곳은 없다 —
       * `<main>` 안에 `fixed` 를 새로 두면 이 변수를 쓴다(CLAUDE.md 「조용히 깨지는 것들」).
       */
      mainRef.current?.style.setProperty('--swipe-viewport-top', `${window.scrollY}px`);
      // 같은 프레임에 transform 도 건다. 변수만 걸린 한 프레임은 상쇄할 대상이 없어 그만큼 아래로 튄다.
      paint(0);
      setPeek({ left: leftRoute, right: rightRoute, width: current.width });
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // 포인터가 이미 사라졌으면(그 사이 pointercancel) cancel 핸들러가 제자리로 돌린다.
      }
      return;
    }

    const sample = { x: event.clientX, t: event.timeStamp };
    current.samples = [...recentSamples(current.samples, sample.t), sample];
    current.dx = resistedOffset(event.clientX - current.startX, slot, slots);
    paint(current.dx);
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    gesture.current = null;
    if (current.axis !== 'x') return;

    const { dx, width } = current;
    const velocity = velocityOf(recentSamples(current.samples, event.timeStamp));
    settle(settleSwipe({ index: slot, count: slots, dx, velocity, width }), width);
  };

  const onPointerCancel = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    gesture.current = null;
    // 브라우저가 제스처를 가져갔다(세로 스크롤 등). 넘어가지 않고 제자리로.
    if (current.axis === 'x') settle(slot, current.width);
  };

  const onClickCapture = (event: MouseEvent<HTMLDivElement>) => {
    if (!swiped.current) return;
    event.preventDefault();
    event.stopPropagation();
  };

  return {
    peek,
    finish,
    /** 지도에서는 `touch-action` 을 걸면 안 된다 — 지도를 끄는 동작까지 브라우저가 가로챈다. */
    enabled,
    surfaceRef,
    mainRef,
    leftRef,
    rightRef,
    /** 탭바 밖 화면(하위 화면)에서는 아예 달지 않는다. 지도는 달되 가장자리에서만 시작한다. */
    surfaceProps: hasSurface
      ? { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onClickCapture }
      : {},
  };
}
