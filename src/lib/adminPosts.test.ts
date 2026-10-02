import { describe, expect, it } from 'vitest';
import { tallyExistingReasons } from './adminPosts';

describe('tallyExistingReasons — 이미 있는 가게를 쓴 글(11 T2.4)', () => {
  it('같은 말 · 옛 글 · 근거 약함을 세고, 옛 alreadyHave 는 같은 말에 합친다 · 다른 이유·이상한 값은 세지 않는다', () => {
    const lists = [
      [{ name: 'a', reason: 'sameAsSite' }, { name: 'b', reason: 'notJeju' }],
      [{ name: 'c', reason: 'alreadyHave' }, { name: 'd', reason: 'stale' }, { name: 'e', reason: 'weak' }],
      null,
      'x',
      [null],
    ];
    expect(tallyExistingReasons(lists)).toEqual({ total: 4, same: 2, stale: 1, weak: 1 });
  });
});
