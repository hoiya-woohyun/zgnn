import { describe, expect, it } from 'vitest';
import { judgeEligibility } from './eligibility';
import { dogSubsetWhatIf } from './dogSubsetWhatIf';
import { parsePetPolicy } from './petPolicy';
import type { TDogProfile } from '../types';

const DAEJANG_CHOCO: TDogProfile = { dogs: [{ name: '대장', weightKg: 18 }, { name: '초코', weightKg: 12 }], carrier: 'none' };

const whatIf = (dog: TDogProfile, text: string) => {
  const policy = parsePetPolicy(text);
  return dogSubsetWhatIf(dog, policy, judgeEligibility(dog, policy));
};

describe('dogSubsetWhatIf', () => {
  it('무게 상한에 걸리는 아이를 빼면 가는 조합을 찾는다', () => {
    const result = whatIf(DAEJANG_CHOCO, '15kg 이하 2마리까지');
    expect(result?.names).toEqual(['초코']);
    expect(result?.eligibility.level).not.toBe('hard');
  });

  it('마릿수 상한이면 가장 많이 — 같은 수면 무거운 쪽', () => {
    const three: TDogProfile = {
      dogs: [{ name: '단비', weightKg: 5 }, { name: '솜', weightKg: 7 }, { name: '구름', weightKg: 6 }],
      carrier: 'none',
    };
    expect(whatIf(three, '2마리까지')?.names).toEqual(['솜', '구름']);
  });

  it('어려움이 아니면 묻지 않는다 · 한 마리면 묻지 않는다 · 누구를 빼도 안 되면 null', () => {
    expect(whatIf(DAEJANG_CHOCO, '실내외 모두 가능.')).toBeNull();
    expect(whatIf({ dogs: [{ name: '대장', weightKg: 18 }], carrier: 'none' }, '10kg 이하')).toBeNull();
    expect(whatIf(DAEJANG_CHOCO, '5kg 이하')).toBeNull();
  });

  it('크기 수정은 부분집합에 가져가지 않는다', () => {
    const dog: TDogProfile = { ...DAEJANG_CHOCO, sizeOverride: 'large' };
    expect(whatIf(dog, '15kg 이하 2마리까지')?.names).toEqual(['초코']);
  });
});
