import { describe, expect, it } from 'vitest';
import { isPillFocusArrival, markPillFocus, PILL_FOCUS_TTL_MS, takePillFocus } from './placesPageTypePillFocus';

describe('placesPageTypePillFocus', () => {
  it('표식이 없으면 도착이 아니다', () => {
    expect(isPillFocusArrival(null, 'cafe', 0)).toBe(false);
  });

  it('같은 종류 · 시한 안이면 도착이다', () => {
    expect(isPillFocusArrival({ type: 'cafe', at: 100 }, 'cafe', 100 + PILL_FOCUS_TTL_MS)).toBe(true);
  });

  it('다른 종류이거나 시한이 지났으면 아니다', () => {
    expect(isPillFocusArrival({ type: 'cafe', at: 100 }, 'stay', 150)).toBe(false);
    expect(isPillFocusArrival({ type: 'cafe', at: 100 }, 'cafe', 101 + PILL_FOCUS_TTL_MS)).toBe(false);
  });

  it('take 는 한 번만 true 이고 표식을 지운다', () => {
    markPillFocus('stay', 1000);
    expect(takePillFocus('stay', 1001)).toBe(true);
    expect(takePillFocus('stay', 1002)).toBe(false);
  });

  it('다른 종류가 먼저 take 해도 표식은 지워진다', () => {
    markPillFocus('stay', 1000);
    expect(takePillFocus('cafe', 1001)).toBe(false);
    expect(takePillFocus('stay', 1002)).toBe(false);
  });
});
