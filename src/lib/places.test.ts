import { describe, expect, it } from 'vitest';
import { JEJU_ZOOM, jejuZoomFor } from './places';

/*
 * 이 값은 빌드·타입이 못 잡는 자리다 — 방향을 뒤집거나 한 단계 어긋나도 전부 통과하고
 * 화면에서만 "너무 가깝다/바다만 넓다" 로 드러난다(ADR-008 v4·v12). 그래서 실제 폭으로 못 박는다.
 */
describe('jejuZoomFor', () => {
  it('모바일 폭에서는 10 — 섬 전체가 드는 9 에서 한 단계 당겼다', () => {
    expect(jejuZoomFor(390)).toBe(10);
    expect(jejuZoomFor(360)).toBe(10);
    expect(jejuZoomFor(430)).toBe(10);
  });

  it('데스크톱 지도 폭(좌측 패널 360px 를 뺀 나머지)에서는 11', () => {
    expect(jejuZoomFor(832)).toBe(11);
    expect(jejuZoomFor(1024)).toBe(11);
  });

  it('한 단계 멀리(= 섬 전체가 드는 줌)에서는 제주 경도 폭(0.83°)이 다 들어온다', () => {
    for (const width of [360, 390, 430, 768, 832, 1024, 1440]) {
      const fitIsland = (360 / 2 ** (jejuZoomFor(width) - 1)) * (width / 256);
      expect(fitIsland, `${width}px`).toBeGreaterThanOrEqual(0.83);
    }
  });

  it('첫 화면은 섬 폭보다 좁다 — 멀리서 보지 않는다', () => {
    for (const width of [390, 832, 1440]) {
      const visibleLon = (360 / 2 ** jejuZoomFor(width)) * (width / 256);
      expect(visibleLon, `${width}px`).toBeLessThan(0.83);
    }
  });

  it('폭을 못 재면 기본값으로 물러선다 — 0 이나 NaN 이 Infinity zoom 이 되지 않게', () => {
    expect(jejuZoomFor(0)).toBe(JEJU_ZOOM);
    expect(jejuZoomFor(Number.NaN)).toBe(JEJU_ZOOM);
    expect(jejuZoomFor(-100)).toBe(JEJU_ZOOM);
  });

  it('네이버 zoom 범위(6~21) 밖으로 나가지 않는다', () => {
    expect(jejuZoomFor(1)).toBeGreaterThanOrEqual(6);
    expect(jejuZoomFor(10_000_000)).toBeLessThanOrEqual(21);
  });
});
