import { describe, expect, it } from 'vitest';
import { naverKeyPairProblem, naverKeyProblem } from './naverKeyFormat.mjs';

describe('naverKeyProblem', () => {
  it('보이는 ASCII 면 통과', () => {
    expect(naverKeyProblem('NAVER_CLIENT_ID', 'Ab12_cd-EF')).toBeNull();
  });

  it('한글(예시 문구)·공백·빈 값은 막고, 값은 메시지에 싣지 않는다', () => {
    const msg = naverKeyProblem('NAVER_CLIENT_ID', '검색키_ID');
    expect(msg).toContain('ASCII');
    expect(msg).not.toContain('검색키');
    expect(naverKeyProblem('X', 'ab cd')).toContain('공백');
    expect(naverKeyProblem('X', '')).toContain('비었다');
    expect(naverKeyProblem('X', 'ab\u0001')).toContain('헤더');
  });
});

describe('naverKeyPairProblem', () => {
  it('둘 중 틀린 쪽 이름만', () => {
    expect(naverKeyPairProblem(['A', 'B'], { clientId: 'ok', clientSecret: '지도키' })).toBe('B 에 ASCII 가 아닌 글자(한글 등)가 있다 — 예시 문구가 그대로 남지 않았는지 본다');
    expect(naverKeyPairProblem(['A', 'B'], { clientId: 'ok', clientSecret: 'ok2' })).toBeNull();
  });
});
