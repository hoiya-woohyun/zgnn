import type { TStayPrice } from '../types';

const won = (value: number) => `${value.toLocaleString('ko-KR')}원`;

/**
 * 요금 원문 괄호(`price.note`, `parsePrice` 가 ", " 로 이은 것)가 **요금의 조건**인가 — 인원·박수·기간·포함 여부.
 * 조건이면 금액 줄에 붙고, 아니면(요호르기 "인스타 DM이 빨라요" 같은 연락 팁) 금액 줄에서 뗀다(14 W261013.7a).
 * 모르는 말은 조건이 아닌 쪽으로 넘어진다 — 떼어도 상세의 밑 줄(`stayPriceSourceLine`)이 그대로 보여 잃는 것이 없다.
 */
const PRICE_CONDITION_RE = /\d+\s*인|기준|\d+\s*박|성수기|비수기|주말|주중|평일|포함|별도/;

const priceNotes = (price: TStayPrice) => {
  const parts = price.note ? price.note.split(', ').filter(Boolean) : [];
  return {
    conditions: parts.filter((part) => PRICE_CONDITION_RE.test(part)),
    asides: parts.filter((part) => !PRICE_CONDITION_RE.test(part)),
  };
};

const withParens = (body: string, notes: string[]) => (notes.length > 0 ? `${body} (${notes.join(', ')})` : body);

const stayPriceBody = (price: TStayPrice): string => {
  const { min, max } = price;
  if (min === undefined && max === undefined) return price.text.split('\n')[0];
  if (min !== undefined && max !== undefined && min !== max) return `${won(min)} ~ ${won(max)}`;
  return won((min ?? max) as number);
};

/** 숙소 1박 요금을 '140,000원 ~ 170,000원 (4인)' 형태로 만든다. 괄호는 요금의 조건만 — 연락 팁은 뺀다(`PRICE_CONDITION_RE`). */
export const formatStayPrice = (price: TStayPrice): string => withParens(stayPriceBody(price), priceNotes(price).conditions);

/**
 * 굵은 요금 줄 밑에 한 줄 더 보일 것 — 없으면 null.
 * - 원문이 금액 + 괄호뿐이면 굵은 줄에서 뗀 괄호(연락 팁)만 돌려준다. 원문을 통째로 그리면 같은 요금이 두 번 선다
 *   (요호르기 "…원\n(인스타 DM이 빨라요)" — 줄바꿈·공백만 다르다).
 * - 원문이 그보다 더 말하면("비수기 140,000원\n성수기 170,000원") 원문을 그대로 — 뗀 괄호도 그 안에 있다.
 */
export const stayPriceSourceLine = (price: TStayPrice): string | null => {
  const flat = price.text.replace(/\s+/g, ' ').trim();
  if (flat === '') return null;
  // 원문이 "금액 (괄호…)" 그대로인가 — 괄호를 걷어 낸 나머지가 금액 줄과 같으면 원문은 더 말하는 게 없다("(a) (b)" 도 "(a, b)" 도).
  if (flat.replace(/\s*\([^)]*\)/g, '').trim() !== stayPriceBody(price)) return price.text;
  const { asides } = priceNotes(price);
  return asides.length > 0 ? asides.join(', ') : null;
};

export const formatKm = (km: number): string => (km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`);

/** 쿠팡 파트너스 링크와 네이버 링크를 버튼 문구로 구분한다. */
export const linkLabel = (url: string): string => {
  if (url.includes('coupang')) return '쿠팡에서 보기';
  if (url.includes('naver')) return '네이버에서 보기';
  return '링크 열기';
};
