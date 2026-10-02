import { describe, expect, it } from 'vitest';
import { reopenPlan, reopenSummary, tallyExistingReasons } from './adminPosts';

describe('tallyExistingReasons — 이미 있는 가게를 쓴 글(11 T2.4)', () => {
  it('같은 말 · 옛 글 · 근거 약함을 세고, 옛 alreadyHave 는 같은 말에 합친다 · 다른 이유·이상한 값은 세지 않는다', () => {
    const lists = [
      [{ name: 'a', reason: 'sameAsSite' }, { name: 'b', reason: 'notJeju' }],
      [{ name: 'c', reason: 'alreadyHave' }, { name: 'd', reason: 'stale' }, { name: 'e', reason: 'weak' }],
      null,
      'x',
      [null],
    ];
    expect(tallyExistingReasons(lists)).toEqual({ total: 4, same: 2, stale: 1, weak: 1, noPetEvidence: 0, alreadyHavePosts: [] });
  });
});

describe('옛 규칙으로 버려진 글 다시 열기(11 런북 3단계를 화면으로)', () => {
  it('alreadyHave 가 있는 글의 url 만 모은다', () => {
    const out = tallyExistingReasons([[{ reason: 'alreadyHave' }], [{ reason: 'sameAsSite' }], [{ reason: 'alreadyHave' }]], ['a', 'b', 'c']);
    expect(out.alreadyHavePosts).toEqual(['a', 'c']);
  });

  it('사람이 반려한 형제가 딸린 글은 빼고 · pending 은 눕히되 사람이 고친 것은 남긴다 · 재분석 머리표 반려는 사람의 반려가 아니다', () => {
    const sib = (id: string, post_url: string, status: string, reviewer_note: string | null = null) => ({ id, post_url, status, reviewer_note }) as never;
    const plan = reopenPlan(
      ['a', 'b', 'c'],
      [
        sib('1', 'a', 'pending'),
        sib('2', 'a', 'pending', '[admin] 고침'),
        sib('3', 'b', 'rejected', '[admin] 목록글'),
        sib('4', 'b', 'pending'),
        sib('5', 'c', 'rejected', '[admin] 재분석'),
        sib('6', 'c', 'approved'),
      ],
    );
    expect(plan.posts).toEqual(['a', 'c']);
    expect(plan.lay.map((row) => row.id)).toEqual(['1']);
    expect(plan.keep.map((row) => row.id)).toEqual(['2']);
    expect(plan.skipped).toBe(1);
    expect(reopenSummary(plan)).toContain('글 2건');
    expect(reopenSummary(plan)).toContain('1건은 빼요');
  });
});

describe('tallyExistingReasons — 신규·동반 근거 없음(ADR-019 v6)', () => {
  it('따로 세고 total 에는 안 넣는다', () => {
    expect(tallyExistingReasons([[{ reason: 'noPetEvidence' }, { reason: 'noPetEvidence' }, { reason: 'stale' }]])).toMatchObject({ total: 1, stale: 1, noPetEvidence: 2 });
  });
});
