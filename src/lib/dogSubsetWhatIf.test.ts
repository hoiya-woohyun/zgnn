import { describe, expect, it } from 'vitest';
import { judgeEligibility } from './eligibility';
import { dogSubsetLead, dogSubsetWhatIf } from './dogSubsetWhatIf';
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

  it('카페의 "소형견만"(H3)도 — 소형견이 아닌 아이를 빼면 가는 조합(14 W261010.15)', () => {
    const three: TDogProfile = {
      dogs: [{ name: '보리', weightKg: 12 }, { name: '단풍', weightKg: 4 }, { name: '깜지', weightKg: 6 }],
      carrier: 'none',
    };
    const result = whatIf(three, '소형견만 가능해요');
    expect(result?.names).toEqual(['단풍', '깜지']);
    expect(result?.eligibility.level).toBe('ok');
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

describe('dogSubsetLead — 누구로도 되면 하나만 부르지 않는다(14 W261019.9)', () => {
  const lead = (dog: TDogProfile, text: string) => {
    const result = whatIf(dog, text);
    return result && dogSubsetLead(result, dog.dogs.map((d) => d.name));
  };

  it('웨스티하우스 × 콩(2.5kg)·해피(12kg) — 누구 한 마리만 가도 되면 둘 다 부른다("콩은 안 되는 줄 알았다")', () => {
    const dog: TDogProfile = { dogs: [{ name: '콩', weightKg: 2.5 }, { name: '해피', weightKg: 12 }], carrier: 'none' };
    // 실제 원문 그대로 — 10kg 미만 2마리 · 20kg 미만 1마리. 콩은 10kg 구간, 해피는 20kg 구간이 받는다.
    const result = whatIf(dog, '10kg 미만의 경우 최대 2마리 가능. 20kg 미만(중형견)의 경우 최대 1마리 가능.');
    expect(result?.names).toEqual(['해피']); // 대표 조합(무거운 쪽)은 그대로
    expect(result?.ties).toEqual([['콩'], ['해피']]);
    expect(dogSubsetLead(result!, ['콩', '해피'])).toBe('콩이나 해피 중 한 마리만 데려가면');
  });

  it('세 마리 중 누구 한 마리만 빼도 되면 빠지는 쪽으로 — 프로필 순서', () => {
    const three: TDogProfile = {
      dogs: [{ name: '단비', weightKg: 5 }, { name: '솜', weightKg: 7 }, { name: '구름', weightKg: 6 }],
      carrier: 'none',
    };
    expect(lead(three, '2마리까지')).toBe('단비, 솜이, 구름이 중 한 마리만 두고 가면');
  });

  it('한 조합뿐이면 지금처럼 이름으로', () => {
    expect(lead(DAEJANG_CHOCO, '15kg 이하 2마리까지')).toBe('초코만 데려가면');
  });

  it('수는 같아도 판정이 다르면 묶지 않는다 — 뒤의 머리글이 모두에게 참이어야 한다', () => {
    // 대장(28kg)은 혼자면 크기 언급이 없어 확인 필요(C5), 초코(6kg)는 갈 수 있어요 — 둘이 같이는 1마리 상한에 걸린다.
    const dog: TDogProfile = { dogs: [{ name: '대장', weightKg: 28 }, { name: '초코', weightKg: 6 }], carrier: 'none' };
    const result = whatIf(dog, '1마리까지 가능해요');
    expect(result?.names).toEqual(['초코']);
    expect(result?.eligibility.level).toBe('ok');
    expect(result?.ties).toEqual([['초코']]);
    expect(lead(dog, '1마리까지 가능해요')).toBe('초코만 데려가면');
  });
});
