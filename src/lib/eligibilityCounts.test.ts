import { describe, expect, it } from 'vitest';
import { carrierWhatIf, countByLevel, outdoorFallback } from './eligibilityCounts';
import { parsePetPolicy } from './petPolicy';
import { placesOfType } from './places';
import type { TDogProfile } from '../types';

// 리뷰(2026-09-29) 민준 — 대형견 2마리, 이동 수단 없음.
const DAEJANG_AND_CHOCO: TDogProfile = {
  dogs: [{ name: '대장', weightKg: 28 }, { name: '초코', weightKg: 17 }],
  carrier: 'none',
};

describe('countByLevel', () => {
  // 리뷰 §2 표는 확인 3 · 정보 없음 5 였다 — 맘앤도그("정보 없음 … 대형견도 동반 가능!!")가 정보 없음 → 확인으로 옮겼다(14 W261006.3).
  it('숙소 × 대형 2마리 — 가능 4 · 확인 4 · 정보 없음 4 · 어려움 14', () => {
    expect(countByLevel(placesOfType('stay'), DAEJANG_AND_CHOCO)).toEqual({ ok: 4, cond: 4, unknown: 4, hard: 14 });
  });

  it('레벨 합은 곳 수와 같다', () => {
    const places = placesOfType('restaurant');
    const counts = countByLevel(places, DAEJANG_AND_CHOCO);
    expect(counts.ok + counts.cond + counts.unknown + counts.hard).toBe(places.length);
  });

  it('빈 목록이면 전부 0', () => {
    expect(countByLevel([], DAEJANG_AND_CHOCO)).toEqual({ ok: 0, cond: 0, unknown: 0, hard: 0 });
  });
});

describe('carrierWhatIf — 이동가방이 있으면 몇 곳이 열리나', () => {
  const TOFU_NONE: TDogProfile = { dogs: [{ name: '두부', weightKg: 4 }], carrier: 'none' };
  const cageOnly = [parsePetPolicy('케이지 동반시 가능.'), parsePetPolicy('실내는 케이지 필수.')].map((policy) => ({ policy }));

  it('이동 수단 없음 + 케이지 필수 식당들 → 가방이면 어려움에서 벗어난다', () => {
    expect(carrierWhatIf(cageOnly, TOFU_NONE)).toEqual({ carrier: 'bag', opened: 2 });
  });

  it('실제 식당 목록에서도 0 보다 크다', () => {
    expect(carrierWhatIf(placesOfType('restaurant'), TOFU_NONE)?.opened).toBeGreaterThan(0);
  });

  it('이미 이동가방 프로필이면 null', () => {
    expect(carrierWhatIf(cageOnly, { ...TOFU_NONE, carrier: 'bag' })).toBeNull();
  });

  it('결과가 0곳이면 null', () => {
    expect(carrierWhatIf([], TOFU_NONE)).toBeNull();
  });

  it('대형견은 가방이어도 H4 가 그대로라 열리는 곳이 없다 → null', () => {
    expect(carrierWhatIf(cageOnly, DAEJANG_AND_CHOCO)).toBeNull();
  });
});

describe('outdoorFallback — 갈 수 있는 곳이 없을 때 야외 자리로 되는 곳 (14 W261006.5)', () => {
  const BORI: TDogProfile = { dogs: [{ name: '보리', weightKg: 30 }], carrier: 'none' };

  it('식당 × 30kg — 가능 0곳, 야외 자리로는 3곳', () => {
    const restaurants = placesOfType('restaurant');
    expect(countByLevel(restaurants, BORI).ok).toBe(0);
    const outdoor = outdoorFallback(restaurants, BORI);
    expect(outdoor).toHaveLength(3);
    // 그 곳들만 시트로 펼치므로 곳 자체를, 목록 순서대로 돌려준다(14 W261006.5a).
    expect(outdoor?.every((place) => place.policy.outdoorFree)).toBe(true);
    expect(outdoor?.map((place) => place.id)).toEqual(
      restaurants.filter((place) => outdoor?.includes(place)).map((place) => place.id),
    );
  });

  it('갈 수 있는 곳이 하나라도 있으면 null', () => {
    expect(outdoorFallback(placesOfType('restaurant'), { dogs: [{ name: '콩이', weightKg: 5 }], carrier: 'none' })).toBeNull();
  });

  it('실내 자리가 꼭 필요하면 야외는 차선이 아니다 → null', () => {
    expect(outdoorFallback(placesOfType('restaurant'), BORI, { needsIndoor: true })).toBeNull();
  });

  it('야외가 열린 곳이 없으면 null', () => {
    expect(outdoorFallback([{ policy: parsePetPolicy('케이지 동반시 가능.') }], BORI)).toBeNull();
  });
});
