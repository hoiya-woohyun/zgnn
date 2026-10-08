import { describe, expect, it } from 'vitest';
import {
  manualDayOrder,
  sanitizeTripDays,
  sanitizeTripOrder,
  tripDayMembers,
  withDayOrder,
  withoutDayOrder,
  withTripDay,
  type TTripPlan,
} from './tripPlan';

const EMPTY: TTripPlan = { days: {}, order: {} };

describe('sanitizeTripDays — 저장소에서 읽은 라벨', () => {
  it('저장한 곳의 1~4일만 남긴다', () => {
    expect(sanitizeTripDays({ a: 1, b: 4, c: 5, d: 0, e: 1.5, f: '2', gone: 2 }, ['a', 'b', 'c', 'd', 'e', 'f'])).toEqual({ a: 1, b: 4 });
  });

  it('객체가 아니면 빈 값', () => {
    expect(sanitizeTripDays(null, ['a'])).toEqual({});
    expect(sanitizeTripDays([1], ['a'])).toEqual({});
    expect(sanitizeTripDays('x', ['a'])).toEqual({});
  });
});

describe('sanitizeTripOrder — 저장소에서 읽은 손 순서', () => {
  it('그 날 라벨인 id 만, 겹치면 한 번, 남는 게 없으면 그 날을 지운다', () => {
    const days = { a: 1, b: 1, c: 2 } as const;
    expect(sanitizeTripOrder({ 1: ['b', 'a', 'b', 'c', 3], 2: ['a'], 5: ['c'] }, days)).toEqual({ 1: ['b', 'a'] });
  });

  it('배열이 아니면 그 날은 제안으로', () => {
    expect(sanitizeTripOrder({ 1: 'a' }, { a: 1 })).toEqual({});
    expect(sanitizeTripOrder(undefined, { a: 1 })).toEqual({});
  });
});

describe('withTripDay — 한 곳의 날 바꾸기', () => {
  it('라벨을 달고 미정(null)으로 되돌린다', () => {
    const one = withTripDay(EMPTY, 'a', 2);
    expect(one.days).toEqual({ a: 2 });
    expect(withTripDay(one, 'a', null).days).toEqual({});
  });

  it('같은 날이면 그대로(같은 객체)', () => {
    const plan = withTripDay(EMPTY, 'a', 1);
    expect(withTripDay(plan, 'a', 1)).toBe(plan);
    expect(withTripDay(EMPTY, 'a', null)).toBe(EMPTY);
  });

  it('옛 날의 손 순서에서 빠지고, 비면 그 날은 제안으로 돌아간다', () => {
    const plan: TTripPlan = { days: { a: 1, b: 1 }, order: { 1: ['b', 'a'] } };
    expect(withTripDay(plan, 'a', 2)).toEqual({ days: { a: 2, b: 1 }, order: { 1: ['b'] } });
    expect(withTripDay({ days: { a: 1 }, order: { 1: ['a'] } }, 'a', null)).toEqual({ days: {}, order: {} });
  });

  it('새 날에 손 순서가 있으면 끝에 붙인다 — 앞의 순서는 그대로', () => {
    const plan: TTripPlan = { days: { a: 1, b: 2, c: 2 }, order: { 2: ['c', 'b'] } };
    expect(withTripDay(plan, 'a', 2).order).toEqual({ 2: ['c', 'b', 'a'] });
  });

  it('새 날에 손 순서가 없으면 순서를 만들지 않는다(제안이 넣는다)', () => {
    expect(withTripDay({ days: { b: 2 }, order: {} }, 'a', 2).order).toEqual({});
  });
});

describe('손 순서 정하기·지우기', () => {
  const plan: TTripPlan = { days: { a: 1, b: 1, c: 2 }, order: {} };

  it('그 날 라벨인 id 만 받는다', () => {
    expect(withDayOrder(plan, 1, ['b', 'c', 'a', 'b']).order).toEqual({ 1: ['b', 'a'] });
    expect(withDayOrder(plan, 1, ['c']).order).toEqual({});
  });

  it('"순서 다시 제안" 은 그 날의 손 순서만 지운다', () => {
    const ordered: TTripPlan = { days: plan.days, order: { 1: ['b', 'a'], 2: ['c'] } };
    expect(withoutDayOrder(ordered, 1).order).toEqual({ 2: ['c'] });
    expect(withoutDayOrder(plan, 1)).toBe(plan);
  });
});

describe('하루 보기의 재료', () => {
  const savedIds = ['a', 'b', 'c', 'd'];
  const plan: TTripPlan = { days: { a: 1, b: 2, c: 1 }, order: { 1: ['c'] } };

  it('그 날 곳은 저장 순서대로, null 은 미정', () => {
    expect(tripDayMembers(savedIds, plan.days, 1)).toEqual(['a', 'c']);
    expect(tripDayMembers(savedIds, plan.days, null)).toEqual(['d']);
  });

  it('손 순서가 없으면 null(제안), 있으면 그 뒤에 빠진 그 날 곳을 붙인다', () => {
    expect(manualDayOrder(plan, ['b'], 2)).toBeNull();
    expect(manualDayOrder(plan, ['a', 'c'], 1)).toEqual(['c', 'a']);
  });
});
