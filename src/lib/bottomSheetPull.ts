/**
 * 하단 시트(`components/base/bottom-sheet`)를 끌어내려 닫기 — 닫는 문턱과, 본문 끌기를 언제 잡고 언제 놓는지(14 W261010.33p).
 *
 * 시트는 두 길로 끌린다. 위쪽 손잡이 띠(모든 시트, 포인터 이벤트)와 본문(`pullFromBody` 를 켠 시트만, 터치 이벤트 — 지금은
 * 둘러보기 필터 시트 하나). 잡는 방식은 달라도 **같은 문턱으로 닫고 같은 판을 같은 상태로 움직인다** — 판의 움직임은 base 가 쥐고
 * (`TSheetDrag`), 여기는 판정과 제스처만 둔다. 예전엔 본문 끌기가 감싸는 쪽(`placesPageFilterSheetPull`)에 있어 문턱을 옮겨 적었고
 * 한쪽만 고치면 조용히 갈렸다(.33k). 판정은 순수 함수라 여기서 테스트가 붙는다(`bottomSheetPull.test.ts`).
 *
 * 본문 끌기를 **포인터가 아니라 터치 이벤트**로 받는 이유: 포인터로 받으면 스크롤 칸에서 브라우저가 스크롤로 가져가며
 * `pointercancel` 을 보내지만, 터치는 첫 `touchmove` 를 `preventDefault` 해 스크롤을 안 시작시킬 수 있다. 손잡이처럼
 * `touch-action: none` 을 본문에 걸면 안쪽 목록이 안 넘어간다(조상이 막으면 자식이 되살릴 수 없다).
 *
 * 다투지 않는 규칙 — 끌기로 잡는 것은 **첫 `touchmove` 한 번에** 정하고 끝까지 안 바꾼다:
 * - 닿은 곳 위로 내려가 있는 스크롤이 없고(목록이 맨 위이거나 닿은 곳이 목록 밖 — 제목·하단 줄), 아래로, 옆보다 세로가 크면 → 시트를 끈다.
 * - 그 밖은 전부 브라우저 몫이다. 목록이 내려가 있으면 끌어도 목록만 올라가고, 맨 위에 닿아도 그 제스처는 닫기로
 *   넘어가지 않는다(손을 떼고 다시 끌면 닫힌다). 맨 위에서 위로 쓸면 목록이 내려간다.
 * - "몇 px 지나서 정하기" 는 안 된다. Chrome 은 스크롤이 시작된 뒤의 `touchmove` 를 취소할 수 없게(`cancelable: false`) 보낸다.
 */

/** 이만큼 끌어내리면 닫는다. 이보다 짧아도 빠르게 튕기면(px/ms) 닫는다 — 손잡이·본문 끌기가 함께 쓴다. */
export const SHEET_DISMISS_DISTANCE_PX = 96;
export const SHEET_DISMISS_VELOCITY = 0.6;

/**
 * Tailwind `sm` — base 시트가 가운데 대화상자로 바뀌고 손잡이도 숨는 폭. 거기선 끌어내리는 동작이 없다.
 * 둘러보기 필터 버튼은 `md:hidden` 이라 640~767px 에서도 그 시트가 뜬다.
 */
const SHEET_DIALOG_QUERY = '(min-width: 40rem)';

/** 끌기를 놓은 뒤 이만큼(ms) 안에 오는 click 만 그 끌기의 것으로 친다. */
const CLICK_AFTER_PULL_MS = 400;

type TPullFirstMove = {
  dx: number;
  dy: number;
  /** 닿은 곳 위로 내려가 있는 스크롤 양(`scrollTopAbove`). iOS 고무줄 튕김에선 음수가 섞인다. */
  scrollTop: number;
  /** 첫 `touchmove` 가 취소 가능한가 — 아니면 브라우저가 이미 스크롤로 가져갔다. */
  cancelable: boolean;
};

/** 첫 `touchmove` 에서 이 제스처를 시트 끌기로 잡을지. */
export function takesSheetPull({ dx, dy, scrollTop, cancelable }: TPullFirstMove): boolean {
  if (!cancelable || dy <= 0 || dy < Math.abs(dx)) return false;
  return scrollTop < 1;
}

/** 놓았을 때 닫을지. 짧아도 빠르게 튕기면(px/ms) 닫는다. */
export function dismissesSheetPull(distance: number, velocity: number): boolean {
  return distance > SHEET_DISMISS_DISTANCE_PX || velocity > SHEET_DISMISS_VELOCITY;
}

type TScrollNode = { scrollTop: number; parentElement: TScrollNode | null };

/**
 * 닿은 곳(`from`)부터 시트 본문(`root`, 포함)까지 올라가며 가장 많이 내려가 있는 `scrollTop`.
 *
 * 스크롤 칸을 따로 지목하지 않는 이유: 필터 시트는 안쪽 조건 줄이, 셀렉트 같은 긴 시트는 base 의 본문 칸이 스크롤한다.
 * 그 사이 어디든 내려가 있으면 아래로 끄는 손가락은 그 스크롤 몫이고, 목록 밖(제목·하단 줄)에서 닿았으면 조상에 내려간 칸이 없다.
 * `root` 에서 멈추는 것이 요점이다 — 그 위(문서)는 모달이 스크롤만 잠근 채 원래 페이지의 `scrollTop` 을 들고 있다.
 */
export function scrollTopAbove(from: TScrollNode, root: TScrollNode): number {
  let top = 0;
  for (let node: TScrollNode | null = from; node; node = node.parentElement) {
    top = Math.max(top, node.scrollTop);
    if (node === root) break;
  }
  return top;
}

type TSample = { y: number; t: number };

/** 판을 움직이는 쪽(base 시트) — 손잡이 끌기와 같은 상태를 쓴다. */
export type TSheetDrag = {
  /** 끌기 시작. 기준은 손가락이 처음 닿은 자리(touchstart)다. */
  begin: (start: TSample) => void;
  follow: (sample: TSample) => void;
  /** 놓음. `canDismiss` 가 거짓이면(브라우저가 빼앗아 감 · 끝을 못 받음) 문턱과 무관하게 제자리로. */
  finish: (endY: number, canDismiss: boolean) => void;
};

type TGesture = {
  id: number;
  x: number;
  start: TSample;
  scrollTop: number;
  mode: 'pending' | 'pull' | 'off';
};

const touchOf = (list: TouchList, id: number) => Array.from(list).find((touch) => touch.identifier === id);

/**
 * 시트 본문(`content` — 손잡이·닫기 단추는 그 밖이다)에 본문 끌기를 붙인다. 돌려주는 함수가 뗀다.
 * 끌기로 잡은 제스처만 `drag` 를 부르고, 나머지는 브라우저 스크롤·click 그대로다.
 */
export function attachBottomSheetBodyPull(content: HTMLElement, drag: TSheetDrag): () => void {
  let gesture: TGesture | null = null;
  /**
   * 끌기로 끝난 제스처 뒤의 click 을 이 시각(ms)까지 삼킨다 — 판이 손가락을 따라와 놓는 자리가 여전히 그 칩 위라 눌림이 된다.
   * 시각으로 묶는 이유: 터치 뒤 click 은 곧바로 오거나 안 온다. 기한 없이 세워 두면 다음 키보드 Enter·마우스 click 하나를 먹는다.
   */
  let swallowClickUntil = 0;

  const settle = (endY: number, endAt: number, canDismiss: boolean) => {
    swallowClickUntil = endAt + CLICK_AFTER_PULL_MS;
    drag.finish(endY, canDismiss);
  };

  const onTouchStart = (event: TouchEvent) => {
    // 끄는 도중 두 번째 손가락이 닿아도 지금 제스처는 그대로 간다.
    if (gesture && event.touches.length > 1) return;
    // 끝(touchend)을 못 받은 제스처 — 닿았던 칸이 그 사이 DOM 에서 내려가면 끝 이벤트가 여기까지 안 온다. 제자리로 돌려놓고 새로 시작한다.
    if (gesture?.mode === 'pull') settle(gesture.start.y, event.timeStamp, false);
    gesture = null;
    swallowClickUntil = 0;
    if (event.touches.length !== 1 || window.matchMedia(SHEET_DIALOG_QUERY).matches) return;
    const touch = event.touches[0];
    gesture = {
      id: touch.identifier,
      x: touch.clientX,
      start: { y: touch.clientY, t: event.timeStamp },
      scrollTop: event.target instanceof Element ? scrollTopAbove(event.target, content) : 0,
      mode: 'pending',
    };
  };

  const onTouchMove = (event: TouchEvent) => {
    const current = gesture;
    if (!current || current.mode === 'off') return;
    const touch = touchOf(event.changedTouches, current.id);
    if (!touch) return;

    if (current.mode === 'pending') {
      const takes = takesSheetPull({
        dx: touch.clientX - current.x,
        dy: touch.clientY - current.start.y,
        scrollTop: current.scrollTop,
        cancelable: event.cancelable,
      });
      if (!takes) {
        current.mode = 'off';
        return;
      }
      current.mode = 'pull';
      drag.begin(current.start);
    }

    event.preventDefault();
    drag.follow({ y: touch.clientY, t: event.timeStamp });
  };

  const onTouchEnd = (event: TouchEvent) => {
    const current = gesture;
    if (!current) return;
    const touch = touchOf(event.changedTouches, current.id);
    if (!touch) return;
    gesture = null;
    // 브라우저가 빼앗아 간 끌기(touchcancel)는 닫지 않고 제자리로 — 사용자가 놓은 것이 아니다.
    if (current.mode === 'pull') settle(touch.clientY, event.timeStamp, event.type === 'touchend');
  };

  const onClick = (event: MouseEvent) => {
    if (event.timeStamp > swallowClickUntil) return;
    swallowClickUntil = 0;
    event.preventDefault();
    event.stopPropagation();
  };

  content.addEventListener('touchstart', onTouchStart, { passive: true });
  content.addEventListener('touchmove', onTouchMove, { passive: false });
  content.addEventListener('touchend', onTouchEnd);
  content.addEventListener('touchcancel', onTouchEnd);
  // 캡처 단계 — 칩·버튼(react-aria 의 onPress 도 click 에서 돈다)에 닿기 전에 막는다.
  content.addEventListener('click', onClick, true);
  return () => {
    content.removeEventListener('touchstart', onTouchStart);
    content.removeEventListener('touchmove', onTouchMove);
    content.removeEventListener('touchend', onTouchEnd);
    content.removeEventListener('touchcancel', onTouchEnd);
    content.removeEventListener('click', onClick, true);
  };
}
