import { describe, expect, it } from 'vitest';
import { correctPetPolicyFacts } from '../../scripts/lib/petPolicyFacts.mjs';
import type { TPetPolicyFacts } from '../types';
import { correctionView } from './adminCorrection';

const facts = (patch: Partial<TPetPolicyFacts>) => patch as TPetPolicyFacts;

/** 보정을 실제로 돌린 뒤 화면 층에 넘긴다 — 키를 손으로 적으면 보정이 내는 키와 어긋나도 모른다. */
const viewOf = (patch: Partial<TPetPolicyFacts>, text: string) =>
  correctionView(text, correctPetPolicyFacts(facts(patch), text).dropped);

const marked = (view: ReturnType<typeof correctionView>) => view.spans.filter((span) => span.mark).map((span) => span.text);

describe('correctionView — 숫자는 원문에 실제로 있는 숫자를 칠한다', () => {
  it('무게 상한: 모델의 10kg 이 아니라 원문의 7kg', () => {
    const view = viewOf({ weightLimitKg: 10 }, '실내 동반은 7kg 이하만 가능해요');
    expect(marked(view)).toEqual(['7kg']);
    expect(view.lines).toEqual([{ note: '무게 상한 10kg 이 원문에 없어 뺐어요', found: ['7kg'], missing: null }]);
  });

  it('요금 문장: 원문의 금액을 칠하고 100kg·1.5만원 같은 옆 숫자에 걸리지 않는다', () => {
    const view = viewOf({ feeLines: ['청소비 5만원'] }, '1박 15만원부터, 반려견 1.5만원 추가');
    expect(marked(view)).toEqual(['15만원', '1.5만원']);
    expect(view.lines[0]).toMatchObject({ found: ['15만원', '1.5만원'], missing: null });
  });

  it('원문에 숫자가 아예 없으면 칠하지 않고 없는 말을 적는다', () => {
    const view = viewOf({ maxDogs: 2 }, '강아지 동반 가능, 목줄 필수');
    expect(marked(view)).toEqual([]);
    expect(view.lines[0]).toMatchObject({ found: [], missing: '마릿수(N마리)' });
  });
});

describe('correctionView — 근거 단어를 뺐으면 원문에 칠할 것이 없다', () => {
  it('대형견 불가: 칠한 곳 0 · 없는 말 "대형"', () => {
    const view = viewOf({ largeDogOk: false }, '10kg 이하 소형견만 받아요');
    expect(view.lines.find((line) => line.note.startsWith('대형견 불가'))).toEqual({
      note: '대형견 불가의 근거가 원문에 없어 뺐어요',
      found: [],
      missing: '대형',
    });
  });

  it('리드줄: 없는 말 목록을 그대로', () => {
    const view = viewOf({ leash: true }, '실내 동반 가능해요');
    expect(view.lines).toEqual([{ note: '리드줄 조건의 근거가 원문에 없어 뺐어요', found: [], missing: '리드·목줄·하네스' }]);
    expect(marked(view)).toEqual([]);
  });
});

describe('correctionView — 모순은 근거가 원문에 있어 그 말을 칠한다', () => {
  it('소형견만 ↔ 대형견 가능: "소형" 을 칠한다', () => {
    const view = viewOf({ smallDogOnly: true, largeDogOk: true }, '소형견만 가능, 대형견은 문의');
    const line = view.lines.find((l) => l.note.startsWith('소형견만인데'));
    expect(line).toMatchObject({ found: ['소형'], missing: null });
    expect(marked(view)).toContain('소형');
  });

  it('요금 ↔ 추가 요금 없음: 원문 금액을 칠한다', () => {
    const view = viewOf({ feeFree: true, feeLines: ['1마리당 2만원'] }, '추가 요금 없음 아니고 1마리당 2만원이에요');
    const line = view.lines.find((l) => l.note.startsWith('요금 문장이 있는데'));
    expect(line).toMatchObject({ found: ['2만원'] });
  });
});

describe('correctionView — 조각을 이으면 원문 그대로', () => {
  it('보정이 없으면 칠하지 않은 한 조각', () => {
    expect(correctionView('목줄 필수', [])).toEqual({ spans: [{ text: '목줄 필수', mark: false }], lines: [] });
  });

  it('여러 보정이 같은 자리를 칠해도 글자가 두 번 찍히지 않는다', () => {
    const text = '1마리당 3만원, 청소비 별도';
    const view = viewOf({ feeLines: ['청소비 5만원', '1박 4만원'] }, text);
    expect(view.spans.map((span) => span.text).join('')).toBe(text);
    expect(marked(view)).toEqual(['3만원']);
  });

  it('원문이 없으면 빈 한 조각', () => {
    expect(correctionView(null, []).spans).toEqual([{ text: '', mark: false }]);
  });
});
