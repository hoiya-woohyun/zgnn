import { describe, expect, it } from 'vitest';
import { judgeEligibility } from './eligibility';
import { needsIndoorChangedLevel } from './needsIndoorWhatIf';
import { PLACES } from './places';
import type { TDogProfile } from '../types';

const BORI: TDogProfile = { dogs: [{ name: '보리', weightKg: 28 }], carrier: 'none' };
const policyOf = (name: string) => {
  const place = PLACES.find((p) => p.name === name);
  if (!place) throw new Error(`없는 장소: ${name}`);
  return place.policy;
};

describe('needsIndoorChangedLevel', () => {
  it('야외만 열린 곳에서 실내 필요가 어려움으로 올렸으면 true', () => {
    const policy = policyOf('무거버거');
    const current = judgeEligibility(BORI, policy, { needsIndoor: true });
    expect(current.level).toBe('hard');
    expect(needsIndoorChangedLevel(BORI, policy, current, true)).toBe(true);
  });

  it('꺼져 있으면 묻지 않는다', () => {
    const policy = policyOf('무거버거');
    expect(needsIndoorChangedLevel(BORI, policy, judgeEligibility(BORI, policy), false)).toBe(false);
  });

  it('켜져 있어도 등급이 그대로면 false', () => {
    const changed = PLACES.filter((place) => {
      const current = judgeEligibility(BORI, place.policy, { needsIndoor: true });
      return needsIndoorChangedLevel(BORI, place.policy, current, true);
    });
    // 바뀌는 곳이 있되, 전부는 아니다 — 실내 규칙(H4·H6·C4)이 걸리는 곳만.
    expect(changed.length).toBeGreaterThan(0);
    expect(changed.length).toBeLessThan(PLACES.length);
  });
});
