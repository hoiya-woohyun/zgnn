import { describe, expect, it } from 'vitest';
import { judgeEligibility, primaryReason } from './eligibility';
import { placesOfType } from './places';
import { placesPageRepeatedReason } from './placesPageRepeatedReason';

const CAGE = '케이지 동반시에만 가능해요';

describe('목록 카드의 같은 근거 문장 접기 (14 W261006.5)', () => {
  it('과반이 같은 문장이면 그 문장과 수', () => {
    expect(placesPageRepeatedReason([CAGE, CAGE, CAGE, undefined, '야외 자리만 가능해요'])).toEqual({ text: CAGE, count: 3 });
  });

  it('과반이 아니면 접지 않는다 — 여러 이유 중 하나일 뿐이다', () => {
    expect(placesPageRepeatedReason([CAGE, CAGE, CAGE, 'a', 'b', undefined])).toBeNull();
  });

  it('두 곳이 같은 말을 하는 것은 접지 않는다', () => {
    expect(placesPageRepeatedReason([CAGE, CAGE])).toBeNull();
    expect(placesPageRepeatedReason([])).toBeNull();
  });

  it('갈 수 있는 곳(근거 없음)은 같은 문장으로 세지 않는다', () => {
    expect(placesPageRepeatedReason([undefined, undefined, undefined, undefined])).toBeNull();
  });

  it('시드 식당 — 5kg·이동 수단 없음이면 28곳이 같은 문장이다', () => {
    const dog = { dogs: [{ name: '콩이', weightKg: 5 }], carrier: 'none' as const };
    const reasons = placesOfType('restaurant').map((p) => primaryReason(judgeEligibility(dog, p.policy))?.text);
    const repeated = placesPageRepeatedReason(reasons);
    expect(repeated?.text).toBe(CAGE);
    expect(repeated!.count).toBeGreaterThan(reasons.length / 2);
  });
});
