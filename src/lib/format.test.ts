import { describe, expect, it } from 'vitest';
import { formatStayPrice, stayPriceSourceLine } from './format';
import { PLACES } from './places';

const YOHOREUGI = { text: '150,000원 ~ 200,000원\n(인스타 DM이 빨라요)', min: 150000, max: 200000, note: '인스타 DM이 빨라요' };

describe('formatStayPrice — 괄호는 요금의 조건만 (14 W261013.7a)', () => {
  it('인원 기준은 금액 줄에 붙는다', () => {
    expect(formatStayPrice({ text: '230,000원 (3인)', min: 230000, max: 230000, note: '3인' })).toBe('230,000원 (3인)');
    expect(formatStayPrice({ text: '200,000원 ~ 270,000원 (4인)', min: 200000, max: 270000, note: '4인' })).toBe(
      '200,000원 ~ 270,000원 (4인)',
    );
  });

  it('연락 팁은 금액 줄에서 뗀다(요호르기)', () => {
    expect(formatStayPrice(YOHOREUGI)).toBe('150,000원 ~ 200,000원');
  });

  it('괄호가 둘이면 조건만 남긴다', () => {
    const price = { text: '200,000원 (2인 기준) (전화 문의)', min: 200000, max: 200000, note: '2인 기준, 전화 문의' };
    expect(formatStayPrice(price)).toBe('200,000원 (2인 기준)');
    expect(stayPriceSourceLine(price)).toBe('전화 문의');
  });
});

describe('stayPriceSourceLine', () => {
  it('원문이 금액 + 괄호뿐이면 뗀 팁만 — 같은 요금을 두 번 그리지 않는다(요호르기)', () => {
    expect(stayPriceSourceLine(YOHOREUGI)).toBe('인스타 DM이 빨라요');
  });

  it('원문이 굵은 줄보다 더 말하면 원문을 그대로 돌려준다', () => {
    const price = { text: '비수기 140,000원\n성수기 170,000원', min: 140000, max: 170000 };
    expect(stayPriceSourceLine(price)).toBe('비수기 140,000원\n성수기 170,000원');
  });

  it('원문과 굵은 줄이 같으면 null', () => {
    expect(stayPriceSourceLine({ text: '100,000원', min: 100000, max: 100000 })).toBeNull();
    expect(stayPriceSourceLine({ text: '230,000원 (3인)', min: 230000, max: 230000, note: '3인' })).toBeNull();
  });

  // 실제 숙소 전부 — 괄호 하나도 잃지 않는다: 굵은 줄에서 뺀 것은 밑 줄에 있다.
  it('실데이터: 원문 괄호는 굵은 줄 아니면 밑 줄에 있다', () => {
    for (const place of PLACES) {
      const price = place.stay?.price;
      if (!price?.note) continue;
      const shown = `${formatStayPrice(price)} ${stayPriceSourceLine(price) ?? ''}`;
      for (const part of price.note.split(', ')) expect(shown, place.name).toContain(part);
    }
  });
});
