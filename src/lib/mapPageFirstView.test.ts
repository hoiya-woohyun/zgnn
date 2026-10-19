import { describe, expect, it } from 'vitest';
import { FIRST_VIEW_STEP_IN, mapPageFirstView } from './mapPageFirstView';
import { JEJU_ZOOM } from './places';

/*
 * 이 숫자는 빌드·타입이 못 잡는 자리다 — 네이버 zoom 은 클수록 확대라 부호를 뒤집어도 전부 통과하고 화면에서만 드러난다.
 * 그래서 폰 두 폭(390×786 · 320×~510)과 데스크톱 값을 못 박는다(ADR-008 v12 · v36 — 섬이 다 드는 줌 9·10 에서 한 단계 당긴 10·11).
 */
describe('mapPageFirstView', () => {
  it('v12 의 한 단계 당김을 지킨다 — 사용자가 고른 값이라 바꾸려면 이 테스트도 함께', () => {
    expect(FIRST_VIEW_STEP_IN).toBe(1);
  });

  it('폰에서는 10 — 섬이 다 드는 9 에서 한 단계 당겼다', () => {
    expect(mapPageFirstView(390, 786).zoom).toBe(10);
    expect(mapPageFirstView(320, 510).zoom).toBe(10);
    expect(mapPageFirstView(430, 850).zoom).toBe(10);
  });

  it('데스크톱 지도 칸(좌측 패널을 뺀 폭)에서는 11', () => {
    expect(mapPageFirstView(832, 800).zoom).toBe(11);
  });

  it('당기기 전 줌에서 섬 경도 폭은 보이는 폭 안에 들고, 한 단계 더 당기면 넘친다', () => {
    for (const [w, h] of [[320, 510], [390, 786], [832, 800], [1440, 900]]) {
      const fitZoom = mapPageFirstView(w, h).zoom - FIRST_VIEW_STEP_IN;
      const pxPerLon = (256 * 2 ** fitZoom) / 360;
      expect(0.83 * pxPerLon, `${w}`).toBeLessThanOrEqual(w);
      const heightFits = (z: number) => 0.45 * ((256 * 2 ** z) / 360) * 1.2 <= h - 88 - 28;
      const widthFits = (z: number) => 0.83 * ((256 * 2 ** z) / 360) <= w - 16;
      expect(widthFits(fitZoom + 1) && heightFits(fitZoom + 1), `${w}`).toBe(false);
    }
  });

  it('중심은 섬 한가운데보다 약간 북쪽이다(위 칩 줄이 아래 줄보다 높아 섬을 아래로 내린다)', () => {
    const { center } = mapPageFirstView(390, 786);
    expect(center[0]).toBeGreaterThan(33.385);
    expect(center[0]).toBeLessThan(33.46);
    expect(center[1]).toBeCloseTo(126.565, 3);
  });

  it('못 재면 기본값으로 물러선다', () => {
    expect(mapPageFirstView(0, 786).zoom).toBe(JEJU_ZOOM);
    expect(mapPageFirstView(390, Number.NaN).zoom).toBe(JEJU_ZOOM);
    expect(mapPageFirstView(390, 100).zoom).toBe(JEJU_ZOOM);
  });
});
