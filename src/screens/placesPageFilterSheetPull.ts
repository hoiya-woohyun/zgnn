'use client';

import { useCallback, useEffect, useRef, type RefObject } from 'react';

/**
 * 필터 시트를 **본문에서** 끌어내려 닫기(14 W261010.33k).
 *
 * base 시트(`components/base/bottom-sheet`)는 위쪽 손잡이 띠에서만 끌린다 — 시트 전체에 `touch-action: none`
 * 을 걸면 안쪽 목록이 안 넘어가서다(그 파일 주석). 그런데 손잡이는 28px 띠라 본문을 끌어내리는 손가락은 아무 일도
 * 못 했다. 그래서 감싸는 쪽이 **포인터가 아니라 터치 이벤트**로 본문 끌기를 따로 받는다: 포인터로 받으면 브라우저가
 * 스크롤로 가져가며 `pointercancel` 을 보내지만, 터치는 첫 `touchmove` 를 `preventDefault` 해 스크롤을 안 시작시킬 수 있다.
 *
 * 다투지 않는 규칙 — 끌기로 잡는 것은 **첫 `touchmove` 한 번에** 정하고 끝까지 안 바꾼다:
 * - 목록이 맨 위(또는 닿은 곳이 목록 밖 — 제목·하단 줄)이고, 아래로, 옆보다 세로가 크면 → 시트를 끈다.
 * - 그 밖은 전부 브라우저 몫이다. 목록이 내려가 있으면 끌어도 목록만 올라가고, 맨 위에 닿아도 그 제스처는 닫기로
 *   넘어가지 않는다(손을 떼고 다시 끌면 닫힌다). 맨 위에서 위로 쓸면 목록이 내려간다.
 * - "몇 px 지나서 정하기" 는 안 된다. Chrome 은 스크롤이 시작된 뒤의 `touchmove` 를 취소할 수 없게(`cancelable: false`) 보낸다.
 */

/** base 손잡이와 같은 문턱(그 파일의 DISMISS_DISTANCE_PX · DISMISS_VELOCITY — export 되지 않아 값을 옮겨 적는다). */
export const PULL_DISMISS_DISTANCE_PX = 96;
export const PULL_DISMISS_VELOCITY = 0.6;

/**
 * Tailwind `sm` — base 시트가 가운데 대화상자로 바뀌고 손잡이도 숨는 폭. 거기선 끌어내리는 동작이 없다.
 * 필터 버튼은 `md:hidden` 이라 640~767px 에서도 이 시트가 뜬다.
 */
const SHEET_DIALOG_QUERY = '(min-width: 40rem)';

/** 끌기를 놓은 뒤 이만큼(ms) 안에 오는 click 만 그 끌기의 것으로 친다. */
const CLICK_AFTER_PULL_MS = 400;

type TPullFirstMove = {
  dx: number;
  dy: number;
  /** 닿은 곳이 안쪽 스크롤 칸 안인가. 밖(제목·하단 줄)이면 스크롤과 다툴 것이 없다. */
  inScroller: boolean;
  /** 닿은 순간의 스크롤 칸 `scrollTop`. iOS 고무줄 튕김에선 음수다. */
  scrollTop: number;
  /** 첫 `touchmove` 가 취소 가능한가 — 아니면 브라우저가 이미 스크롤로 가져갔다. */
  cancelable: boolean;
};

/** 첫 `touchmove` 에서 이 제스처를 시트 끌기로 잡을지. */
export function takesSheetPull({ dx, dy, inScroller, scrollTop, cancelable }: TPullFirstMove): boolean {
  if (!cancelable || dy <= 0 || dy < Math.abs(dx)) return false;
  return !inScroller || scrollTop < 1;
}

/** 놓았을 때 닫을지. 짧아도 빠르게 튕기면(px/ms) 닫는다. */
export function dismissesSheetPull(distance: number, velocity: number): boolean {
  return distance > PULL_DISMISS_DISTANCE_PX || velocity > PULL_DISMISS_VELOCITY;
}

type TSample = { y: number; t: number };

type TGesture = {
  id: number;
  x: number;
  y: number;
  inScroller: boolean;
  scrollTop: number;
  mode: 'pending' | 'pull' | 'off';
  // 속도는 마지막 두 move 사이로 잰다 — base 와 같다(touchend 는 마지막 move 와 같은 자리라 그걸로 재면 늘 0).
  prev: TSample;
  last: TSample;
  /** 끌고 있는 시트 판과, 끌기 전 인라인 값(되돌릴 때 그대로 돌려놓는다 — React 가 다시 써 주지 않는다). */
  dialog?: HTMLElement;
  saved?: { transform: string; transition: string };
};

const touchOf = (list: TouchList, id: number) => Array.from(list).find((touch) => touch.identifier === id);

/**
 * `column`(시트 안 내용 전체)에 본문 끌기를 붙인다. 돌려주는 함수가 뗀다.
 *
 * 손가락을 따라가는 것은 base 손잡이와 **같은 요소**(시트 판, `[role="dialog"]`)의 transform 이다. 판 바깥
 * AriaModal 의 닫힘 애니메이션(slide-out-to-bottom)이 그 위에 겹쳐, 놓은 자리에서 그대로 내려간다(base 주석).
 * 닫을 때는 transform 을 그대로 둔다 — base 도 그렇고, 판은 곧 내려진다.
 */
function attachSheetPull(column: HTMLElement, scroller: () => HTMLElement | null, dismiss: () => void) {
  let gesture: TGesture | null = null;
  /**
   * 끌기로 끝난 제스처 뒤의 click 을 이 시각(ms)까지 삼킨다 — 판이 손가락을 따라와 놓는 자리가 여전히 그 칩 위라 눌림이 된다.
   * 시각으로 묶는 이유: 터치 뒤 click 은 곧바로 오거나 안 온다. 기한 없이 세워 두면 다음 키보드 Enter·마우스 click 하나를 먹는다.
   */
  let swallowClickUntil = 0;

  const settle = (current: TGesture, endY: number, endAt: number, canDismiss: boolean) => {
    swallowClickUntil = endAt + CLICK_AFTER_PULL_MS;
    const { prev, last, dialog, saved } = current;
    const velocity = (last.y - prev.y) / Math.max(1, last.t - prev.t);
    if (canDismiss && dismissesSheetPull(Math.max(0, endY - current.y), velocity)) {
      dismiss();
      return;
    }
    if (dialog && saved) {
      // transition 을 먼저 돌려놔야 제자리로 돌아가는 움직임이 붙는다.
      dialog.style.transition = saved.transition;
      dialog.style.transform = saved.transform;
    }
  };

  const onTouchStart = (event: TouchEvent) => {
    // 끄는 도중 두 번째 손가락이 닿아도 지금 제스처는 그대로 간다.
    if (gesture && event.touches.length > 1) return;
    // 끝(touchend)을 못 받은 제스처 — 닿았던 칸이 그 사이 DOM 에서 내려가면 끝 이벤트가 여기까지 안 온다. 제자리로 돌려놓고 새로 시작한다.
    if (gesture?.mode === 'pull') settle(gesture, gesture.y, event.timeStamp, false);
    gesture = null;
    swallowClickUntil = 0;
    if (event.touches.length !== 1 || window.matchMedia(SHEET_DIALOG_QUERY).matches) return;
    const touch = event.touches[0];
    const box = scroller();
    const sample = { y: touch.clientY, t: event.timeStamp };
    gesture = {
      id: touch.identifier,
      x: touch.clientX,
      y: touch.clientY,
      inScroller: box !== null && event.target instanceof Node && box.contains(event.target),
      scrollTop: box?.scrollTop ?? 0,
      mode: 'pending',
      prev: sample,
      last: sample,
    };
  };

  const onTouchMove = (event: TouchEvent) => {
    const current = gesture;
    if (!current || current.mode === 'off') return;
    const touch = touchOf(event.changedTouches, current.id);
    if (!touch) return;
    const dy = touch.clientY - current.y;

    if (current.mode === 'pending') {
      const dialog = column.closest<HTMLElement>('[role="dialog"]');
      const takes = takesSheetPull({
        dx: touch.clientX - current.x,
        dy,
        inScroller: current.inScroller,
        scrollTop: current.scrollTop,
        cancelable: event.cancelable,
      });
      if (!takes || !dialog) {
        current.mode = 'off';
        return;
      }
      current.mode = 'pull';
      current.dialog = dialog;
      current.saved = { transform: dialog.style.transform, transition: dialog.style.transition };
      dialog.style.transition = 'none';
    }

    event.preventDefault();
    current.prev = current.last;
    current.last = { y: touch.clientY, t: event.timeStamp };
    if (current.dialog) current.dialog.style.transform = `translateY(${Math.max(0, dy)}px)`;
  };

  const onTouchEnd = (event: TouchEvent) => {
    const current = gesture;
    if (!current) return;
    const touch = touchOf(event.changedTouches, current.id);
    if (!touch) return;
    gesture = null;
    // 브라우저가 빼앗아 간 끌기(touchcancel)는 닫지 않고 제자리로 — 사용자가 놓은 것이 아니다.
    if (current.mode === 'pull') settle(current, touch.clientY, event.timeStamp, event.type === 'touchend');
  };

  const onClick = (event: MouseEvent) => {
    if (event.timeStamp > swallowClickUntil) return;
    swallowClickUntil = 0;
    event.preventDefault();
    event.stopPropagation();
  };

  column.addEventListener('touchstart', onTouchStart, { passive: true });
  column.addEventListener('touchmove', onTouchMove, { passive: false });
  column.addEventListener('touchend', onTouchEnd);
  column.addEventListener('touchcancel', onTouchEnd);
  // 캡처 단계 — 칩·버튼(react-aria 의 onPress 도 click 에서 돈다)에 닿기 전에 막는다.
  column.addEventListener('click', onClick, true);
  return () => {
    column.removeEventListener('touchstart', onTouchStart);
    column.removeEventListener('touchmove', onTouchMove);
    column.removeEventListener('touchend', onTouchEnd);
    column.removeEventListener('touchcancel', onTouchEnd);
    column.removeEventListener('click', onClick, true);
  };
}

/**
 * 시트 내용 전체를 감싸는 요소에 거는 ref 를 돌려준다. `scrollerRef` 는 그 안의 세로 스크롤 칸.
 *
 * effect 가 아니라 콜백 ref 다 — 시트 내용은 열릴 때 마운트되고 닫힘 애니메이션 뒤에 내려가므로,
 * 바깥 컴포넌트의 effect 로는 그 수명을 맞출 수 없다. React 19 의 ref 정리 함수가 뗀다.
 */
export function usePlacesPageFilterSheetPull(scrollerRef: RefObject<HTMLElement | null>, onDismiss: () => void) {
  const onDismissRef = useRef(onDismiss);
  useEffect(() => {
    onDismissRef.current = onDismiss;
  });

  return useCallback(
    (column: HTMLElement | null) => {
      if (!column) return;
      return attachSheetPull(column, () => scrollerRef.current, () => onDismissRef.current());
    },
    [scrollerRef],
  );
}
