import { describe, expect, it } from 'vitest';
import { pinIcon } from './naverMapPin';
import { PLACE_TYPES } from './places';
import { PLACE_TYPE_GLYPH } from './placeTypeGlyph';

const maps = {
  Size: class {
    constructor(
      public width: number,
      public height: number,
    ) {}
  },
  Point: class {
    constructor(
      public x: number,
      public y: number,
    ) {}
  },
} as unknown as typeof naver.maps;

const svgOf = (icon: naver.maps.ImageIcon) => decodeURIComponent(String(icon.url).split(',')[1]);

describe('pinIcon', () => {
  it('핀 안에 화면 아이콘과 같은 종류 그림을 그린다', () => {
    for (const type of PLACE_TYPES) {
      for (const saved of [false, true]) {
        const svg = svgOf(pinIcon(maps, type, false, saved));
        for (const d of PLACE_TYPE_GLYPH[type]) expect(svg).toContain(`d="${d}"`);
      }
    }
  });

  it('다른 종류의 그림은 섞이지 않는다', () => {
    const stay = svgOf(pinIcon(maps, 'stay', true, false));
    for (const d of PLACE_TYPE_GLYPH.cafe) expect(stay).not.toContain(`d="${d}"`);
  });
});
