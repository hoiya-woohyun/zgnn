import { describe, expect, it } from 'vitest';
import { carryHistoryStamp, resolveDepth, tabSwitchHistoryOf } from './appHistory';

describe('resolveDepth — history 항목의 앱 안 깊이', () => {
  it('첫 화면은 스탬프가 없으면 0 이다', () => {
    expect(resolveDepth(undefined, null)).toBe(0);
  });

  it('스탬프가 없는 새 항목은 직전 깊이보다 하나 깊다', () => {
    expect(resolveDepth(undefined, 0)).toBe(1);
    expect(resolveDepth(undefined, 3)).toBe(4);
  });

  it('스탬프가 있으면 그 값을 그대로 쓴다 — 뒤로가기로 돌아온 항목', () => {
    // /place/A(0) → /place/B(1) → 뒤로 → /place/A 는 다시 0 이어야 앱 밖으로 안 나간다.
    expect(resolveDepth(0, 1)).toBe(0);
    expect(resolveDepth(2, 5)).toBe(2);
  });

  it('새로고침한 첫 화면은 스탬프가 살아 있으면 그 깊이를 잇는다', () => {
    expect(resolveDepth(1, null)).toBe(1);
  });

  it('항목을 갈아 끼운 이동(router.replace)은 깊이를 늘리지 않는다', () => {
    expect(resolveDepth(undefined, 0, true)).toBe(0);
    expect(resolveDepth(undefined, 2, true)).toBe(2);
  });

  it('숫자가 아니거나 음수인 스탬프는 없는 것으로 본다', () => {
    expect(resolveDepth('1', 0)).toBe(1);
    expect(resolveDepth(-1, 0)).toBe(1);
    expect(resolveDepth(1.5, 0)).toBe(1);
    expect(resolveDepth(null, null)).toBe(0);
  });
});

describe('carryHistoryStamp — 같은 경로의 replace 가 새긴 값을 잇는다', () => {
  const stamped = { __NA: true, zgnnDepth: 2, zgnnRoot: '/settings' };

  it('Next 가 새로 쓴 state(우리 값 없음)에 지금 항목의 깊이·탭을 얹는다', () => {
    expect(carryHistoryStamp(stamped, { __NA: true, tree: 't' }, true)).toEqual({
      __NA: true,
      tree: 't',
      zgnnDepth: 2,
      zgnnRoot: '/settings',
    });
  });

  it('경로가 바뀌는 replace 는 잇지 않는다 — 새 화면이라 셸이 새긴다', () => {
    const next = { __NA: true };
    expect(carryHistoryStamp(stamped, next, false)).toBe(next);
  });

  it('이미 값이 있으면(우리 자신의 새기기) 그대로 둔다', () => {
    const next = { __NA: true, zgnnDepth: 0, zgnnRoot: '/' };
    expect(carryHistoryStamp(stamped, next, true)).toBe(next);
  });

  it('지금 항목에 새긴 것이 없으면 얹을 것도 없다', () => {
    const next = { __NA: true };
    expect(carryHistoryStamp({ __NA: true }, next, true)).toBe(next);
    expect(carryHistoryStamp(null, next, true)).toBe(next);
  });

  it('null state 에도 얹는다 · 객체가 아니면 건드리지 않는다', () => {
    expect(carryHistoryStamp(stamped, null, true)).toEqual({ zgnnDepth: 2, zgnnRoot: '/settings' });
    expect(carryHistoryStamp(stamped, 'x', true)).toBe('x');
  });
});

describe('tabSwitchHistoryOf — 탭 화면끼리의 이동을 history 에 어떻게 남기나', () => {
  const move = (from: string, to: string, homeBelow = false, keepHomeBelow = true) =>
    tabSwitchHistoryOf({ from, to, homeBelow, keepHomeBelow });

  it('홈에서 떠나면 홈 한 칸을 밑에 남긴다 — 뒤로 = 홈', () => {
    expect(move('/', '/places/restaurant')).toBe('push');
    expect(move('/', '/map/')).toBe('push');
  });

  it('홈 위의 탭끼리는 갈아 끼운다 — 탭 사이를 되짚지 않는다', () => {
    expect(move('/places/restaurant', '/map', true)).toBe('replace');
    expect(move('/map', '/checklist', true)).toBe('replace');
  });

  it('홈 위의 탭에서 홈으로 가면 밑의 홈으로 되감는다 — 홈 위에 홈이 쌓이지 않게', () => {
    expect(move('/map', '/', true)).toBe('rewind');
  });

  it('밑에 홈이 없는 탭(탭에서 연 앱)에서 홈으로는 갈아 끼운다 — 되감을 홈이 없다', () => {
    expect(move('/map', '/', false)).toBe('replace');
    expect(move('/map', '/settings', false)).toBe('replace');
  });

  it('iOS 는 늘 갈아 끼운다 — 가장자리 뒤로가기가 탭 페이저와 겹치지 않게', () => {
    expect(move('/', '/places/restaurant', false, false)).toBe('replace');
    expect(move('/map', '/', true, false)).toBe('replace');
  });
});
