import { describe, expect, it } from 'vitest';
import type { TPetPolicyFacts } from '../types';
import { DIRECTION_RULES, policyDirection } from './policyDirection';

const base: TPetPolicyFacts = {
  indoor: 'free',
  leash: false,
  largeDogOk: true,
  smallDogOnly: false,
  callFirst: false,
  feeFree: false,
  fees: [{ label: '1마리당 2만원', amountWon: 20000, basis: 'perDog', minKg: null, maxKg: null, fromDog: null, perNight: true }],
  weightLimitKg: 15,
  maxDogs: 2,
  notes: null,
};

describe('policyDirection — 강화는 바로, 완화는 확인 뒤', () => {
  it('15kg → 10kg 은 강화 · 10kg → 15kg 은 완화', () => {
    expect(policyDirection(base, { ...base, weightLimitKg: 10 })).toEqual({ fields: { weightLimitKg: 'tighten' }, overall: 'tighten' });
    expect(policyDirection({ ...base, weightLimitKg: 10 }, base)).toEqual({ fields: { weightLimitKg: 'loosen' }, overall: 'loosen' });
  });
  it('제한이 생기면 강화 · 없어지면 완화', () => {
    expect(policyDirection({ ...base, maxDogs: null }, base).fields.maxDogs).toBe('tighten');
    expect(policyDirection(base, { ...base, weightLimitKg: null }).fields.weightLimitKg).toBe('loosen');
  });
  it('대형견 가능 → 불가 · 실내 자유 → 케이지 · 요금 인상은 강화, 반대는 완화', () => {
    expect(policyDirection(base, { ...base, largeDogOk: false }).fields.largeDogOk).toBe('tighten');
    expect(policyDirection({ ...base, largeDogOk: false }, base).fields.largeDogOk).toBe('loosen');
    expect(policyDirection(base, { ...base, indoor: 'cage' }).fields.indoor).toBe('tighten');
    expect(policyDirection(base, { ...base, fees: [{ ...base.fees![0], label: '1마리당 3만원', amountWon: 30000 }] }).fields.fees).toBe('tighten');
    expect(policyDirection(base, { ...base, feeFree: true, fees: [] }).overall).toBe('loosen');
  });
  /** 모름(`unknown`)은 순위 밖이라 중립이던 것을 범위로 못 박는다(11 T4.1) — 덮어쓰기에서 모름이 '실외만' 을 지워도 기본 체크가 켜져 있었다(담소요). */
  it('실내: 아는 제약 → 모름은 완화 · 자유 → 모름은 중립 · 모름 → 아는 값은 값대로', () => {
    const indoor = (from: TPetPolicyFacts['indoor'], to: TPetPolicyFacts['indoor']) =>
      policyDirection({ ...base, indoor: from }, { ...base, indoor: to }).fields.indoor;
    expect(indoor('outdoorOnly', 'unknown')).toBe('loosen');
    expect(indoor('cage', 'unknown')).toBe('loosen');
    expect(indoor('free', 'unknown')).toBeUndefined();
    expect(indoor('unknown', 'cage')).toBe('tighten');
    expect(indoor('unknown', 'outdoorOnly')).toBe('tighten');
    expect(indoor('unknown', 'free')).toBe('loosen');
    // 네 값 밖(옛 행의 엉뚱한 문자열)은 어느 쪽이든 중립 그대로
    expect(policyDirection({ ...base, indoor: 'x' as never }, { ...base, indoor: 'unknown' }).fields.indoor).toBeUndefined();
    expect(policyDirection({ ...base, indoor: 'unknown' }, { ...base, indoor: 'x' as never }).fields.indoor).toBeUndefined();
  });
  it('완화가 하나라도 있으면 전체가 완화 · notes 는 중립 · 한쪽이 없으면 중립', () => {
    expect(policyDirection(base, { ...base, weightLimitKg: 10, maxDogs: 3 }).overall).toBe('loosen');
    expect(policyDirection(base, { ...base, notes: '사장님 친절' }).overall).toBe('neutral');
    expect(policyDirection(null, base).overall).toBe('neutral');
  });
  it('동반 요일: 제한이 새로 생기거나 요일이 줄면 강화 · 없어지거나 늘면 완화', () => {
    expect(policyDirection(base, { ...base, petDays: ['수'] }).overall).toBe('tighten');
    expect(policyDirection({ ...base, petDays: ['수', '토'] }, { ...base, petDays: ['수'] }).overall).toBe('tighten');
    expect(policyDirection({ ...base, petDays: ['수'] }, base).overall).toBe('loosen');
    expect(policyDirection({ ...base, petDays: ['수'] }, { ...base, petDays: ['수', '토'] }).overall).toBe('loosen');
  });
  it('TPetPolicyFacts 의 칸이 전부 규칙을 갖는다 — 칸이 늘면 이 리터럴이 tsc 에서 먼저 멈춘다(readNothing 과 같은 함정)', () => {
    const every = {
      indoor: 'free', leash: false, largeDogOk: null, smallDogOnly: false, callFirst: false, vaccineRequired: false, petDays: null, feeFree: null,
      feeLines: [], fees: [], feeText: null, weightLimitKg: null, maxDogs: null, notes: null,
    } satisfies Required<TPetPolicyFacts>;
    expect(Object.keys(DIRECTION_RULES).sort()).toEqual(Object.keys(every).sort());
  });
});
