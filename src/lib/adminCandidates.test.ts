import { describe, expect, it } from 'vitest';
import { REGION_OPTIONS, regionOptionsFor, updateGroupsByPlace } from './adminCandidates';

describe('regionOptionsFor — 주소의 읍·면을 맨 위로', () => {
  it('주소의 읍·면 선택지를 위로 올리고 나머지는 그대로 둔다', () => {
    const { town, suggested, rest } = regionOptionsFor('제주 서귀포시 안덕면 난드르로 41');
    expect(town).toBe('안덕면');
    expect(suggested).toEqual(['남쪽 (안덕면)']);
    expect([...suggested, ...rest].sort()).toEqual([...REGION_OPTIONS].sort());
  });

  it('읍·면이 없거나(시내) 주소가 없으면 목록 그대로다', () => {
    expect(regionOptionsFor('제주 제주시 노형2길 51-3')).toEqual({ town: null, suggested: [], rest: REGION_OPTIONS, preset: null });
    expect(regionOptionsFor(null)).toEqual({ town: null, suggested: [], rest: REGION_OPTIONS, preset: null });
  });

  it('이름의 지점 꼬리로 정한 지역을 미리 고른다 — "이춘옥고등어쌈밥 월정리점" 은 구좌읍(2026-10-04)', () => {
    const choices = regionOptionsFor(null, '이춘옥고등어쌈밥 월정리점');
    expect(choices.preset).toBe('동쪽 (구좌읍)');
    expect(choices.suggested).toEqual(['동쪽 (구좌읍)']);
    expect([...choices.suggested, ...choices.rest].sort()).toEqual([...REGION_OPTIONS].sort());
    // 주소의 읍·면과 갈리면 주소가 이긴다 — 미리 고르지 않는다
    expect(regionOptionsFor('제주 제주시 애월읍 애월해안로 1', '이춘옥고등어쌈밥 월정리점').preset).toBeNull();
    // 이름 앞의 지명은 안 본다
    expect(regionOptionsFor(null, '함덕해물라면').preset).toBeNull();
  });
});

describe('REGION_OPTIONS — 읍·면 하나당 정본 표기 한 줄(2026-10-04)', () => {
  it('안덕면은 남쪽 하나 · 서귀포는 서귀포시 하나 · 거리 이름이 붙은 표기는 없다', () => {
    expect(REGION_OPTIONS).toContain('남쪽 (안덕면)');
    expect(REGION_OPTIONS).not.toContain('서쪽 (안덕면)');
    expect(REGION_OPTIONS).toContain('남쪽 (서귀포시)');
    expect(REGION_OPTIONS).not.toContain('남쪽 (서귀포)');
    expect(REGION_OPTIONS.some((option) => /\(\S+ \S+\)/.test(option))).toBe(false);
  });
  it('같은 읍·면이 두 번 서지 않는다', () => {
    const towns = REGION_OPTIONS.map((option) => option.replace(/^.*\(|\)$/g, ''));
    expect(new Set(towns).size).toBe(towns.length);
  });
});

describe('updateGroupsByPlace — 등록 완료 줄의 검수 대기에 갱신 N(11 T3.2)', () => {
  it('갱신 묶음만 짝 장소로 센다', () => {
    const g = (kind: string, id: string | null) => ({ kind, lead: { match_place_id: id } }) as never;
    expect(updateGroupsByPlace([g('update', 'p1'), g('update', 'p1'), g('fill', 'p2'), g('update', null)])).toEqual({ p1: 2 });
  });
});
