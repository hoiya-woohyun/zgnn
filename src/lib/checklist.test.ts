import { describe, expect, it } from 'vitest';
import {
  CARRY_BAG_ITEM_NAME,
  checklistView,
  shouldAskCarrierBag,
  shouldOfferStroller,
  STROLLER_ITEM_NAME,
  variantsForDog,
  visibleItems,
} from './checklist';
import { parsePetPolicy } from './petPolicy';
import { ITEMS } from './places';
import type { TPlaceEntry } from './places';
import type { TDogProfile, TPlaceType } from '../types';

const placeOf = (type: TPlaceType, amenitiesText?: string): TPlaceEntry => ({
  id: `${type}-test`,
  type,
  name: '테스트',
  region: { direction: 'east', town: '구좌읍', raw: '구좌읍' },
  features: '',
  petPolicyText: '',
  images: [],
  policy: parsePetPolicy(''),
  ...(amenitiesText === undefined ? {} : { stay: { price: { text: '' }, amenitiesText } }),
});

const idOf = (name: string) => ITEMS.find((item) => item.name === name)!.id;

describe('visibleItems', () => {
  it('계절을 고르지 않으면 사계절 항목만 보인다', () => {
    expect(visibleItems(null).every((item) => item.seasons.includes('사계절'))).toBe(true);
  });

  it('여름을 고르면 여름 항목이 더해진다', () => {
    expect(visibleItems('여름').length).toBeGreaterThan(visibleItems(null).length);
  });
});

describe('checklistView', () => {
  it('분모는 계절 전체다 — 저장한 곳이 없어도 있어도 같다', () => {
    expect(checklistView(null, [], []).total).toBe(visibleItems(null).length);
    expect(checklistView(null, [], [placeOf('cafe')]).total).toBe(visibleItems(null).length);
    expect(checklistView('여름', [], []).items).toEqual(visibleItems('여름'));
  });

  it('저장한 곳이 목록을 줄이지 않는다 — 카페만 저장해도 숙소 준비물이 남는다(ADR-009 v3)', () => {
    const names = checklistView(null, [], [placeOf('cafe')]).items.map((item) => item.name);
    expect(names).toContain('얇은 이불/담요');
  });

  it('체크한 것은 저장한 곳과 무관하게 센다', () => {
    const cafeOnly = [placeOf('cafe')];
    expect(checklistView(null, [idOf('얇은 이불/담요')], cafeOnly).ready).toBe(1);
  });

  it('숙소가 갖고 있는 물건도 준비된 것으로 센다 — 목록의 흐린 줄과 숫자가 어긋나면 안 된다', () => {
    const stay = [placeOf('stay', '강아지 침대 구비.')];
    const view = checklistView(null, [], stay);
    expect(view.providedItemIds.has(idOf('얇은 이불/담요'))).toBe(true);
    expect(view.ready).toBe(1);
  });

  it('숙소에 있는 것은 내가 챙긴 것과 따로 센다 — 아무것도 체크 안 했으면 챙긴 것은 0(07 U6)', () => {
    const view = checklistView(null, [], [placeOf('stay', '강아지 침대 구비.')]);
    expect(view.packed).toBe(0);
    expect(view.atStay).toBe(1);
  });

  it('체크했고 숙소에도 있으면 한 번만 센다 — 내가 챙긴 쪽으로', () => {
    const stay = [placeOf('stay', '강아지 침대 구비.')];
    const view = checklistView(null, [idOf('얇은 이불/담요')], stay);
    expect(view.ready).toBe(1);
    expect(view.packed).toBe(1);
    expect(view.atStay).toBe(0);
  });

  it('지금 계절에 안 보이는 체크는 세지 않는다', () => {
    const summerOnly = visibleItems('여름').find((item) => !item.seasons.includes('사계절'))!;
    expect(checklistView(null, [summerOnly.id], []).packed).toBe(0);
  });

  it('저장한 숙소들의 구비 용품을 전부 합쳐 반영한다', () => {
    const view = checklistView(null, [], [placeOf('stay', '강아지 식기와 침대 구비.')]);
    expect(view.providedItemIds.has(idOf('휴대용 물병/밥그릇'))).toBe(true);
    expect(view.providedItemIds.has(idOf('얇은 이불/담요'))).toBe(true);
  });
});

describe('shouldAskCarrierBag — 가방을 챙기면 프로필 이동 수단도 바꿀지 묻는다', () => {
  const dogWith = (carrier: TDogProfile['carrier']): TDogProfile => ({
    dogs: [{ name: '보리', weightKg: 4 }],
    carrier,
  });

  it('합친 가방 항목 이름이 ITEMS 에 실제로 있다 — 이름이 어긋나면 조용히 한 번도 안 묻는다', () => {
    expect(ITEMS.some((item) => item.name === CARRY_BAG_ITEM_NAME)).toBe(true);
  });

  it('가방을 막 체크했고 이동 수단이 없어요면 묻는다', () => {
    expect(shouldAskCarrierBag(CARRY_BAG_ITEM_NAME, true, dogWith('none'))).toBe(true);
  });

  it('체크를 풀 때는 묻지 않는다', () => {
    expect(shouldAskCarrierBag(CARRY_BAG_ITEM_NAME, false, dogWith('none'))).toBe(false);
  });

  it('이미 가방·케이지·유모차면 묻지 않는다', () => {
    for (const carrier of ['bag', 'cage', 'stroller'] as const) {
      expect(shouldAskCarrierBag(CARRY_BAG_ITEM_NAME, true, dogWith(carrier))).toBe(false);
    }
  });

  it('프로필이 없으면 묻지 않는다 — 바꿀 대상이 없다', () => {
    expect(shouldAskCarrierBag(CARRY_BAG_ITEM_NAME, true, null)).toBe(false);
  });

  it('다른 준비물은 묻지 않는다', () => {
    expect(shouldAskCarrierBag('배변봉투', true, dogWith('none'))).toBe(false);
  });
});

describe('variantsForDog — 기내용 가방 갈래를 몸무게로(14 W261007.13)', () => {
  const bag = ITEMS.find((item) => item.name === CARRY_BAG_ITEM_NAME)!;
  const labels = (dog: TDogProfile | null) => variantsForDog(bag.variants ?? [], dog).map((variant) => variant.label);
  const DUBU: TDogProfile = { dogs: [{ name: '두부', weightKg: 3 }], carrier: 'bag' };
  const BORI: TDogProfile = { dogs: [{ name: '보리', weightKg: 30 }], carrier: 'none' };
  const KONG_HAPPY: TDogProfile = { dogs: [{ name: '콩', weightKg: 2.5 }, { name: '해피', weightKg: 12 }], carrier: 'stroller' };

  it('갈래 둘에 몸무게 구간이 실려 있다 — 없으면 전부 보이는 쪽으로 조용히 물러난다', () => {
    expect(bag.variants?.every((variant) => variant.kg)).toBe(true);
  });

  it('한 마리면 맞는 갈래 하나', () => {
    expect(labels(DUBU)).toEqual(['5kg 이하']);
    expect(labels(BORI)).toEqual(['5kg 이상']);
  });

  it('여러 마리면 맞는 갈래의 합, 경계(5kg)는 둘 다', () => {
    expect(labels(KONG_HAPPY)).toEqual(['5kg 이하', '5kg 이상']);
    expect(labels({ dogs: [{ name: '오', weightKg: 5 }], carrier: 'none' })).toEqual(['5kg 이하', '5kg 이상']);
  });

  it('강아지가 없으면 전부', () => {
    expect(labels(null)).toEqual(['5kg 이하', '5kg 이상']);
  });
});

describe('shouldOfferStroller — 유모차 등록자에게 한 번에 챙기게(14 W261007.13)', () => {
  const stroller: TDogProfile = { dogs: [{ name: '콩', weightKg: 2.5 }], carrier: 'stroller' };

  it('이름이 준비물에 있다 — 어긋나면 조용히 한 번도 안 묻는다', () => {
    expect(ITEMS.some((item) => item.name === STROLLER_ITEM_NAME)).toBe(true);
  });

  it('유모차 프로필 · 안 챙김일 때만', () => {
    expect(shouldOfferStroller(STROLLER_ITEM_NAME, false, stroller)).toBe(true);
    expect(shouldOfferStroller(STROLLER_ITEM_NAME, true, stroller)).toBe(false);
    expect(shouldOfferStroller(CARRY_BAG_ITEM_NAME, false, stroller)).toBe(false);
    expect(shouldOfferStroller(STROLLER_ITEM_NAME, false, { ...stroller, carrier: 'bag' })).toBe(false);
    expect(shouldOfferStroller(STROLLER_ITEM_NAME, false, null)).toBe(false);
  });
});
