/**
 * 좌우 스와이프로 페이지를 넘기는 산수. DOM 을 모른다 — 손가락이 움직인 거리·속도와
 * 페이지 폭만 받아 "화면에 얼마나 옮길지" 와 "놓으면 어디로 갈지" 만 답한다.
 *
 * 두 인식기가 이것을 함께 쓴다 — 둘러보기 안의 종류 전환(`screens/placesPageSwipe.ts`)과
 * 화면 사이 이동(`components/layout/appShellSwipe.ts`). **느낌이 갈리면 안 되기 때문에**
 * 손가락에 관한 숫자는 전부 여기 한 곳에 둔다. 한쪽에만 복사해 두면 어느 날 한쪽만 바뀐다.
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

/** 이만큼(px) 움직이기 전엔 세로 스크롤인지 가로 스와이프인지 정하지 않는다. */
export const AXIS_SLOP_PX = 10;
/** 화면 왼쪽 가장자리 이 폭(px)에서 시작한 제스처는 iOS Safari 의 뒤로가기라 건드리지 않는다. */
export const BACK_SWIPE_EDGE_PX = 24;
/** 놓은 뒤 남은 거리를 밀어내는 시간. 알약이 탭 클릭으로 움직일 때와 같은 곡선(placesPageTypeTabs). */
export const SETTLE_MS = 260;
export const SETTLE_EASING = 'cubic-bezier(0.16, 1, 0.3, 1)';
/** 아무리 세게 튕겨도 이보다 짧게는 안 밀어낸다 — 눈이 못 따라와 "순간이동" 으로 읽힌다. */
export const SETTLE_MIN_MS = 120;

/**
 * 놓은 뒤 남은 거리를 밀어내는 시간 — **손가락이 빠를수록 짧다.**
 *
 * 늘 `SETTLE_MS` 면 세게 튕겼을 때 놓는 순간 화면이 손가락보다 느려져 속도가 끊긴다. "남은 거리를 그 속도로 가면
 * 걸리는 시간" 을 그대로 쓰되, 느리게 놓았거나 멈춘 채 놓았으면(속도 0) 기본값을 넘지 않고, 아무리 빨라도
 * `SETTLE_MIN_MS` 보다 짧지 않다. 곡선이 expo-out 이라 실제로는 그보다 먼저 거의 도착한다 — 그게 "이어받았다" 로
 * 읽힌다. 남은 거리가 없으면(손가락이 이미 끝까지 끌어다 놓음) 최소값만 — 주소 바꾸기를 괜히 기다리지 않게.
 * 두 인식기(둘러보기 안 · 화면 사이)가 같이 쓴다 — 느낌이 갈리면 안 된다.
 */
export const settleDurationOf = (remainingPx: number, velocity: number): number => {
  if (remainingPx <= 0) return SETTLE_MIN_MS;
  const speed = Math.abs(velocity);
  if (speed <= 0) return SETTLE_MS;
  return Math.round(Math.min(SETTLE_MS, Math.max(SETTLE_MIN_MS, remainingPx / speed)));
};
/**
 * 탭을 눌러 **멈춰 있던** 화면을 한 장 미끄러뜨리는 시간·곡선(appShellSwipe 의 `slideTo`).
 * `SETTLE_EASING` 은 출발 기울기가 가파른 expo-out 이라 손가락이 남긴 속도를 이어받기엔 맞지만, 정지한 화면에
 * 걸면 "밀렸다" 가 아니라 "튕겼다" 로 읽힌다. 정지에서 떠나는 이동은 살짝 떠서 감속한다(CSS `ease` 와 같은 곡선),
 * 남은 거리가 아니라 한 장 전체를 가므로 조금 더 길게.
 */
export const TAP_SLIDE_MS = 300;
export const TAP_SLIDE_EASING = 'cubic-bezier(0.25, 0.1, 0.25, 1)';
/**
 * 속도는 이 구간(ms) 안의 샘플로 잰다. 마지막 두 move 만 보면 손가락이 떨어지기 직전 잠깐
 * 멈칫한 것이 0 으로 읽혀 플릭이 죽는다(실기에서 "끝까지 끌어야 넘어간다" 로 느껴진 원인).
 */
export const VELOCITY_WINDOW_MS = 100;

/** 손가락이 지나간 자리 하나. */
export type TSample = { x: number; t: number };

/**
 * 속도를 잴 구간만 남긴다.
 *
 * 멈춘 채로 있다가 떼면 move 가 안 오므로 오래된 샘플이 그대로 남는다 — 그래서 뗄 때도
 * **그 시각 기준으로** 다시 걸러야 한다. `at` 을 받는 이유가 그것이다.
 */
export const recentSamples = (samples: TSample[], at: number): TSample[] =>
  samples.filter((sample) => at - sample.t <= VELOCITY_WINDOW_MS);

/** 구간의 첫·끝으로 잰 속도(px/ms). 샘플이 하나뿐이면 잴 수 없으니 0. */
export const velocityOf = (samples: TSample[]): number => {
  const first = samples[0];
  const last = samples[samples.length - 1];
  if (!first || !last || samples.length < 2) return 0;
  return (last.x - first.x) / Math.max(1, last.t - first.t);
};

/**
 * 쌓이는 화면(stack)이 덮이고 걷히는 시간·곡선(`components/layout/appShellStack`).
 *
 * 옆으로 미는 페이저와 따로 두는 이유: 저기는 손가락이 이미 끌어다 놓은 화면을 **이어받는** 것이고, 여기는
 * 탭 한 번으로 **멈춰 있던** 화면이 한 장 전체를 건너온다. iOS 내비게이션 스택처럼 빠르게 떠나 길게 감속한다.
 */
export const STACK_SLIDE_MS = 340;
export const STACK_SLIDE_EASING = 'cubic-bezier(0.32, 0.72, 0, 1)';
/**
 * 덮이는 화면이 덮는 화면을 따라 물러나는 비율. 0 이면 제자리, 1 이면 함께 밀린다.
 * 같이 밀리면 옆 페이저(나란히)와 구별이 안 되고, 제자리면 깊이가 안 느껴진다 — iOS 와 같은 30%.
 */
export const STACK_PARALLAX = 0.3;
