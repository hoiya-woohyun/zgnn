import { describe, expect, it } from 'vitest';
import places from '../../src/data/places.json' with { type: 'json' };
import { distanceMeters, matchPlace, nameSimilarity, normalizeName, splitAliases, THRESHOLD } from './matchPlace.mjs';

const byName = (n) => places.find((p) => p.name === n);

describe('normalizeName / splitAliases', () => {
  it('접두·접미 "카페" 와 공백을 지운다', () => {
    expect(normalizeName('카페 살레')).toBe('살레');
    expect(normalizeName('살레카페')).toBe('살레');
    expect(normalizeName('평대코지카페')).toBe('평대코지');
  });
  it('괄호 별칭을 따로 뽑는다', () => {
    expect(splitAliases('평대반점(바당반점)')).toEqual(['평대반점', '바당반점']);
  });
});

describe('nameSimilarity', () => {
  it('별칭 어느 쪽과도 일치하면 1', () => {
    expect(nameSimilarity('바당반점', '평대반점(바당반점)')).toBe(1);
    expect(nameSimilarity('살레', '카페살레')).toBe(1);
  });
  it('18m 이웃이지만 이름은 다르다 — 이름 신호는 0', () => {
    expect(nameSimilarity('평대반점(바당반점)', '평대코지카페')).toBe(0);
  });
});

describe('distanceMeters — 실제 데이터의 함정 쌍', () => {
  it('평대반점 ↔ 평대코지카페 는 20m 안', () => {
    expect(distanceMeters(byName('평대반점(바당반점)').geo, byName('평대코지카페').geo)).toBeLessThan(20);
  });
  it('제이아일랜드 ↔ 아오오 는 50m 안', () => {
    expect(distanceMeters(byName('제이아일랜드').geo, byName('아오오').geo)).toBeLessThan(50);
  });
});

/*
 * 🙋 matchPlace 본체는 사용자가 채운다(docs/todo/03). 채우면 아래 skip 을 뗀다.
 * 기대값은 "이렇게 판정돼야 데이터가 안 썩는다" 를 적은 것이다 — 임계값을 바꾸면 기대값도 같이 손본다.
 */
describe.skip('matchPlace — 실제 86곳으로', () => {
  it('naverPlaceId 가 같으면 이름이 달라도 확실', () => {
    const r = matchPlace({ name: '전혀다른이름', naverPlaceId: byName('솔숲펜션').naverPlaceId }, places);
    expect(r.match?.id).toBe(byName('솔숲펜션').id);
    expect(r.confidence).toBe(1);
  });
  it('좌표만 가깝고 이름이 다르면 병합하지 않는다 (평대반점 옆 평대코지카페)', () => {
    const r = matchPlace({ name: '평대코지카페', geo: byName('평대반점(바당반점)').geo, type: 'cafe' }, places);
    expect(r.match?.id).toBe(byName('평대코지카페').id);
  });
  it('별칭으로 온 이름을 잡는다', () => {
    const r = matchPlace({ name: '바당반점', type: 'restaurant' }, places);
    expect(r.match?.id).toBe(byName('평대반점(바당반점)').id);
    expect(r.confidence).toBeGreaterThanOrEqual(THRESHOLD.AUTO_MERGE);
  });
  it('좌표 없는 기존 장소(요호르기 스테이)도 이름으로 잡는다', () => {
    const r = matchPlace({ name: '요호르기스테이', type: 'stay' }, places);
    expect(r.match?.id).toBe(byName('요호르기 스테이').id);
  });
  it('모르는 가게는 null', () => {
    const r = matchPlace({ name: '존재하지않는가게', geo: { lat: 33.4, lng: 126.5 } }, places);
    expect(r.match).toBeNull();
    expect(r.confidence).toBeLessThan(THRESHOLD.ASK);
  });
});
