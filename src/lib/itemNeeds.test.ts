import { describe, expect, it } from 'vitest';
import { ITEM_NEEDS, itemsNeededAt, itemsNeededForTrip, missingItemsAt } from './itemNeeds';
import { parsePetPolicy } from './petPolicy';
import { ITEMS } from './places';
import type { TPlaceEntry } from './places';
import type { TPlaceType } from '../types';

const placeOf = (
  type: TPlaceType,
  petPolicyText = '',
  amenitiesText?: string,
): TPlaceEntry => ({
  id: `${type}-test`,
  type,
  name: '테스트',
  region: { direction: 'east', town: '구좌읍', raw: '구좌읍' },
  features: '',
  petPolicyText,
  images: [],
  policy: parsePetPolicy(petPolicyText),
  ...(amenitiesText === undefined
    ? {}
    : { stay: { price: { text: '' }, amenitiesText } }),
});

const nameOf = (id: string) => ITEMS.find((item) => item.id === id)?.name;
const namesAt = (place: TPlaceEntry, season: Parameters<typeof itemsNeededAt>[1] = null) =>
  itemsNeededAt(place, season).map((item) => item.name);

describe('ITEM_NEEDS', () => {
  it('규칙의 itemName 이 전부 items.json 에 있다', () => {
    const missing = ITEM_NEEDS.filter((need) => !ITEMS.some((item) => item.name === need.itemName));
    expect(missing.map((need) => need.itemName)).toEqual([]);
  });

  it('이동 수단(가방·케이지·유모차)은 다루지 않는다 — 판정(eligibility)의 영역이다', () => {
    const carrierItems = ITEMS.filter((item) => /가방|유모차/.test(item.name));
    expect(carrierItems.length).toBeGreaterThan(0);
    for (const item of carrierItems) {
      expect(ITEM_NEEDS.some((need) => need.itemName === item.name)).toBe(false);
    }
  });
});

describe('itemsNeededAt', () => {
  it('카페에는 물병·간식이 필요하고 이불은 필요 없다', () => {
    const names = namesAt(placeOf('cafe'));
    expect(names).toContain('휴대용 물병/밥그릇');
    expect(names).toContain('오래 씹을 수 있는 간식');
    expect(names).not.toContain('얇은 이불/담요');
  });

  it('숙소에는 이불이 필요하고 물병은 필요 없다', () => {
    const names = namesAt(placeOf('stay'));
    expect(names).toContain('얇은 이불/담요');
    expect(names).not.toContain('휴대용 물병/밥그릇');
  });

  it('배변봉투처럼 어디서나 필요한 것은 세 종류 모두에 걸린다', () => {
    for (const type of ['stay', 'restaurant', 'cafe'] as TPlaceType[]) {
      expect(namesAt(placeOf(type))).toContain('배변봉투');
    }
  });

  it('기저귀는 풀어놓을 수 있는 곳에만 걸린다', () => {
    expect(namesAt(placeOf('restaurant', '실내외 모두 가능합니다.'))).toContain('기저귀');
    expect(namesAt(placeOf('restaurant', '실내는 케이지에 넣어야 입장 가능합니다.'))).not.toContain(
      '기저귀',
    );
  });

  it('계절을 고르지 않으면 여름 항목은 나오지 않는다', () => {
    expect(namesAt(placeOf('stay'), null)).not.toContain('강아지 튜브');
    expect(namesAt(placeOf('stay'), '여름')).toContain('강아지 튜브');
  });
});

describe('itemsNeededForTrip', () => {
  it('저장한 곳들의 합집합이고, 순서는 items.json 순서를 따른다', () => {
    const names = itemsNeededForTrip([placeOf('stay'), placeOf('cafe')], null).map((i) => i.name);
    expect(names).toContain('얇은 이불/담요');
    expect(names).toContain('휴대용 물병/밥그릇');
    expect(new Set(names).size).toBe(names.length);

    const order = ITEMS.map((item) => item.name).filter((name) => names.includes(name));
    expect(names).toEqual(order);
  });

  it('저장한 곳이 없으면 아무것도 필요하지 않다', () => {
    expect(itemsNeededForTrip([], null)).toEqual([]);
  });
});

describe('missingItemsAt', () => {
  it('이미 체크한 준비물은 빠진다', () => {
    const cafe = placeOf('cafe');
    const first = itemsNeededAt(cafe, null)[0]!;
    const missing = missingItemsAt(cafe, null, [first.id]);
    expect(missing.map((item) => item.id)).not.toContain(first.id);
    expect(nameOf(first.id)).toBeDefined();
  });

  it('이 숙소가 갖고 있는 물건은 빠진다 — 다른 숙소의 구비 용품에 휘둘리지 않는다', () => {
    const withBedding = placeOf('stay', '', '강아지 침대와 식기 구비.');
    const without = placeOf('stay', '', '없음');
    expect(missingItemsAt(withBedding, null, []).map((i) => i.name)).not.toContain('얇은 이불/담요');
    expect(missingItemsAt(without, null, []).map((i) => i.name)).toContain('얇은 이불/담요');
  });
});
