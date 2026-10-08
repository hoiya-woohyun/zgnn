import { describe, expect, it } from 'vitest';
import { candidateArea, pendingByArea } from './data-coverage.mjs';

const cand = (extracted) => ({ extracted: { type: 'stay', regionRaw: null, address: null, ...extracted } });

describe('candidateArea — 승인되면 들어갈 권역', () => {
  it('regionRaw 를 먼저 본다(반영기가 그 값을 region_raw 로 쓴다)', () => {
    expect(candidateArea({ regionRaw: '남쪽 (서귀포)', address: '제주특별자치도 제주시 애월읍 …' })).toBe('south');
  });

  it('regionRaw 가 없으면 주소의 읍면, 읍면 없는 시내 주소는 시', () => {
    expect(candidateArea({ regionRaw: null, address: '제주특별자치도 제주시 구좌읍 월정리 1' })).toBe('east');
    expect(candidateArea({ regionRaw: null, address: '제주특별자치도 서귀포시 중문관광로 72' })).toBe('south');
  });

  it('둘 다 못 읽으면 null', () => {
    expect(candidateArea({ regionRaw: null, address: null })).toBeNull();
  });
});

describe('pendingByArea — 검수 대기 신규 후보', () => {
  it('신규만 센다 — 기존 장소에 붙는 후보(auto·ask)는 곳을 늘리지 않는다', () => {
    const byArea = pendingByArea([
      cand({ name: 'a', regionRaw: '서쪽 (애월읍)' }),
      cand({ name: 'b', regionRaw: '서쪽 (애월읍)', match: { tier: 'new' } }),
      cand({ name: 'c', regionRaw: '서쪽 (애월읍)', match: { tier: 'auto' } }),
      cand({ name: 'd', regionRaw: '서쪽 (애월읍)', match: { tier: 'ask' } }),
    ]);
    expect(byArea.get('west')).toEqual({ stay: 2, cafe: 0, restaurant: 0 });
  });

  it('같은 가게를 쓴 글 여럿은 한 곳 — nameKey(없으면 이름)로 접는다', () => {
    const byArea = pendingByArea([
      cand({ name: '카페 A', nameKey: 'a', type: 'cafe', regionRaw: '동쪽 (구좌읍)' }),
      cand({ name: '카페A', nameKey: 'a', type: 'cafe', regionRaw: '동쪽 (구좌읍)' }),
      cand({ name: '카페 B', type: 'cafe', regionRaw: '동쪽 (구좌읍)' }),
      cand({ name: '카페 B', type: 'cafe', regionRaw: '동쪽 (구좌읍)' }),
    ]);
    expect(byArea.get('east')).toEqual({ stay: 0, cafe: 2, restaurant: 0 });
  });

  it('종류가 셋 밖이면 빼고, 지역을 못 읽으면 지역 모름 줄로', () => {
    const byArea = pendingByArea([cand({ name: 'x', type: 'other', regionRaw: '서쪽 (애월읍)' }), cand({ name: 'y', type: 'restaurant' })]);
    expect(byArea.get('west')).toBeUndefined();
    expect(byArea.get('지역 모름')).toEqual({ stay: 0, cafe: 0, restaurant: 1 });
  });
});
