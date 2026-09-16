import { describe, expect, it } from 'vitest';
import { sortByEligibility } from './sortByEligibility';
import type { TEligibility } from './eligibility';

type TItem = { id: string };

const eligibilityOf = (level: TEligibility['level']): TEligibility => ({ level, reasons: [] });

describe('sortByEligibility', () => {
  it('가능 → 조건부 → 정보 없음 → 어려움 순으로 정렬한다', () => {
    const items: TItem[] = [{ id: 'hard' }, { id: 'ok' }, { id: 'unknown' }, { id: 'cond' }];
    const map = new Map<string, TEligibility>([
      ['hard', eligibilityOf('hard')],
      ['ok', eligibilityOf('ok')],
      ['unknown', eligibilityOf('unknown')],
      ['cond', eligibilityOf('cond')],
    ]);

    const sorted = sortByEligibility(items, map, (item) => item.id);

    expect(sorted.map((item) => item.id)).toEqual(['ok', 'cond', 'unknown', 'hard']);
  });

  it('같은 레벨 안에서는 원래 순서를 유지한다(안정 정렬)', () => {
    const items: TItem[] = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const map = new Map<string, TEligibility>([
      ['a', eligibilityOf('ok')],
      ['b', eligibilityOf('ok')],
      ['c', eligibilityOf('ok')],
    ]);

    expect(sortByEligibility(items, map, (item) => item.id).map((item) => item.id)).toEqual(['a', 'b', 'c']);
  });

  it('판정 맵에 없는 항목은 정보 없음 취급한다', () => {
    const items: TItem[] = [{ id: 'known' }, { id: 'missing' }];
    const map = new Map<string, TEligibility>([['known', eligibilityOf('ok')]]);

    expect(sortByEligibility(items, map, (item) => item.id).map((item) => item.id)).toEqual([
      'known',
      'missing',
    ]);
  });
});
