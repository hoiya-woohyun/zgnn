import { describe, expect, it } from 'vitest';
import { reviewLinkProblem, type TReviewLinkCheck } from './adminReviewLinks';

const URL_A = 'https://blog.naver.com/a/1';
const check = (over: Partial<TReviewLinkCheck> = {}): TReviewLinkCheck => ({
  place_id: 'p1',
  url: URL_A,
  state: 'gone',
  detail: '비공개 글 입니다.',
  // UTC 15:30 = 서울 다음 날 00:30 — 날짜가 서울 기준인지 가른다.
  checked_at: '2026-10-18T15:30:00Z',
  ...over,
});

describe('reviewLinkProblem', () => {
  it('gone + 같은 주소면 사유와 서울 날짜를 말한다', () => {
    expect(reviewLinkProblem(check(), URL_A)).toBe('후기 글을 읽을 수 없어요 — 비공개 글 입니다. · 10월 19일 확인');
  });
  it('주소가 바뀌었으면 말하지 않는다', () => {
    expect(reviewLinkProblem(check(), 'https://blog.naver.com/a/2')).toBeNull();
    expect(reviewLinkProblem(check(), null)).toBeNull();
  });
  it('alive · unknown · 결과 없음은 말하지 않는다', () => {
    expect(reviewLinkProblem(check({ state: 'alive', detail: null }), URL_A)).toBeNull();
    expect(reviewLinkProblem(check({ state: 'unknown' }), URL_A)).toBeNull();
    expect(reviewLinkProblem(undefined, URL_A)).toBeNull();
  });
});
