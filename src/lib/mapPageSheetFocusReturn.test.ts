import { describe, expect, it } from 'vitest';
import { mapPageSheetFocusReturnStep } from './mapPageSheetFocusReturn';

const body = { id: 'body' } as unknown as Element;
const link = { id: 'link' } as unknown as Element;

describe('mapPageSheetFocusReturnStep — 시트를 닫은 뒤 한 프레임의 판단', () => {
  it('포커스가 아직 시트 안이면 기다린다(닫히는 중)', () => {
    expect(mapPageSheetFocusReturnStep(link, body, true)).toBe('wait');
  });

  it('body 로 떨어졌거나 아무 데도 없으면 고른 마커로 돌려보낸다(되살린 시트를 Esc 로 닫은 때)', () => {
    expect(mapPageSheetFocusReturnStep(body, body, false)).toBe('return');
    expect(mapPageSheetFocusReturnStep(null, body, false)).toBe('return');
  });

  it('시트 밖 다른 곳에 있으면 손을 뗀다 — react-aria 가 마커로 돌려보냈거나 사용자가 옮겼다', () => {
    expect(mapPageSheetFocusReturnStep(link, body, false)).toBe('stop');
  });
});
