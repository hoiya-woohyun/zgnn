import { describe, expect, it } from 'vitest';
import { REGION_OPTIONS, regionOptionsFor } from './adminCandidates';

describe('regionOptionsFor — 주소의 읍·면을 맨 위로', () => {
  it('방향이 갈리는 읍·면이면 그 선택지들만 위로 올리고 나머지는 그대로 둔다', () => {
    const { town, suggested, rest } = regionOptionsFor('제주 서귀포시 안덕면 난드르로 41');
    expect(town).toBe('안덕면');
    expect(suggested.length).toBeGreaterThan(0);
    expect(suggested.every((option) => option.includes('안덕면'))).toBe(true);
    expect([...suggested, ...rest].sort()).toEqual([...REGION_OPTIONS].sort());
  });

  it('읍·면이 없거나(시내) 주소가 없으면 목록 그대로다', () => {
    expect(regionOptionsFor('제주 제주시 노형2길 51-3')).toEqual({ town: null, suggested: [], rest: REGION_OPTIONS });
    expect(regionOptionsFor(null)).toEqual({ town: null, suggested: [], rest: REGION_OPTIONS });
  });
});
