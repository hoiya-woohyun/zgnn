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
    expect(policyDirection(base, { ...base, indoor: 'unknown' }).fields.indoor).toBeUndefined();
    expect(policyDirection(base, { ...base, fees: [{ ...base.fees![0], label: '1마리당 3만원', amountWon: 30000 }] }).fields.fees).toBe('tighten');
    expect(policyDirection(base, { ...base, feeFree: true, fees: [] }).overall).toBe('loosen');
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
