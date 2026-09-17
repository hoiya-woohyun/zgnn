/**
 * 좌우 스와이프로 페이지를 넘기는 산수. DOM 을 모른다 — 손가락이 움직인 거리·속도와
 * 페이지 폭만 받아 "화면에 얼마나 옮길지" 와 "놓으면 어디로 갈지" 만 답한다.
 *
 * 둘러보기의 숙소·식당·카페 전환(`screens/placesPageSwipe.ts`)이 쓴다.
 */

/**
 * 이만큼(페이지 폭 대비 비율) 끌어 놓으면 넘어간다.
 * 네이티브 페이저(iOS 50% · Android 40%)보다 낮다 — 끝까지 끌어야 넘어가면 무겁게 느껴진다는
 * 실기 피드백(2026-09-17). 방향을 정하는 데 쓴 10px(placesPageSwipe 의 slop)은 여기 안 들어간다.
 */
export const COMMIT_DISTANCE_RATIO = 0.3;
/** 이보다 빠르게(px/ms) 튕기면 짧게 끌었어도 넘어간다. 속도는 최근 100ms 구간으로 잰다(placesPageSwipe). */
export const COMMIT_VELOCITY = 0.3;
/** 더 갈 곳이 없는 끝에서는 손가락의 이만큼만 따라간다(러버밴드). */
export const EDGE_RESISTANCE = 0.3;

export type TSwipeRelease = {
  /** 지금 페이지의 자리. */
  index: number;
  /** 페이지 수. */
  count: number;
  /** 손가락이 움직인 거리(px). 오른쪽이 양수. 왼쪽으로 끌면(음수) 다음 페이지로 간다. */
  dx: number;
  /** 놓는 순간의 속도(px/ms). 부호는 dx 와 같은 기준. */
  velocity: number;
  /** 페이지 하나의 폭(px). */
  width: number;
};

/**
 * 손가락이 움직인 거리를 화면에 옮길 거리로 바꾼다.
 *
 * 양 끝에서 더 갈 곳이 없는 쪽으로 끌면 딱 멈추지 않고 일부만 따라간다 — 멈추면 고장처럼
 * 보이고, 그대로 따라가면 빈 자리가 드러난다.
 */
export const resistedOffset = (dx: number, index: number, count: number): number => {
  const pastStart = dx > 0 && index === 0;
  const pastEnd = dx < 0 && index === count - 1;
  return pastStart || pastEnd ? dx * EDGE_RESISTANCE : dx;
};

/**
 * 손가락을 놓았을 때 어느 페이지에 안착할지.
 *
 * 반환값은 0 ~ count-1 의 자리. 지금 자리를 돌려주면 제자리로 돌아간다는 뜻이다.
 * 이웃이 없는 방향(끝)으로는 절대 넘어가지 않는다.
 */
export const settleSwipe = ({ index, count, dx, velocity, width }: TSwipeRelease): number => {
  const flick = Math.abs(velocity) > COMMIT_VELOCITY;
  const far = Math.abs(dx) > width * COMMIT_DISTANCE_RATIO;
  // 끌던 방향과 반대로 튕기며 놓으면 마음을 바꾼 것이다 — 멀리 갔어도 제자리.
  if (flick && Math.sign(velocity) !== Math.sign(dx)) return index;
  if (!flick && !far) return index;
  const next = dx < 0 ? index + 1 : index - 1;
  return Math.min(count - 1, Math.max(0, next));
};
