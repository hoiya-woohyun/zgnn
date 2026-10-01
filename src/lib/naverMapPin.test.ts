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
  it('원·핀 모두 화면 아이콘과 같은 종류 그림을 그린다', () => {
    for (const type of PLACE_TYPES) {
      for (const selected of [false, true]) {
        for (const saved of [false, true]) {
          const svg = svgOf(pinIcon(maps, type, selected, saved));
          for (const d of PLACE_TYPE_GLYPH[type]) expect(svg).toContain(`d="${d}"`);
        }
      }
    }
  });

  it('평소에는 원이라 가운데가, 고른 곳은 핀이라 꼬리 끝이 좌표다', () => {
    const circle = pinIcon(maps, 'cafe', false, false);
    expect(circle.anchor).toEqual({ x: 14, y: 14 });
    // 저장 원은 배지 때문에 캔버스가 넓지만 원의 중심은 같은 자리로 맞춘다.
    const savedCircle = pinIcon(maps, 'cafe', false, true);
    expect(savedCircle.anchor).toEqual({ x: 14, y: 17 });

    const pin = pinIcon(maps, 'cafe', true, false);
    expect(pin.anchor).toEqual({ x: 16, y: 48 });
  });

  it('다른 종류의 그림은 섞이지 않는다', () => {
    const stay = svgOf(pinIcon(maps, 'stay', true, false));
    for (const d of PLACE_TYPE_GLYPH.cafe) expect(stay).not.toContain(`d="${d}"`);
  });
});
