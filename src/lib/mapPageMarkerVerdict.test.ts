import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { TEligibility } from './eligibility';
import {
  MAP_PAGE_MARKER_NOTHING_SHOWN,
  MARKER_DOT_COLOR,
  mapPageMarkerDot,
  mapPageMarkerLegendLines,
  sameMapPageMarkerShown,
} from './mapPageMarkerVerdict';

const judged = (level: TEligibility['level'], rule?: string): TEligibility => ({
  level,
  reasons: rule ? [{ level: level === 'ok' ? 'info' : level, text: '', rule }] : [],
});

describe('mapPageMarkerDot — 판정 → 원 오른쪽 아래 점', () => {
  it("'확인 필요' 는 주황 점, '야외 자리만'(C1) 은 점이 없다 — 목록이 '갈 수 있어요 · 야외 자리만' 이라고 말한다(22 G3.0)", () => {
    expect(mapPageMarkerDot(judged('cond', 'C6'))).toBe('cond');
    expect(mapPageMarkerDot(judged('cond', 'C1'))).toBeNull();
  });

  it('정보 없음은 회색 점', () => {
    expect(mapPageMarkerDot(judged('unknown'))).toBe('unknown');
  });

  it("'갈 수 있어요' · '어려워요'(흐림이 말한다) · 판정 없음(강아지 미등록)은 점이 없다", () => {
    expect(mapPageMarkerDot(judged('ok'))).toBeNull();
    expect(mapPageMarkerDot(judged('hard', 'H0'))).toBeNull();
    expect(mapPageMarkerDot(undefined)).toBeNull();
  });

  it('점 색은 목록 판정 글자색과 같은 값이다(theme.css 토큰 사슬을 따라간다 — data URI 라 hex 를 한 번 더 적었다)', () => {
    const theme = readFileSync(new URL('../styles/theme.css', import.meta.url), 'utf8');
    // 첫 선언(밝은 테마)만 본다 — 어두운 테마 덮어쓰기는 뒤에 있다.
    const valueOf = (name: string): string => {
      const value = theme.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1].trim() ?? '';
      const ref = value.match(/^var\((--[\w-]+)\)$/)?.[1];
      return ref ? valueOf(ref) : value;
    };
    expect(valueOf('--color-text-warning-primary')).toBe(MARKER_DOT_COLOR.cond);
    expect(valueOf('--color-text-tertiary')).toBe(MARKER_DOT_COLOR.unknown);
  });
});

describe('mapPageMarkerLegendLines — 그려진 것만 말한다', () => {
  const shown = (patch: Partial<typeof MAP_PAGE_MARKER_NOTHING_SHOWN>) => ({ ...MAP_PAGE_MARKER_NOTHING_SHOWN, ...patch });

  it('흐림 · 점이 그려졌으면 그 줄을 그 순서로', () => {
    expect(mapPageMarkerLegendLines(shown({ dim: true, dot: true }), '두부')).toEqual([
      { kind: 'dim', text: '흐린 곳은 두부에게 어려워요' },
      { kind: 'dot', text: '점이 붙은 곳은 조건을 봐야 해요' },
    ]);
    expect(mapPageMarkerLegendLines(shown({ dot: true }), '두부').map((line) => line.kind)).toEqual(['dot']);
  });

  it('표시가 전부 묶음 속이면 확대하라는 한 줄(섬 전체 화면) — 조사는 이름을 따른다', () => {
    expect(mapPageMarkerLegendLines(shown({ hidden: true }), '두부')).toEqual([
      { kind: 'zoom', text: '확대하면 두부가 갈 수 있는지 보여요' },
    ]);
    expect(mapPageMarkerLegendLines(shown({ hidden: true }), '콩이와 해피')[0].text).toBe('확대하면 콩이와 해피가 갈 수 있는지 보여요');
  });

  it('하나라도 그려졌으면 확대 줄은 없다 — 보이는 표시가 이미 무엇을 하는지 말한다', () => {
    expect(mapPageMarkerLegendLines(shown({ hidden: true, dot: true }), '두부').map((line) => line.kind)).toEqual(['dot']);
  });

  it('묶음 속에도 표시할 것이 없으면(모두 갈 수 있다) 아무 줄도 없다 — 확대해도 달라지는 게 없다', () => {
    expect(mapPageMarkerLegendLines(MAP_PAGE_MARKER_NOTHING_SHOWN, '두부')).toEqual([]);
  });

  it('강아지가 없으면 판정이 없어 아무 줄도 없다', () => {
    expect(mapPageMarkerLegendLines(shown({ dim: true, dot: true, hidden: true }), '')).toEqual([]);
  });

  it('같은 값이면 같다고 본다 — 화면이 다시 셀 때마다 다시 그리지 않게', () => {
    expect(sameMapPageMarkerShown(shown({ dot: true }), shown({ dot: true }))).toBe(true);
    expect(sameMapPageMarkerShown(shown({ dot: true }), shown({ hidden: true }))).toBe(false);
  });
});
