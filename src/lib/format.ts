import type { TStayPrice } from '../types';

const won = (value: number) => `${value.toLocaleString('ko-KR')}원`;

/** 숙소 1박 요금을 '140,000원 ~ 170,000원 (4인)' 형태로 만든다. */
export const formatStayPrice = (price: TStayPrice): string => {
  const { min, max, note } = price;
  let body: string;
  if (min === undefined && max === undefined) body = price.text.split('\n')[0];
  else if (min !== undefined && max !== undefined && min !== max) body = `${won(min)} ~ ${won(max)}`;
  else body = won((min ?? max) as number);
  return note ? `${body} (${note})` : body;
};

/**
 * 굵은 요금 줄 밑에 원문을 한 번 더 보일지 — 원문이 그 줄보다 더 말할 때만 원문을 돌려준다.
 * 줄바꿈·공백만 다른 원문("…원\n(인스타 DM이 빨라요)")을 따로 그리면 같은 요금이 두 번 선다.
 */
export const stayPriceSourceLine = (price: TStayPrice): string | null => {
  const flat = price.text.replace(/\s+/g, ' ').trim();
  return flat === '' || flat === formatStayPrice(price) ? null : price.text;
};

export const formatKm = (km: number): string => (km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`);

/** 쿠팡 파트너스 링크와 네이버 링크를 버튼 문구로 구분한다. */
export const linkLabel = (url: string): string => {
  if (url.includes('coupang')) return '쿠팡에서 보기';
  if (url.includes('naver')) return '네이버에서 보기';
  return '링크 열기';
};
