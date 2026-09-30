import { describe, expect, it } from 'vitest';
import { CARRY_BAG_ITEM_NAME, checklistView, shouldAskCarrierBag, visibleItems } from './checklist';
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
  it('저장한 곳이 없으면 계절 전체가 분모다(예전 checklistProgress 와 같은 동작)', () => {
    const view = checklistView(null, [], []);
    expect(view.scopedToTrip).toBe(false);
    expect(view.total).toBe(visibleItems(null).length);
    expect(view.tripItems).toEqual([]);
    expect(view.restItems).toEqual(visibleItems(null));
  });

  it('저장한 곳이 있으면 거기 필요한 것만 분모가 된다', () => {
    const view = checklistView(null, [], [placeOf('cafe')]);
    expect(view.scopedToTrip).toBe(true);
    expect(view.total).toBe(view.tripItems.length);
    expect(view.total).toBeLessThan(visibleItems(null).length);
  });

  it('이번 여행 항목과 나머지는 겹치지 않고 합치면 계절 전체다', () => {
    const view = checklistView('여름', [], [placeOf('stay'), placeOf('restaurant')]);
    const all = [...view.tripItems, ...view.restItems].map((item) => item.id).sort();
    expect(all).toEqual(visibleItems('여름').map((item) => item.id).sort());
  });

  it('진행률은 이번 여행 항목 안에서만 센다 — 관계없는 것을 체크해도 오르지 않는다', () => {
    const cafeOnly = [placeOf('cafe')];
    expect(checklistView(null, [idOf('얇은 이불/담요')], cafeOnly).ready).toBe(0);
    expect(checklistView(null, [idOf('배변봉투')], cafeOnly).ready).toBe(1);
  });

  it('숙소가 갖고 있는 물건도 준비된 것으로 센다 — 목록의 흐린 줄과 숫자가 어긋나면 안 된다', () => {
    const stay = [placeOf('stay', '강아지 침대 구비.')];
    const view = checklistView(null, [], stay);
    expect(view.providedItemIds.has(idOf('얇은 이불/담요'))).toBe(true);
    expect(view.ready).toBe(1);
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
