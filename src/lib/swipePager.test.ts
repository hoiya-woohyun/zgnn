import { describe, expect, it } from 'vitest';
import {
  AXIS_SLOP_PX,
  AXIS_X_RATIO,
  COMMIT_AXIS_RATIO,
  COMMIT_DISTANCE_RATIO,
  COMMIT_VELOCITY,
  EDGE_RESISTANCE,
  HEAVY_COMMIT_DISTANCE_RATIO,
  SETTLE_MIN_MS,
  SETTLE_MS,
  isFlatTravel,
  resistedOffset,
  settleDurationOf,
  settleSwipe,
  swipeAxisOf,
} from './swipePager';

const WIDTH = 400;
const COUNT = 3;

// 넘어가는 거리보다 확실히 짧고, 넘어가는 속도보다 확실히 느린 값. 한쪽 조건만 켜서 검사하려고 둔다.
const SHORT = WIDTH * COMMIT_DISTANCE_RATIO * 0.5;
const SLOW = COMMIT_VELOCITY * 0.5;

const release = (over: Partial<Parameters<typeof settleSwipe>[0]>) =>
  settleSwipe({ index: 1, count: COUNT, dx: 0, velocity: 0, width: WIDTH, ...over });

describe('resistedOffset — 끝에서는 손가락을 일부만 따라간다', () => {
  it('가운데에서는 손가락 그대로', () => {
    expect(resistedOffset(120, 1, COUNT)).toBe(120);
    expect(resistedOffset(-120, 1, COUNT)).toBe(-120);
  });

  it('첫 페이지에서 오른쪽으로 끌면(이전이 없음) 저항이 걸린다', () => {
    expect(resistedOffset(100, 0, COUNT)).toBe(100 * EDGE_RESISTANCE);
    // 반대쪽(다음 페이지가 있는 방향)은 그대로.
    expect(resistedOffset(-100, 0, COUNT)).toBe(-100);
  });

  it('마지막 페이지에서 왼쪽으로 끌면(다음이 없음) 저항이 걸린다', () => {
    expect(resistedOffset(-100, COUNT - 1, COUNT)).toBe(-100 * EDGE_RESISTANCE);
    expect(resistedOffset(100, COUNT - 1, COUNT)).toBe(100);
  });
});

describe('settleSwipe — 놓았을 때 어디에 안착하나', () => {
  it('거의 안 움직였으면 제자리', () => {
    expect(release({ dx: -4, velocity: 0 })).toBe(1);
    expect(release({ dx: 4, velocity: 0 })).toBe(1);
  });

  it('왼쪽으로 충분히 끌면 다음, 오른쪽으로 충분히 끌면 이전', () => {
    const far = WIDTH * COMMIT_DISTANCE_RATIO + 1;
    expect(release({ dx: -far })).toBe(2);
    expect(release({ dx: far })).toBe(0);
  });

  it('짧게 끌어도 빠르게 튕기면(플릭) 넘어간다', () => {
    const fast = COMMIT_VELOCITY + 0.1;
    expect(release({ dx: -SHORT, velocity: -fast })).toBe(2);
    expect(release({ dx: SHORT, velocity: fast })).toBe(0);
  });

  it('짧고 느리면 제자리', () => {
    expect(release({ dx: -SHORT, velocity: -SLOW })).toBe(1);
    expect(release({ dx: SHORT, velocity: SLOW })).toBe(1);
  });

  it('멀리 끌었어도 반대 방향으로 빠르게 되돌리며 놓으면 제자리', () => {
    const far = WIDTH * COMMIT_DISTANCE_RATIO + 1;
    const fast = COMMIT_VELOCITY + 0.1;
    expect(release({ dx: -far, velocity: fast })).toBe(1);
    expect(release({ dx: far, velocity: -fast })).toBe(1);
  });

  it('끝에서는 이웃이 없는 방향으로 절대 넘어가지 않는다', () => {
    const far = WIDTH;
    const fast = COMMIT_VELOCITY * 3;
    expect(release({ index: 0, dx: far, velocity: fast })).toBe(0);
    expect(release({ index: COUNT - 1, dx: -far, velocity: -fast })).toBe(COUNT - 1);
    // 이웃이 있는 방향은 평소처럼.
    expect(release({ index: 0, dx: -far })).toBe(1);
    expect(release({ index: COUNT - 1, dx: far })).toBe(1);
  });
});

describe('settleDurationOf — 손가락이 빠를수록 짧게 밀어낸다', () => {
  it('멈춘 채 놓으면(속도 0) 기본 시간', () => {
    expect(settleDurationOf(300, 0)).toBe(SETTLE_MS);
  });

  it('느리게 놓으면 기본 시간을 넘지 않는다 — 300px 를 0.3px/ms 로 가면 1초지만 260ms 에서 끊는다', () => {
    expect(settleDurationOf(300, 0.3)).toBe(SETTLE_MS);
  });

  it('남은 거리를 그 속도로 가는 시간 — 300px 를 2px/ms 면 150ms', () => {
    expect(settleDurationOf(300, 2)).toBe(150);
    // 부호는 안 본다 — 되돌아가는 방향으로 튕겨도 같은 셈.
    expect(settleDurationOf(300, -2)).toBe(150);
  });

  it('아무리 세게 튕겨도 최소 시간보다 짧지 않다', () => {
    expect(settleDurationOf(300, 10)).toBe(SETTLE_MIN_MS);
  });

  it('남은 거리가 없으면 최소 시간만 — 주소 바꾸기를 괜히 기다리지 않는다', () => {
    expect(settleDurationOf(0, 0)).toBe(SETTLE_MIN_MS);
  });
});

describe('swipeAxisOf — 첫 움직임의 축(14 W261007.14)', () => {
  it('문턱 전엔 정하지 않는다', () => {
    expect(swipeAxisOf(AXIS_SLOP_PX - 1, 0)).toBe('pending');
    expect(swipeAxisOf(-3, 6)).toBe('pending');
  });

  it('충분히 누운 이동만 가로 — 방향(좌우) 무관', () => {
    expect(swipeAxisOf(30, 0)).toBe('x');
    expect(swipeAxisOf(-30, 10)).toBe('x');
    expect(swipeAxisOf(17, 10)).toBe('x');
  });

  it('비스듬한 위로 올리기(45° 근처)는 세로 — 예전엔 가로로 잡혀 옆 종류로 넘어갔다', () => {
    expect(swipeAxisOf(12, -12)).toBe('y');
    expect(swipeAxisOf(-14, -10)).toBe('y');
    expect(swipeAxisOf(10 * AXIS_X_RATIO - 0.1, 10)).toBe('y');
  });

  it('곧은 세로는 세로', () => {
    expect(swipeAxisOf(0, 20)).toBe('y');
  });
});

/**
 * 두 인식기(placesPageSwipe · appShellSwipe)가 하는 일을 DOM 없이 되짚는다 — (0,0) 에서 (dx,dy) 까지 곧게 끌고 놓는다.
 * 처음 `AXIS_SLOP_PX` 를 넘는 자리에서 축을 정하고(잠긴 자리부터 0 으로 센다), 놓을 때 제스처 전체를 `travel` 로 넘긴다.
 * 세로로 정해지면 'scroll'. 평가 스크립트의 CDP 끌기도 곧은 선이라 이 모양이 재현 그대로다.
 */
const PHONE = 390;
const straightGesture = ({
  dx,
  dy,
  speed,
  index = 1,
  count = COUNT,
  heavy = false,
}: {
  dx: number;
  dy: number;
  /** 놓는 순간의 빠르기(px/ms, 부호 없이). 방향은 dx 를 따른다. */
  speed: number;
  index?: number;
  count?: number;
  heavy?: boolean;
}): number | 'scroll' | 'tap' => {
  const steps = 64;
  for (let i = 1; i <= steps; i++) {
    const x = (dx * i) / steps;
    const y = (dy * i) / steps;
    const axis = swipeAxisOf(x, y);
    if (axis === 'pending') continue;
    if (axis === 'y') return 'scroll';
    const velocity = Math.sign(dx) * speed;
    return settleSwipe({ index, count, dx: dx - x, velocity, width: PHONE, travel: { dx, dy }, heavy });
  }
  return 'tap';
};

// CDP 로 잰 빠르기(2026-10-15, 390×844): 8×16ms 휙 150px 0.57 · 110px 0.42, 천천히 160px 를 움직이며 뗌 0.31, 멈췄다 뗌 0.
const FAST = 0.57;

describe('isFlatTravel — 제스처 전체가 누웠는가(14 W261010.19)', () => {
  it('가로가 세로의 COMMIT_AXIS_RATIO 배 이상이면 누운 것 — 경계는 넘김 쪽', () => {
    expect(isFlatTravel(120, 120 / COMMIT_AXIS_RATIO)).toBe(true);
    expect(isFlatTravel(120, 120 / COMMIT_AXIS_RATIO + 0.5)).toBe(false);
    // 방향(좌우·위아래) 무관.
    expect(isFlatTravel(-150, 45)).toBe(true);
    expect(isFlatTravel(150, -45)).toBe(true);
  });

  it('겪은 사고 둘은 누운 것이 아니다 — 200×80(2.5배) · 110×60(1.8배)', () => {
    expect(isFlatTravel(-200, -80)).toBe(false);
    expect(isFlatTravel(-110, -60)).toBe(false);
  });

  it('잠금 문턱보다 엄격하다 — 잠겨서 따라오되 놓으면 돌아오는 띠가 있다', () => {
    expect(COMMIT_AXIS_RATIO).toBeGreaterThan(AXIS_X_RATIO);
  });

  it('움직임이 없으면 막지 않는다(거리 문턱이 따로 막는다)', () => {
    expect(isFlatTravel(0, 0)).toBe(true);
  });
});

describe('한 제스처 전체 — 비스듬한 끌기는 넘기지 않는다(14 W261010.19)', () => {
  it('비스듬히 올린 200×80 은 잠기지만(목록이 따라온다) 놓으면 제자리 — 빠르게 튕겨도', () => {
    expect(swipeAxisOf(-20, -8)).toBe('x');
    expect(straightGesture({ dx: -200, dy: -80, speed: FAST })).toBe(1);
    expect(straightGesture({ dx: -200, dy: -80, speed: 2 })).toBe(1);
  });

  it('영자의 110×60(4번 중 1번 카페로) 도 제자리', () => {
    expect(straightGesture({ dx: -110, dy: -60, speed: 0.42 })).toBe(1);
  });

  it('곧은 휙은 그대로 넘어간다 — 150×12', () => {
    expect(straightGesture({ dx: -150, dy: -12, speed: FAST })).toBe(2);
    expect(straightGesture({ dx: 150, dy: 12, speed: FAST })).toBe(0);
  });

  it('엄지가 호를 그려 조금 뜬 휙도 넘어간다 — 150×45(3.3배)', () => {
    expect(straightGesture({ dx: -150, dy: -45, speed: FAST })).toBe(2);
  });

  it('곧게 멀리 끌고 멈춰 놓아도 넘어간다(거리)', () => {
    expect(straightGesture({ dx: -(PHONE * COMMIT_DISTANCE_RATIO + 20), dy: 0, speed: 0 })).toBe(2);
  });

  it('비스듬하면 아무리 멀리 끌어도 제자리 — 거리보다 기울기를 먼저 본다', () => {
    expect(straightGesture({ dx: -300, dy: -150, speed: 0 })).toBe(1);
  });

  it('travel 을 안 주면 기울기를 안 본다 — 하위 화면의 가장자리 뒤로가기(appShellStack)는 그대로', () => {
    const far = WIDTH * COMMIT_DISTANCE_RATIO + 1;
    expect(release({ dx: far })).toBe(0);
  });
});

describe('무거운 넘김 — 둘러보기 종류 끝에서 바깥 탭으로(14 W261010.19)', () => {
  // 숙소 화면의 셸 페이저: 왼쪽 칸 = 홈, 지금 = 숙소(오른쪽 식당은 둘러보기 몫이라 칸이 없다).
  const atStay = { index: 1, count: 2 };

  it('휙만으로는 안 넘어간다 — 종류를 넘기던 손이 끝에서 한 번 더 튕긴 것(designer-27b·28b)', () => {
    expect(straightGesture({ dx: 150, dy: 0, speed: FAST, heavy: true, ...atStay })).toBe(1);
    expect(straightGesture({ dx: 150, dy: 0, speed: 3, heavy: true, ...atStay })).toBe(1);
  });

  it('폭의 절반을 넘게 끌면 넘어간다 — 끝에서 탭을 넘기려는 손', () => {
    expect(straightGesture({ dx: 260, dy: 0, speed: 0, heavy: true, ...atStay })).toBe(0);
    expect(straightGesture({ dx: 260, dy: 0, speed: FAST, heavy: true, ...atStay })).toBe(0);
  });

  it('문턱은 잠긴 뒤 끈 거리로 잰다 — 절반 바로 위는 넘어가고 바로 아래는 제자리', () => {
    const half = PHONE * HEAVY_COMMIT_DISTANCE_RATIO;
    expect(settleSwipe({ ...atStay, dx: half + 1, velocity: 0, width: PHONE, heavy: true })).toBe(0);
    expect(settleSwipe({ ...atStay, dx: half - 1, velocity: FAST, width: PHONE, heavy: true })).toBe(1);
  });

  it('절반을 넘겼어도 반대로 튕기며 놓으면 제자리', () => {
    expect(settleSwipe({ ...atStay, dx: PHONE * 0.7, velocity: -FAST, width: PHONE, heavy: true })).toBe(1);
  });

  it('비스듬하면 무거운 넘김도 제자리', () => {
    expect(straightGesture({ dx: 300, dy: 120, speed: 0, heavy: true, ...atStay })).toBe(1);
  });

  it('160px 끌기(ferry-69): 끝에서 탭으로는 제자리, 종류 사이(가벼운 넘김)는 넘어간다 — 종류 사이 30% 는 지킨다', () => {
    expect(straightGesture({ dx: 160, dy: 0, speed: 0.31, heavy: true, ...atStay })).toBe(1);
    expect(straightGesture({ dx: -160, dy: 0, speed: 0.31 })).toBe(2);
    expect(straightGesture({ dx: -160, dy: 0, speed: 0 })).toBe(2);
  });
});
