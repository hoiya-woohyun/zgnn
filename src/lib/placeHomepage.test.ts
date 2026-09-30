import { describe, expect, it } from 'vitest';
import { homepageHost } from './placeHomepage';

describe('homepageHost', () => {
  it('도메인만, www. 은 뗀다', () => {
    expect(homepageHost('https://www.solsup.com/main/?a=1')).toBe('solsup.com');
    expect(homepageHost('http://pension.co.kr')).toBe('pension.co.kr');
  });

  it('못 읽으면 원문 그대로', () => {
    expect(homepageHost('솔숲')).toBe('솔숲');
  });
});
