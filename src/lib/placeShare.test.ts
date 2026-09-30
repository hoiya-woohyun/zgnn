import { describe, expect, it } from 'vitest';
import type { TEligibility } from './eligibility';
import { shareMethodOf, shareTextFor } from './placeShare';

const ok: TEligibility = { level: 'ok', reasons: [] };
const outdoorOnly: TEligibility = {
  level: 'cond',
  reasons: [{ level: 'cond', text: '야외 자리만 가능해요', rule: 'C1' }],
};

describe('shareTextFor — 공유 글에 판정 한 줄', () => {
  it('강아지가 있으면 "이름은 판정 · 특징"', () => {
    expect(shareTextFor('오션뷰 독채', ['보리'], ok)).toBe('보리는 갈 수 있어요 · 오션뷰 독채');
  });

  it('머리글은 상세 카드와 같은 규칙을 따른다(C1 하나면 야외 자리)', () => {
    expect(shareTextFor('카페', ['우현'], outdoorOnly)).toBe('우현이는 야외 자리에서 갈 수 있어요 · 카페');
  });

  it('여러 마리는 함께 부른다', () => {
    expect(shareTextFor('식당', ['보리', '두부'], ok)).toBe('보리와 두부는 갈 수 있어요 · 식당');
  });

  it('강아지가 없거나 판정이 없으면 특징만', () => {
    expect(shareTextFor('오션뷰 독채', null, null)).toBe('오션뷰 독채');
    expect(shareTextFor('오션뷰 독채', ['보리'], null)).toBe('오션뷰 독채');
  });

  it('정보 없음이면 이름 없이 장소를 주어로', () => {
    const noInfo: TEligibility = { level: 'unknown', reasons: [{ level: 'unknown', text: '동반 조건이 적혀 있지 않아요', rule: 'U1' }] };
    expect(shareTextFor('독채', ['보리'], noInfo)).toBe('이곳은 반려견 동반 조건이 공개돼 있지 않아요 · 독채');
  });

  it('특징이 비면 판정만', () => {
    expect(shareTextFor('', ['보리'], ok)).toBe('보리는 갈 수 있어요');
  });
});

describe('shareMethodOf — 누른 순간의 보내는 길', () => {
  const writeText = async () => undefined;

  it('Web Share 가 있으면 공유', () => {
    expect(shareMethodOf({ share: async () => undefined, clipboard: { writeText } })).toBe('share');
  });

  it('없으면 링크 복사(카톡 인앱·데스크톱)', () => {
    expect(shareMethodOf({ clipboard: { writeText } })).toBe('copy');
  });

  it('둘 다 없으면 none', () => {
    expect(shareMethodOf({})).toBe('none');
  });
});
