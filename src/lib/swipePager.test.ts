import { describe, expect, it } from 'vitest';
import {
  AXIS_SLOP_PX,
  AXIS_X_RATIO,
  COMMIT_DISTANCE_RATIO,
  COMMIT_VELOCITY,
  EDGE_RESISTANCE,
  SETTLE_MIN_MS,
  SETTLE_MS,
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
