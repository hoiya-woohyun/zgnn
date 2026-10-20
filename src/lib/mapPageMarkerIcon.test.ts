import { describe, expect, it } from 'vitest';
import { mapPageMarkerClusterIcon, mapPageMarkerClusterRing, mapPageMarkerIcon } from './mapPageMarkerIcon';
import { MARKER_HIT, mapPageMarkerClusterSummary } from './mapPageMarkerLayout';
import { pinIcon } from './naverMapPin';
import { PLACE_TYPES, SAVED_MARKER_COLOR, TYPE_COLOR } from './places';

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

/** 내용 문자열을 DOM 없이 읽는다 — 첫 상자 크기와 그림 자리. */
const boxOf = (content: string) => {
  const [, width, height] = /^<div style="position:relative;width:([\d.]+)px;height:([\d.]+)px">/.exec(content) ?? [];
  return { width: Number(width), height: Number(height) };
};
const imgOf = (content: string) => {
  const [, left, top, width, height] = /left:([-\d.]+)px;top:([-\d.]+)px;width:([\d.]+)px;height:([\d.]+)px/.exec(content) ?? [];
  return { left: Number(left), top: Number(top), width: Number(width), height: Number(height) };
};
const anchorOf = (icon: naver.maps.HtmlIcon) => icon.anchor as naver.maps.Point;

describe('mapPageMarkerIcon — 원은 44px 상자, 고른 핀은 그림 크기', () => {
  it('원(저장 여부 무관)은 44 상자 가운데에 원의 중심이 온다 — 앵커가 상자 가운데', () => {
    for (const type of PLACE_TYPES) {
      for (const saved of [false, true]) {
        const icon = mapPageMarkerIcon(maps, type, false, saved);
        const content = String(icon.content);
        const image = pinIcon(maps, type, false, saved);
        expect(boxOf(content)).toEqual({ width: MARKER_HIT, height: MARKER_HIT });
        expect([anchorOf(icon).x, anchorOf(icon).y]).toEqual([MARKER_HIT / 2, MARKER_HIT / 2]);
        // 그림 안의 앵커(원의 중심)가 상자 가운데에 놓인다
        const img = imgOf(content);
        expect(img.left + (image.anchor as naver.maps.Point).x).toBe(MARKER_HIT / 2);
        expect(img.top + (image.anchor as naver.maps.Point).y).toBe(MARKER_HIT / 2);
        expect(content).toContain(image.url);
      }
    }
  });

  it('고른 핀은 여백 없이 그림 크기, 앵커는 핀 끝 그대로', () => {
    for (const saved of [false, true]) {
      const icon = mapPageMarkerIcon(maps, 'cafe', true, saved);
      const image = pinIcon(maps, 'cafe', true, saved);
      const size = image.size as naver.maps.Size;
      expect(boxOf(String(icon.content))).toEqual({ width: size.width, height: size.height });
      expect(anchorOf(icon)).toEqual(image.anchor);
    }
  });

  it('그림은 끌리지 않는다 — 데스크톱에서 마커 위를 끌면 지도가 움직여야 한다', () => {
    expect(String(mapPageMarkerIcon(maps, 'stay', false, false).content)).toContain('draggable="false"');
  });

  it('고리의 자리 옮김은 앵커만 반대로 민다', () => {
    const plain = anchorOf(mapPageMarkerIcon(maps, 'stay', false, false));
    const moved = anchorOf(mapPageMarkerIcon(maps, 'stay', false, false, null, { dx: 18, dy: -5 }));
    expect([moved.x, moved.y]).toEqual([plain.x - 18, plain.y + 5]);
  });
});

describe('mapPageMarkerClusterIcon — "N곳" 원', () => {
  const member = (type: 'stay' | 'restaurant' | 'cafe', saved = false) => ({ type, saved, hard: false });

  it('한 종류면 고리도 그 종류 색 하나', () => {
    expect(mapPageMarkerClusterRing([{ type: 'cafe', count: 4 }])).toBe(TYPE_COLOR.cafe);
  });

  it('섞이면 종류 비율대로 고리를 나눈다(숙소·식당·카페 순, 끝은 100%)', () => {
    const ring = mapPageMarkerClusterRing([
      { type: 'stay', count: 1 },
      { type: 'restaurant', count: 1 },
      { type: 'cafe', count: 2 },
    ]);
    expect(ring).toBe(
      `conic-gradient(${TYPE_COLOR.stay} 0% 25%, ${TYPE_COLOR.restaurant} 25% 50%, ${TYPE_COLOR.cafe} 50% 100%)`,
    );
  });

  it('글자는 "N곳", 상자는 44, 앵커는 가운데 — 저장한 곳이 있을 때만 하트 배지', () => {
    const plain = mapPageMarkerClusterIcon(maps, mapPageMarkerClusterSummary([member('stay'), member('cafe')]));
    expect(String(plain.content)).toContain('>2곳</div>');
    expect(boxOf(String(plain.content))).toEqual({ width: MARKER_HIT, height: MARKER_HIT });
    expect([anchorOf(plain).x, anchorOf(plain).y]).toEqual([MARKER_HIT / 2, MARKER_HIT / 2]);
    expect(String(plain.content)).not.toContain(SAVED_MARKER_COLOR);

    const saved = mapPageMarkerClusterIcon(maps, mapPageMarkerClusterSummary([member('stay', true), member('cafe')]));
    expect(String(saved.content)).toContain(SAVED_MARKER_COLOR);
  });

  it('세 자리 수는 한 단 큰 원 — 상자도 따라 커진다', () => {
    const many = mapPageMarkerClusterSummary(Array.from({ length: 119 }, () => member('restaurant')));
    const icon = mapPageMarkerClusterIcon(maps, many);
    expect(String(icon.content)).toContain('>119곳</div>');
    expect(boxOf(String(icon.content)).width).toBeGreaterThanOrEqual(MARKER_HIT);
  });
});
