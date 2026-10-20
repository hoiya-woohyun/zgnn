import { describe, expect, it } from 'vitest';
import { MARKER_DOT_COLOR } from './mapPageMarkerVerdict';
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

  it('판정 점은 원 오른쪽 아래에 그 색으로 — 캔버스·앵커는 그대로이고 열쇠가 갈라져 다른 판정의 그림이 안 돌아온다', () => {
    for (const saved of [false, true]) {
      const plain = pinIcon(maps, 'restaurant', false, saved);
      for (const dot of ['cond', 'unknown'] as const) {
        const icon = pinIcon(maps, 'restaurant', false, saved, dot);
        expect(icon).not.toBe(plain);
        expect(icon.size).toEqual(plain.size);
        expect(icon.anchor).toEqual(plain.anchor);
        const [, cx, cy, r] = /<circle cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)" fill="(#[0-9a-f]{6})"[^>]*\/><\/svg>$/.exec(svgOf(icon)) ?? [];
        expect(svgOf(icon)).toContain(`fill="${MARKER_DOT_COLOR[dot]}"`);
        const anchor = icon.anchor as naver.maps.Point;
        // 원 중심의 오른쪽 아래, 테두리까지 캔버스 안
        expect(Number(cx)).toBeGreaterThan(anchor.x);
        expect(Number(cy)).toBeGreaterThan(anchor.y);
        const size = icon.size as naver.maps.Size;
        expect(Number(cx) + Number(r) + 0.75).toBeLessThanOrEqual(size.width);
        expect(Number(cy) + Number(r) + 0.75).toBeLessThanOrEqual(size.height);
      }
    }
  });

  it('고른 핀은 점을 달지 않는다 — 시트가 판정을 글로 말한다', () => {
    expect(pinIcon(maps, 'cafe', true, false, 'cond')).toBe(pinIcon(maps, 'cafe', true, false));
    expect(svgOf(pinIcon(maps, 'cafe', true, false, 'cond'))).not.toContain(MARKER_DOT_COLOR.cond);
  });

  it('다른 종류의 그림은 섞이지 않는다', () => {
    const stay = svgOf(pinIcon(maps, 'stay', true, false));
    for (const d of PLACE_TYPE_GLYPH.cafe) expect(stay).not.toContain(`d="${d}"`);
  });
});
