import { describe, expect, it } from 'vitest';
import { ITEM_GROUP_ORDER, groupItems, groupOfItem } from './itemGroups';
import { checklistView } from './checklist';
import { parsePetPolicy } from './petPolicy';
import { ITEMS } from './places';
import type { TPlaceEntry } from './places';
import { visibleItems } from './seasonItems';
import type { TPlaceType } from '../types';

const itemNamed = (name: string) => ITEMS.find((item) => item.name === name)!;

describe('ITEMS 갈래 합치기', () => {
  it('기내용 가방은 한 줄로 합쳐지고 몸무게 구간이 그 안으로 들어간다', () => {
    const bag = itemNamed('강아지 기내용 가방');
    expect(bag).toBeDefined();
    expect(bag.variants?.map((variant) => variant.label)).toEqual(['5kg 이하', '5kg 이상']);
    // 갈래마다 링크가 다르다 — 합치면서 하나로 뭉개면 5kg 이상인 사람이 잘못된 상품을 본다.
    expect(new Set(bag.variants?.map((variant) => variant.linkUrl)).size).toBe(2);
    // 합쳐진 항목은 바깥 링크를 갖지 않는다. 있으면 한 줄 안에 링크가 세 개가 된다.
    expect(bag.linkUrl).toBeUndefined();
  });

  it('합쳐진 원본 두 줄은 목록에서 사라진다 — 남으면 영영 체크되지 않는 줄이 된다', () => {
    const names = ITEMS.map((item) => item.name);
    expect(names).not.toContain('강아지 기내용 가방(5kg 이하)');
    expect(names).not.toContain('강아지 기내용 가방(5kg 이상)');
    expect(new Set(ITEMS.map((item) => item.id)).size).toBe(ITEMS.length);
  });
});

describe('groupOfItem', () => {
  it('규칙 표의 장소 종류가 묶음을 정한다', () => {
    expect(groupOfItem(itemNamed('배변봉투'))).toBe('everywhere');
    expect(groupOfItem(itemNamed('휴대용 물병/밥그릇'))).toBe('eatingOut');
    expect(groupOfItem(itemNamed('얇은 이불/담요'))).toBe('stay');
  });

  it('장소 규칙이 없는 이동 물건은 오가는 길 묶음이다', () => {
    expect(groupOfItem(itemNamed('강아지 기내용 가방'))).toBe('travel');
    expect(groupOfItem(itemNamed('강아지 유모차'))).toBe('travel');
  });
});

describe('groupItems', () => {
  it('묶음으로 갈라도 항목이 사라지거나 겹치지 않는다', () => {
    const items = visibleItems('여름');
    const flattened = groupItems(items).flatMap((group) => group.items);
    expect(flattened.map((item) => item.id).sort()).toEqual(items.map((item) => item.id).sort());
  });

  it('빈 묶음은 빠지고, 순서는 ITEM_GROUP_ORDER 를 따른다', () => {
    const groups = groupItems([itemNamed('얇은 이불/담요'), itemNamed('강아지 유모차')]);
    expect(groups.map((group) => group.id)).toEqual(['travel', 'stay']);
    expect(groups.every((group) => group.items.length > 0)).toBe(true);
    const order = groups.map((group) => ITEM_GROUP_ORDER.indexOf(group.id));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });
});

/**
 * 준비물 화면은 목록을 묶음 섹션으로만 나눠 그린다. 묶음의 합이 계절 전체와 어긋나면
 * 화면에는 **없는 준비물**이 생기거나 **두 번 나오는** 준비물이 생긴다. 빌드도 테스트도
 * 통과하고 숫자만 틀리는 종류라, 화면이 하는 계산을 그대로 따라 해 본다.
 */
describe('화면이 나누는 묶음 섹션', () => {
  const placeOf = (type: TPlaceType): TPlaceEntry => ({
    id: `${type}-test`,
    type,
    name: '테스트',
    region: { direction: 'east', town: '구좌읍', raw: '구좌읍' },
    features: '',
    petPolicyText: '',
    images: [],
    policy: parsePetPolicy(''),
  });

  it.each([
    ['저장한 곳 없음', null, []],
    ['카페 한 곳', null, [placeOf('cafe')]],
    ['여름 · 숙소와 식당', '여름', [placeOf('stay'), placeOf('restaurant')]],
  ] as const)('%s — 묶음을 합치면 계절 전체와 정확히 같다', (_label, season, saved) => {
    const shown = groupItems(checklistView(season, [], [...saved]).items).flatMap((group) => group.items);
    expect(shown.map((item) => item.id).sort()).toEqual(
      visibleItems(season).map((item) => item.id).sort(),
    );
    // 정렬해 비교하면 중복이 가려진다 — 개수도 따로 본다.
    expect(new Set(shown.map((item) => item.id)).size).toBe(shown.length);
  });
});
