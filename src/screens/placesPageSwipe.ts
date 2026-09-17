'use client';

import { useRouter } from 'next/navigation';
import {
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import { arriveBySwipe } from './placesPageTypeSwitch';
import { PLACE_TYPES } from '../lib/places';
import { resistedOffset, settleSwipe } from '../lib/swipePager';
import type { TPlaceType } from '../types';

/** 이만큼(px) 움직이기 전엔 세로 스크롤인지 가로 스와이프인지 정하지 않는다. */
const AXIS_SLOP_PX = 10;
/** 화면 왼쪽 가장자리 이 폭(px)에서 시작한 제스처는 iOS Safari 의 뒤로가기라 건드리지 않는다. */
const BACK_SWIPE_EDGE_PX = 24;
/** 놓은 뒤 남은 거리를 밀어내는 시간. 알약이 탭 클릭으로 움직일 때와 같은 곡선(placesPageTypeTabs). */
const SETTLE_MS = 260;
const SETTLE_EASING = 'cubic-bezier(0.16, 1, 0.3, 1)';
/**
 * 속도는 이 구간(ms) 안의 샘플로 잰다. 마지막 두 move 만 보면 손가락이 떨어지기 직전 잠깐
 * 멈칫한 것이 0 으로 읽혀 플릭이 죽는다(실기에서 "끝까지 끌어야 넘어간다" 로 느껴진 원인).
 */
const VELOCITY_WINDOW_MS = 100;

export type TPlacesPagePeek = {
  /** 이웃 종류. 끝이라 이웃이 없으면 null. */
  left: TPlaceType | null;
  right: TPlaceType | null;
  /** 무대 안에서 엿보기가 차지할 세로 자리(px). 지금 보이는 영역(헤더 아래 ~ 화면 끝)과 맞춘다. */
  top: number;
  height: number;
};

type TSample = { x: number; t: number };

type TGesture = {
  pointerId: number;
  startX: number;
  startY: number;
  /** pending: 아직 방향 모름 / x: 가로로 잠김 / off: 세로라서 이 제스처는 포기 */
  axis: 'pending' | 'x' | 'off';
  /** 최근 VELOCITY_WINDOW_MS 안의 move 들. pointerup 은 마지막 move 와 같은 자리라 그걸로 재면 늘 0 이다. */
  samples: TSample[];
  /** 화면에 옮긴 거리(끝 저항 적용 후). */
  dx: number;
  width: number;
};

/**
 * 숙소·식당·카페를 손가락으로 좌우로 넘기기.
 *
 * 세 종류는 각각 다른 주소(`/places/[type]`)이고 종류를 바꾸면 화면이 통째로 리마운트된다.
 * 그래서 세 목록을 한 줄에 늘어놓고 미는 캐러셀은 만들 수 없다 — 대신:
 *
 * 1. 손가락이 가로로 잠기면 지금 목록(`currentRef`)과 탭의 알약(`pillRef`)을 손가락 비율대로
 *    끌고, 이웃 목록을 옆에 **엿보기**(`peek`)로 띄운다. 엿보기는 절대 위치라 문서 높이도
 *    스크롤도 건드리지 않고, 새 화면이 마운트됐을 때와 같은 모습(맨 위·기본 조건)이다.
 * 2. 놓으면 남은 거리를 WAAPI 로 밀어낸 뒤 주소를 바꾼다. 새 화면은 스크롤 0 에서 뜨므로
 *    엿보기와 픽셀이 이어진다. 그 새 화면이 또 한 번 미끄러지지 않도록 `arriveBySwipe`.
 *
 * 드래그 중 좌표는 React 상태가 아니라 ref 로 DOM 에 직접 쓴다. 바텀시트(bottom-sheet.tsx)는
 * state 로 두지만 그건 작은 시트 하나라서고, 여기서 pointermove 마다 state 를 바꾸면 카드
 * 수십 장이 매 프레임 리렌더된다. 리액트가 알아야 하는 것은 "엿보기를 그릴지" 뿐이다.
 *
 * 터치만 받는다. 마우스로 목록을 끄는 동작은 데스크톱에서 어색하고, 거기선 탭이 있다.
 * 표면에는 `touch-action: pan-y` 가 걸려 있어야 한다 — 세로는 브라우저가 스크롤로 가져가고
 * (그때 pointercancel 이 온다), 가로만 여기로 온다. `none` 을 걸면 세로 스크롤이 죽는다.
 *
 * 다만 **가로로 잠긴 뒤에는 세로 스크롤을 잠근다.** `pan-y` 는 "세로는 브라우저가 가져가도
 * 된다" 는 뜻이라, iOS Safari 는 가로로 끄는 도중 손가락이 위아래로 흐르면 스크롤을 시작해
 * 목록이 옆으로도 위로도 같이 움직인다. 잠긴 동안 touchmove 의 기본 동작을 막으면 그 터치는
 * 스크롤이 되지 못한다. React 의 onTouchMove 는 passive 로 붙어 preventDefault 가 무시되므로
 * 네이티브 리스너를 `{ passive: false }` 로 단다.
 */
export function usePlacesPageSwipe(type: TPlaceType, headerRef: RefObject<HTMLElement | null>) {
  const router = useRouter();
  const index = PLACE_TYPES.indexOf(type);
  const count = PLACE_TYPES.length;

  const stageRef = useRef<HTMLDivElement>(null);
  const currentRef = useRef<HTMLDivElement>(null);
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);

  const [peek, setPeek] = useState<TPlacesPagePeek | null>(null);
  const gesture = useRef<TGesture | null>(null);
  /** 놓고 나서 밀어내는 동안. 이때 새 제스처를 받으면 애니메이션과 손가락이 싸운다. */
  const settling = useRef(false);
  /** 이번 제스처가 스와이프였으면 뒤따르는 click(카드 링크)을 삼킨다. 다음 pointerdown 에서 풀린다. */
  const swiped = useRef(false);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const lockScroll = (event: TouchEvent) => {
      if (gesture.current?.axis === 'x') event.preventDefault();
    };
    // 터치 이벤트는 포인터 캡처와 무관하게 처음 닿은 요소로 가는데, 그 요소는 늘 무대 안이다.
    stage.addEventListener('touchmove', lockScroll, { passive: false });
    return () => stage.removeEventListener('touchmove', lockScroll);
  }, []);

  const paint = (dx: number, width: number) => {
    if (currentRef.current) currentRef.current.style.transform = `translateX(${dx}px)`;
    if (leftRef.current) leftRef.current.style.transform = `translateX(calc(-100% + ${dx}px))`;
    if (rightRef.current) rightRef.current.style.transform = `translateX(calc(100% + ${dx}px))`;
    if (pillRef.current) {
      // 알약은 자기 폭(탭 하나)의 100% 단위라 소수 자리가 그대로 맞는다. 끝 저항으로 살짝 넘친
      // 만큼은 잘라 알약이 테두리 밖으로 나가지 않게 한다.
      const at = Math.min(count - 1, Math.max(0, index - dx / width));
      pillRef.current.style.transform = `translateX(${at * 100}%)`;
    }
  };

  const settle = (target: number, width: number) => {
    settling.current = true;
    const toDx = target === index ? 0 : target > index ? -width : width;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const options: KeyframeAnimationOptions = {
      duration: reduceMotion ? 0 : SETTLE_MS,
      easing: SETTLE_EASING,
      fill: 'forwards',
    };
    // 키프레임을 하나만 주면 지금 그려진 자리(인라인 transform)에서 출발한다.
    const animations = [
      currentRef.current?.animate({ transform: `translateX(${toDx}px)` }, options),
      leftRef.current?.animate({ transform: `translateX(calc(-100% + ${toDx}px))` }, options),
      rightRef.current?.animate({ transform: `translateX(calc(100% + ${toDx}px))` }, options),
      pillRef.current?.animate({ transform: `translateX(${target * 100}%)` }, options),
    ].filter((animation) => animation !== undefined);

    void Promise.all(animations.map((animation) => animation.finished)).then(
      () => {
        if (target !== index) {
          // 밀어낸 자리를 그대로 둔 채(fill: forwards) 주소만 바꾼다 — 새 화면이 그 자리에서 뜬다.
          // 밀어내는 사이 탭을 눌러 이미 그 주소에 가 있으면 한 번 더 밀지 않는다.
          const next = PLACE_TYPES[target];
          if (window.location.pathname.startsWith(`/places/${next}`)) return;
          arriveBySwipe(next);
          router.push(`/places/${next}`);
          return;
        }
        for (const animation of animations) animation.cancel();
        for (const ref of [currentRef, leftRef, rightRef, pillRef]) {
          if (ref.current) ref.current.style.transform = '';
        }
        setPeek(null);
        settling.current = false;
      },
      // 애니메이션이 취소되면(언마운트) 할 일이 없다.
      () => undefined,
    );
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    swiped.current = false;
    if (event.pointerType !== 'touch' || settling.current || gesture.current) return;
    if (event.clientX < BACK_SWIPE_EDGE_PX) return;
    const sample = { x: event.clientX, t: event.timeStamp };
    gesture.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      axis: 'pending',
      samples: [sample],
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
      const stage = stageRef.current;
      const header = headerRef.current;
      if (!stage || !header) return;

      current.axis = 'x';
      // 방향을 정하는 데 쓴 거리는 버리고 여기서부터 0 으로 센다 — 잠기는 순간 목록이 10px 튀지 않게.
      current.startX = event.clientX;
      current.width = stage.clientWidth;
      current.samples = [{ x: event.clientX, t: event.timeStamp }];
      swiped.current = true;

      // 엿보기는 "지금 보이는 영역" 에 맞춘다. 목록을 한참 내려 본 상태라도 이웃은 맨 위부터
      // 보여야 새 화면(스크롤 0)과 이어진다.
      const stageTop = stage.getBoundingClientRect().top;
      const visibleTop = Math.max(stageTop, header.getBoundingClientRect().bottom);
      setPeek({
        left: index > 0 ? PLACE_TYPES[index - 1] : null,
        right: index < count - 1 ? PLACE_TYPES[index + 1] : null,
        top: visibleTop - stageTop,
        height: window.innerHeight - visibleTop,
      });
      // 손가락이 무대 밖(헤더·탭바)으로 나가도 move/up 을 계속 받는다. 포인터가 이미 사라졌으면
      // (그 사이 pointercancel) 던지는데, 그 경우 cancel 핸들러가 제자리로 돌리므로 삼켜도 된다.
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // 위 참고.
      }
      return;
    }

    const sample = { x: event.clientX, t: event.timeStamp };
    current.samples = [...current.samples.filter((s) => sample.t - s.t <= VELOCITY_WINDOW_MS), sample];
    current.dx = resistedOffset(event.clientX - current.startX, index, count);
    paint(current.dx, current.width);
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    gesture.current = null;
    if (current.axis !== 'x') return;

    const { dx, width } = current;
    // 멈춘 채로 있다가 떼면 move 가 안 오므로 오래된 샘플이 그대로 남는다 — 떼는 시각 기준으로 다시 거른다.
    const samples = current.samples.filter((s) => event.timeStamp - s.t <= VELOCITY_WINDOW_MS);
    const first = samples[0];
    const last = samples[samples.length - 1];
    const velocity = samples.length > 1 ? (last.x - first.x) / Math.max(1, last.t - first.t) : 0;
    settle(settleSwipe({ index, count, dx, velocity, width }), width);
  };

  const onPointerCancel = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    gesture.current = null;
    // 브라우저가 제스처를 가져갔다(세로 스크롤 등). 넘어가지 않고 제자리로.
    if (current.axis === 'x') settle(index, current.width);
  };

  const onClickCapture = (event: MouseEvent<HTMLDivElement>) => {
    if (!swiped.current) return;
    event.preventDefault();
    event.stopPropagation();
  };

  return {
    peek,
    stageRef,
    currentRef,
    leftRef,
    rightRef,
    pillRef,
    stageProps: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onClickCapture },
  };
}
