import { describe, expect, it } from 'vitest';
import { PLACES_PAGE_DOG_STEPS, placesPageDogStepFlags, placesPageDogStepOf } from './placesPageDogStep';

describe('placesPageDogStep — 강아지 기준 한 축 세 단계(22 D-6)', () => {
  it('플래그 둘을 한 단계로 읽는다 — 둘 다 켜져 있으면 더 좁은 갈 수 있는 곳만', () => {
    expect(placesPageDogStepOf({ onlyReachable: false, hideHard: false })).toBe('all');
    expect(placesPageDogStepOf({ onlyReachable: false, hideHard: true })).toBe('noHard');
    expect(placesPageDogStepOf({ onlyReachable: true, hideHard: false })).toBe('reachable');
    expect(placesPageDogStepOf({ onlyReachable: true, hideHard: true })).toBe('reachable');
  });

  it('고른 단계는 플래그를 하나만 남긴다 — 둘 다 켠 쓸모없는 상태를 만들지 않는다', () => {
    for (const { value } of PLACES_PAGE_DOG_STEPS) {
      const flags = placesPageDogStepFlags(value);
      expect(flags.onlyReachable && flags.hideHard).toBe(false);
      expect(placesPageDogStepOf(flags)).toBe(value);
    }
  });

  it('순서는 넓은 쪽부터 — 전부 · 어려운 곳 빼고 · 갈 수 있는 곳만', () => {
    expect(PLACES_PAGE_DOG_STEPS.map((step) => step.label)).toEqual(['전부', '어려운 곳 빼고', '갈 수 있는 곳만']);
  });
});
