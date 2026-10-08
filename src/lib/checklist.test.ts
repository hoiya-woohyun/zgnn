import { describe, expect, it } from 'vitest';
import {
  CARRY_BAG_ITEM_NAME,
  checklistProgress,
  filterChecklistItems,
  shouldAskCarrierBag,
  shouldOfferStroller,
  STROLLER_ITEM_NAME,
  variantsForDog,
  visibleItems,
} from './checklist';
import { ITEMS } from './places';
import type { TDogProfile } from '../types';

const idOf = (name: string) => ITEMS.find((item) => item.name === name)!.id;

describe('visibleItems', () => {
  it('계절을 고르지 않으면 사계절 항목만 보인다', () => {
    expect(visibleItems(null).every((item) => item.seasons.includes('사계절'))).toBe(true);
  });

  it('여름을 고르면 여름 항목이 더해진다', () => {
    expect(visibleItems('여름').length).toBeGreaterThan(visibleItems(null).length);
  });
});

// itemGroups.test.ts 에서 옮겨 왔다 — 묶음은 ADR-009 v4 에서 없어졌지만 갈래 합치기는 그대로다.
describe('ITEMS 갈래 합치기', () => {
  const itemNamed = (name: string) => ITEMS.find((item) => item.name === name)!;

  it('기내용 가방은 한 줄로 합쳐지고 몸무게 구간이 그 안으로 들어간다', () => {
    const bag = itemNamed('강아지 기내용 가방');
    expect(bag).toBeDefined();
    expect(bag.variants?.map((variant) => variant.label)).toEqual(['5kg 이하', '5kg 이상']);
    // 갈래마다 링크가 다르다 — 합치면서 하나로 뭉개면 5kg 이상인 사람이 잘못된 상품을 본다.
    expect(new Set(bag.variants?.map((variant) => variant.linkUrl)).size).toBe(2);
    // 합쳐진 항목은 바깥 링크를 갖지 않는다. 있으면 시트 안에 링크가 세 개가 된다.
    expect(bag.linkUrl).toBeUndefined();
  });

  it('합쳐진 원본 두 줄은 목록에서 사라진다 — 남으면 영영 체크되지 않는 줄이 된다', () => {
    const names = ITEMS.map((item) => item.name);
    expect(names).not.toContain('강아지 기내용 가방(5kg 이하)');
    expect(names).not.toContain('강아지 기내용 가방(5kg 이상)');
    expect(new Set(ITEMS.map((item) => item.id)).size).toBe(ITEMS.length);
  });
});

describe('checklistProgress', () => {
  it('분모는 준비물 전부다 — 계절 물건도 늘 들어간다(ADR-009 v4: 계절로 거르면 검색한 물건이 안 나온다)', () => {
    const view = checklistProgress([]);
    expect(view.total).toBe(ITEMS.length);
    expect(view.items.some((item) => !item.seasons.includes('사계절'))).toBe(true);
  });

  it('체크한 것만 챙긴 것으로 센다', () => {
    expect(checklistProgress([]).packed).toBe(0);
    expect(checklistProgress([idOf('얇은 이불/담요'), idOf('배변봉투')]).packed).toBe(2);
  });

  it('목록에 없는 id(지난 데이터의 체크)는 세지 않는다', () => {
    expect(checklistProgress(['사라진-항목']).packed).toBe(0);
  });
});

describe('filterChecklistItems', () => {
  const checked = [idOf('배변봉투')];

  it('빈 검색어 · 전체면 원본 그대로, 순서도 같다', () => {
    expect(filterChecklistItems(ITEMS, '  ', 'all', checked)).toEqual(ITEMS);
  });

  it('이름 일부로 찾는다 — 앞뒤 공백은 무시한다', () => {
    const names = filterChecklistItems(ITEMS, ' 배변 ', 'all', checked).map((item) => item.name);
    expect(names).toContain('배변봉투');
  });

  it('챙긴 것 · 안 챙긴 것은 체크로 가른다', () => {
    expect(filterChecklistItems(ITEMS, '', 'packed', checked).map((item) => item.name)).toEqual(['배변봉투']);
    expect(filterChecklistItems(ITEMS, '', 'unpacked', checked)).toHaveLength(ITEMS.length - 1);
  });

  it('검색어와 보기 칩은 함께 건다 — 챙긴 것 안에서 못 찾으면 빈 목록', () => {
    expect(filterChecklistItems(ITEMS, '이불', 'packed', checked)).toEqual([]);
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
