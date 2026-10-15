import { describe, expect, it } from 'vitest';
import { countByLevel, reachablePlaces } from './eligibilityCounts';
import {
  homePageIndoorNote,
  homePageReach,
  homePageReachNote,
  homeTypeCardCountsLabel,
  homeTypeCardSegments,
} from './homePageCounts';
import { countByType, PLACE_TYPES, placesOfType } from './places';
import type { TDogProfile } from '../types';

// 수를 못 박지 않고 불변식으로 묶는다 — 판정 규칙이 바뀌어도 "카드 합 = 곳 수", "히어로 N = 카드 가능 + 야외 합" 은 그대로여야 한다.
const DUBU: TDogProfile = { dogs: [{ name: '두부', weightKg: 7 }], carrier: 'none' };
const BORI: TDogProfile = { dogs: [{ name: '보리', weightKg: 30 }], carrier: 'none' };
const CASES = [
  ['두부 7kg', DUBU, {}],
  ['보리 30kg', BORI, {}],
  ['보리 30kg · 실내 자리 필요', BORI, { needsIndoor: true }],
] as const;

describe('homePageReach — 히어로 "갈 수 있는 곳 N곳(야외 자리만 되는 M곳 포함)" (14 W261013.2)', () => {
  it.each(CASES)('%s — N 은 종류 카드 가능 + 야외의 합, M 은 야외의 합', (_, dog, opts) => {
    const reach = homePageReach(placesOfType, dog, opts);
    const counts = PLACE_TYPES.map((type) => countByLevel(placesOfType(type), dog, opts));
    expect(reach.count).toBe(counts.reduce((sum, c) => sum + c.ok + c.outdoor, 0));
    expect(reach.outdoor).toBe(counts.reduce((sum, c) => sum + c.outdoor, 0));
  });

  it.each(CASES)('%s — 시트의 줄(가능 + 야외)은 reachablePlaces 그대로, 줄 수의 합이 N', (_, dog, opts) => {
    const reach = homePageReach(placesOfType, dog, opts);
    let rows = 0;
    for (const type of PLACE_TYPES) {
      const { ok, outdoor } = reach.byType[type];
      expect([...ok, ...outdoor]).toEqual(reachablePlaces(placesOfType(type), dog, opts));
      rows += ok.length + outdoor.length;
    }
    expect(rows).toBe(reach.count);
  });

  it('보리 30kg 는 야외 자리만 되는 곳이 있고, 실내 자리가 꼭 필요하면 0 이 된다', () => {
    expect(homePageReach(placesOfType, BORI).outdoor).toBeGreaterThan(0);
    expect(homePageReach(placesOfType, BORI, { needsIndoor: true }).outdoor).toBe(0);
  });
});

describe('homePageReachNote', () => {
  it('야외 곳이 있으면 "… 포함", 없으면 null', () => {
    expect(homePageReachNote(13)).toBe('야외 자리만 되는 13곳 포함');
    expect(homePageReachNote(0)).toBeNull();
  });
});

describe('homePageIndoorNote — 히어로 수가 실내 자리 필요로 센 수라는 말 (14 W261010.22)', () => {
  it('꺼져 있으면 null, 켜져 있으면 기준을 말하고 끄면 수가 달라질 때만 그 수를 붙인다', () => {
    expect(homePageIndoorNote(false, 71, 71)).toBeNull();
    expect(homePageIndoorNote(true, 57, 71)).toBe('‘실내 자리 필요’ 기준 · 끄면 71곳');
    expect(homePageIndoorNote(true, 12, 12)).toBe('‘실내 자리 필요’ 기준');
  });

  // 실내 자리 필요는 판정을 조이기만 한다(C1 → H6 · C4·H4 의 야외 → 어려움 · C12 확인) — 켰는데 수가 늘면 "끄면 N곳" 이 거꾸로 읽힌다.
  it.each([
    ['두부 7kg', DUBU],
    ['보리 30kg', BORI],
  ] as const)('%s — 켠 수는 끈 수를 넘지 않는다', (_, dog) => {
    const on = homePageReach(placesOfType, dog, { needsIndoor: true });
    const off = homePageReach(placesOfType, dog);
    expect(on.count).toBeLessThanOrEqual(off.count);
    // 켜면 야외 곳은 0 — 히어로의 두 덧말(실내 기준 · 야외 포함)이 한꺼번에 서지 않는다.
    expect(on.outdoor).toBe(0);
  });

  it('보리 30kg 는 켜면 수가 줄어 "끄면 N곳" 이 붙는다', () => {
    const on = homePageReach(placesOfType, BORI, { needsIndoor: true }).count;
    const off = homePageReach(placesOfType, BORI).count;
    expect(on).toBeLessThan(off);
    expect(homePageIndoorNote(true, on, off)).toBe(`‘실내 자리 필요’ 기준 · 끄면 ${off}곳`);
  });
});

describe('homeTypeCardSegments — 종류 카드 수 줄 (14 W261013.2)', () => {
  it.each(CASES)('%s — 칸의 합이 그 종류 곳 수(카드의 "N곳 중")와 같다', (_, dog, opts) => {
    for (const type of PLACE_TYPES) {
      const segments = homeTypeCardSegments(countByLevel(placesOfType(type), dog, opts));
      expect(segments.reduce((sum, segment) => sum + segment.count, 0)).toBe(countByType[type]);
    }
  });

  it('가능 · 확인 필요는 0 이어도, 야외 · 정보 없음 · 어려움은 1 이상일 때만 — 목록 머리와 같은 순서', () => {
    expect(homeTypeCardSegments({ ok: 0, outdoor: 0, cond: 0, unknown: 0, hard: 0 }).map((s) => s.label)).toEqual([
      '가능',
      '확인 필요',
    ]);
    expect(homeTypeCardSegments({ ok: 10, outdoor: 2, cond: 4, unknown: 4, hard: 13 }).map((s) => s.label)).toEqual([
      '가능',
      '야외',
      '확인 필요',
      '정보 없음',
      '어려움',
    ]);
  });

  it('굵게 세우는 것은 가능 · 야외 · 확인 필요 — 나머지는 합을 맞추는 칸', () => {
    const segments = homeTypeCardSegments({ ok: 1, outdoor: 1, cond: 1, unknown: 1, hard: 1 });
    expect(segments.filter((s) => s.strong).map((s) => s.level)).toEqual(['ok', 'outdoor', 'cond']);
  });

  it('읽히는 말은 보이는 글자와 같다 — 분모가 앞', () => {
    expect(homeTypeCardCountsLabel({ ok: 10, outdoor: 0, cond: 4, unknown: 4, hard: 13 }, 31)).toBe(
      '31곳 중 가능 10 · 확인 필요 4 · 정보 없음 4 · 어려움 13',
    );
  });
});
