import { describe, expect, it } from 'vitest';
import { dogCallName, dogCallNames, hasBatchim, josa, withJosa } from './korean';

describe('hasBatchim', () => {
  it('받침 있는 한글은 true, 없는 한글은 false', () => {
    expect(hasBatchim('우현')).toBe(true);
    expect(hasBatchim('민수')).toBe(false);
  });

  it('한글이 아니면(영문·숫자·빈 문자열) false', () => {
    expect(hasBatchim('Coco')).toBe(false);
    expect(hasBatchim('7')).toBe(false);
    expect(hasBatchim('')).toBe(false);
  });
});

describe('dogCallName — 보호자가 부르는 이름', () => {
  it('받침으로 끝나면 이 를 붙인다', () => {
    expect(dogCallName('우현')).toBe('우현이');
    expect(dogCallName('악동')).toBe('악동이');
  });

  it('받침이 없으면 그대로 — 악동이 가 악동이이 가 되지 않는다', () => {
    expect(dogCallName('민수')).toBe('민수');
    expect(dogCallName('악동이')).toBe('악동이');
    expect(dogCallName('Coco')).toBe('Coco');
  });

  it('앞뒤 공백은 잘라낸다', () => {
    expect(dogCallName(' 두부 ')).toBe('두부');
  });
});

describe('josa / withJosa — 입력 단어의 받침 기준', () => {
  it('은/는', () => {
    expect(withJosa(dogCallName('우현'), '은/는')).toBe('우현이는');
    expect(withJosa(dogCallName('민수'), '은/는')).toBe('민수는');
    expect(withJosa(dogCallName('악동이'), '은/는')).toBe('악동이는');
    expect(withJosa('Coco', '은/는')).toBe('Coco는');
    expect(withJosa('콩', '은/는')).toBe('콩은');
  });

  it('이랑/랑 · 과/와 · 이/가 · 을/를 · 아/야', () => {
    expect(withJosa('우현이', '이랑/랑')).toBe('우현이랑');
    expect(withJosa('콩', '이랑/랑')).toBe('콩이랑');
    expect(withJosa('콩', '과/와')).toBe('콩과');
    expect(withJosa('두부', '과/와')).toBe('두부와');
    expect(josa('콩', '이/가')).toBe('이');
    expect(josa('두부', '을/를')).toBe('를');
    expect(withJosa('콩', '아/야')).toBe('콩아');
  });
});

describe('dogCallNames — 여러 마리 묶기', () => {
  it('1마리는 애칭 하나', () => {
    expect(dogCallNames(['악동'])).toBe('악동이');
  });

  it('2마리는 앞 이름에 과/와', () => {
    expect(dogCallNames(['우현', '민수'])).toBe('우현이와 민수');
    expect(dogCallNames(['악동이', '두부'])).toBe('악동이와 두부');
  });

  it('3마리는 쉼표로 나열', () => {
    expect(dogCallNames(['악동', '두부', '콩'])).toBe('악동이, 두부, 콩이');
  });

  it('묶은 결과에 조사를 붙이면 마지막 이름 기준으로 골라진다', () => {
    expect(withJosa(dogCallNames(['악동', '두부']), '이랑/랑')).toBe('악동이와 두부랑');
    expect(withJosa(dogCallNames(['우현', '민수']), '은/는')).toBe('우현이와 민수는');
  });

  it('빈 배열이면 빈 문자열', () => {
    expect(dogCallNames([])).toBe('');
  });
});
