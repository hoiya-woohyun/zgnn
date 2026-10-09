import { describe, expect, it } from 'vitest';
import { stayPriceSourceLine } from './format';

describe('stayPriceSourceLine', () => {
  it('줄바꿈·공백만 다른 원문은 다시 그리지 않는다(요호르기)', () => {
    const price = { text: '150,000원 ~ 200,000원\n(인스타 DM이 빨라요)', min: 150000, max: 200000, note: '인스타 DM이 빨라요' };
    expect(stayPriceSourceLine(price)).toBeNull();
  });

  it('원문이 굵은 줄보다 더 말하면 원문을 그대로 돌려준다', () => {
    const price = { text: '비수기 140,000원\n성수기 170,000원', min: 140000, max: 170000 };
    expect(stayPriceSourceLine(price)).toBe('비수기 140,000원\n성수기 170,000원');
  });

  it('원문과 굵은 줄이 같으면 null', () => {
    expect(stayPriceSourceLine({ text: '100,000원', min: 100000, max: 100000 })).toBeNull();
  });
});
