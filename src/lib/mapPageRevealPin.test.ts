import { describe, expect, it } from 'vitest';
import { mapPageRevealPin, type TRevealPinInput } from './mapPageRevealPin';

// 390×844 뷰포트, 지도 칸 0~760(탭바 84 위), 시트 높이 300 → 시트 윗변 544.
const base: TRevealPinInput = {
  mapTop: 0,
  mapBottom: 760,
  topInset: 88,
  sheetHeight: 300,
  viewportBottom: 844,
  pinTop: 380,
  pinBottom: 420,
  margin: 12,
};

describe('mapPageRevealPin', () => {
  it('시트 위 보이는 자리에 있으면 안 민다', () => {
    expect(mapPageRevealPin(base)).toBe(0);
  });

  it('시트 밑에 가려진 핀은 시트 윗변 − 여백까지 올린다', () => {
    // 띠 밑 = min(760, 544) − 12 = 532. 핀 밑끝 650 → 118.
    expect(mapPageRevealPin({ ...base, pinTop: 610, pinBottom: 650 })).toBe(118);
  });

  it('핀 밑끝이 시트에 걸쳐도 올린다', () => {
    expect(mapPageRevealPin({ ...base, pinTop: 510, pinBottom: 550 })).toBe(18);
  });

  it('시트가 없으면 0 (넓은 화면·닫힘)', () => {
    expect(mapPageRevealPin({ ...base, sheetHeight: 0, pinTop: 610, pinBottom: 650 })).toBe(0);
  });

  it('칩 줄에 가린 핀은 내리되 시트 쪽으로 넘기지 않는다', () => {
    expect(mapPageRevealPin({ ...base, pinTop: 60, pinBottom: 100 })).toBe(-28);
    // 내릴 수 있는 만큼(밑끝이 띠 밑에 닿을 때까지)만: 핀 20~520 → 올려야 −68 이지만 −12 까지.
    expect(mapPageRevealPin({ ...base, pinTop: 20, pinBottom: 520 })).toBe(-12);
  });

  it('시트가 화면 대부분이면 띠가 없어도 뾰족한 끝이 보이게 올린다', () => {
    // 시트 790 → 윗변 54, 띠 밑 42 < 띠 위 88. 핀 밑끝 340 → 298.
    expect(mapPageRevealPin({ ...base, sheetHeight: 790, pinTop: 300, pinBottom: 340 })).toBe(298);
  });

  it('못 잰 값(NaN)·크기 없는 핀은 0', () => {
    expect(mapPageRevealPin({ ...base, pinBottom: Number.NaN })).toBe(0);
    expect(mapPageRevealPin({ ...base, pinTop: 600, pinBottom: 600 })).toBe(0);
  });
});
