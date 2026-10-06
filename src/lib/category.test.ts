import { describe, expect, it } from 'vitest';
import { categoryLabel } from './category';

describe('categoryLabel', () => {
  it('쉼표 구분은 · 로 보여 준다 — 쉼표 뒤 띄어쓰기가 있든 없든', () => {
    expect(categoryLabel('카페,디저트', '카페')).toBe('카페·디저트');
    expect(categoryLabel('백반, 가정식', '식당')).toBe('백반·가정식');
  });

  it('쉼표가 없으면 그대로', () => {
    expect(categoryLabel('한식', '식당')).toBe('한식');
  });

  it('비어 있으면 종류 이름', () => {
    expect(categoryLabel(undefined, '카페')).toBe('카페');
    expect(categoryLabel('  ', '카페')).toBe('카페');
  });
});
