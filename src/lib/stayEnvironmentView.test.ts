import { describe, expect, it } from 'vitest';
import { environmentPhrases } from './stayEnvironmentView';

describe('environmentPhrases', () => {
  it('아는 것만, 울타리 마당이면 마당을 두 번 말하지 않는다', () => {
    expect(environmentPhrases({ standalone: true, yard: true, fencedYard: true, stairs: false })).toEqual(['독채', '울타리 있는 마당', '계단 없음']);
    expect(environmentPhrases({ standalone: null, yard: true, fencedYard: null, stairs: true })).toEqual(['마당', '계단·복층 있음']);
    expect(environmentPhrases(undefined)).toEqual([]);
  });
});
