import { describe, expect, it } from 'vitest';
import { categoryFitsType, categoryForType } from './placeCategory.mjs';

describe('업종이 종류와 맞는가(12 U3.6)', () => {
  it('식당의 카페·디저트·베이커리 업종은 버린다', () => {
    expect(categoryForType('카페,디저트', 'restaurant')).toBeNull();
    expect(categoryForType('베이커리', 'restaurant')).toBeNull();
    expect(categoryForType('펜션', 'restaurant')).toBeNull();
  });

  it('식당의 식사 업종·양쪽에 걸치는 브런치는 둔다', () => {
    expect(categoryForType('돼지고기구이', 'restaurant')).toBe('돼지고기구이');
    expect(categoryForType('브런치', 'restaurant')).toBe('브런치');
    expect(categoryForType('브런치', 'cafe')).toBe('브런치');
  });

  it('숙소는 숙박을 뜻하는 업종만 남긴다', () => {
    expect(categoryForType('펜션', 'stay')).toBe('펜션');
    expect(categoryForType('기타숙박업', 'stay')).toBe('기타숙박업');
    expect(categoryForType('카페,디저트', 'stay')).toBeNull();
  });

  it('카페는 숙박 업종만 버린다 · 음식점 업종은 둔다', () => {
    expect(categoryForType('애견카페', 'cafe')).toBe('애견카페');
    expect(categoryForType('한식', 'cafe')).toBe('한식');
    expect(categoryForType('민박', 'cafe')).toBeNull();
  });

  it('빈 업종·other 종류는 늘 맞다', () => {
    expect(categoryFitsType(null, 'restaurant')).toBe(true);
    expect(categoryFitsType('  ', 'stay')).toBe(true);
    expect(categoryFitsType('카페,디저트', 'other')).toBe(true);
    expect(categoryForType(undefined, 'cafe')).toBeNull();
  });
});
