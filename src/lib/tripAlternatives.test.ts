import { describe, expect, it } from 'vitest';
import { judgeEligibility } from './eligibility';
import { PLACES } from './places';
import { TRIP_ALTERNATIVES_LIMIT, tripAlternatives } from './tripAlternatives';
import type { TDogProfile } from '../types';

const BORI: TDogProfile = { dogs: [{ name: '보리', weightKg: 30 }], carrier: 'none' };
const TOFU: TDogProfile = { dogs: [{ name: '두부', weightKg: 4 }], carrier: 'bag' };

const blockedFor = (dog: TDogProfile) =>
  PLACES.filter((place) => judgeEligibility(dog, place.policy).level === 'hard' && place.geo && place.region.town);

describe('tripAlternatives — 걸린 장소의 대안(16 T2.2)', () => {
  it.each([
    ['보리(30kg·이동 수단 없음)', BORI],
    ['두부(4kg·이동가방)', TOFU],
  ])('%s: 같은 종류·같은 읍면·갈 수 있어요만, 가까운 순, 셋까지', (_label, dog) => {
    for (const blocked of blockedFor(dog)) {
      const alternatives = tripAlternatives(blocked, dog);
      expect(alternatives.length).toBeLessThanOrEqual(TRIP_ALTERNATIVES_LIMIT);
      for (const { place } of alternatives) {
        expect(place.id).not.toBe(blocked.id);
        expect(place.type).toBe(blocked.type);
        expect(place.region.town).toBe(blocked.region.town);
        expect(judgeEligibility(dog, place.policy).level).toBe('ok');
      }
      const kms = alternatives.map(({ km }) => km);
      expect(kms).toEqual([...kms].sort((a, b) => a - b));
    }
  });

  it('보리에게 대안이 실제로 나오는 걸린 곳이 있다 — 위 검사가 빈 배열로만 통과하지 않게', () => {
    expect(blockedFor(BORI).some((blocked) => tripAlternatives(blocked, BORI).length > 0)).toBe(true);
  });

  it('같은 읍면에서 가장 가까운 "갈 수 있어요" 를 빠뜨리지 않는다', () => {
    const blocked = blockedFor(BORI).find((place) => tripAlternatives(place, BORI).length > 0)!;
    const expected = PLACES.filter(
      (place) =>
        place.id !== blocked.id &&
        place.geo &&
        place.type === blocked.type &&
        place.region.town === blocked.region.town &&
        judgeEligibility(BORI, place.policy).level === 'ok',
    );
    expect(tripAlternatives(blocked, BORI).length).toBe(Math.min(expected.length, TRIP_ALTERNATIVES_LIMIT));
  });

  it('그 하루에 이미 있는 곳(excludeIds)은 내지 않는다', () => {
    const blocked = blockedFor(BORI).find((place) => tripAlternatives(place, BORI).length > 0)!;
    const [first] = tripAlternatives(blocked, BORI);
    const without = tripAlternatives(blocked, BORI, { excludeIds: new Set([first.place.id]) });
    expect(without.map(({ place }) => place.id)).not.toContain(first.place.id);
  });

  it('실내 자리가 꼭 필요하면(needsIndoor) 야외만 되는 곳은 대안이 아니다', () => {
    for (const blocked of blockedFor(BORI)) {
      for (const { place } of tripAlternatives(blocked, BORI, { needsIndoor: true })) {
        expect(judgeEligibility(BORI, place.policy, { needsIndoor: true }).level).toBe('ok');
      }
    }
  });
});
