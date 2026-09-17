import { describe, expect, it } from 'vitest';
import {
  COMMIT_DISTANCE_RATIO,
  COMMIT_VELOCITY,
  EDGE_RESISTANCE,
  resistedOffset,
  settleSwipe,
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
