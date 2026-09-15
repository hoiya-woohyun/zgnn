import { describe, expect, it } from 'vitest';
import { resolveDepth } from './appHistory';

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
