import { describe, expect, it } from 'vitest';
import type { TCandidateGroup, TCandidateRow } from './adminCandidates';
import { groupQuote } from './adminGroupQuote';

const row = (petPolicyText: string | null, evidence?: string[]) => ({ extracted: { petPolicyText, evidence } }) as unknown as TCandidateRow;
const group = (lead: TCandidateRow, ...others: TCandidateRow[]) => ({ lead, rows: [lead, ...others] }) as unknown as TCandidateGroup;

describe('groupQuote', () => {
  it('조건 문장이 있으면 그것이 먼저다 — 옆의 조건 칩과 맞춰 보는 자리', () => {
    expect(groupQuote(group(row('소형견은 안고\n실내   가능', ['콩이랑 창가에 앉았어요'])))).toBe('소형견은 안고 실내 가능');
  });

  it('조건 문장이 없으면 대표 글의 첫 인용', () => {
    expect(groupQuote(group(row(null, ['  ', '콩이랑 창가에 앉았어요', '두 번째'])))).toBe('콩이랑 창가에 앉았어요');
  });

  it('대표 글에 인용이 없으면 묶인 다른 글에서 찾는다', () => {
    expect(groupQuote(group(row('  '), row(null, ['테라스에 물그릇이 있어요'])))).toBe('테라스에 물그릇이 있어요');
  });

  it('아무것도 없으면 null — 줄을 안 그린다', () => {
    expect(groupQuote(group(row(null), row(null, [])))).toBeNull();
  });
});
