import { describe, expect, it } from 'vitest';
import { chunkForUrlFilter } from './chunkForUrlFilter.mjs';

const blogUrl = (i) => `https://blog.naver.com/someblogid${i}/2239${String(i).padStart(7, '0')}`;

/** 덩어리 하나가 실제로 만들어 낼 `in.(…)` 의 인코딩 길이. 스크립트가 쏘는 모양과 같아야 의미가 있다. */
const encodedLength = (chunk) => encodeURIComponent(`in.(${chunk.map((v) => JSON.stringify(v)).join(',')})`).length;

describe('chunkForUrlFilter', () => {
  // 옛 코드는 500개씩 잘랐고 URL 이 33KB 가 되어 엣지가 평문 400 으로 거절했다(BUG-007).
  // 실측 상한은 약 14,700자였으므로, 어떤 덩어리도 그 절반을 넘지 않아야 한다.
  it('어떤 덩어리도 실측 상한(약 14,700자) 근처에 가지 않는다', () => {
    const chunks = chunkForUrlFilter(Array.from({ length: 1200 }, (_, i) => blogUrl(i)));
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) expect(encodedLength(chunk)).toBeLessThan(7000);
  });

  it('값을 하나도 잃지 않고 순서도 그대로다', () => {
    const urls = Array.from({ length: 1200 }, (_, i) => blogUrl(i));
    expect(chunkForUrlFilter(urls).flat()).toEqual(urls);
  });

  // 개수로 자르면 값 길이에 따라 어떤 데이터에서만 죽는다 — 길이로 자르므로 긴 값은 덩어리가 작아져야 한다.
  it('값이 길면 덩어리가 자동으로 작아진다', () => {
    const short = chunkForUrlFilter(Array.from({ length: 300 }, (_, i) => `https://blog.naver.com/a${i}/1`));
    const long = chunkForUrlFilter(Array.from({ length: 300 }, (_, i) => `https://blog.naver.com/${'x'.repeat(200)}${i}/1`));
    expect(long[0].length).toBeLessThan(short[0].length);
  });

  // 조용히 빠지면 "기존 글" 판정이 틀려 신규 수가 부풀고, 그건 아무 데도 안 찍힌다.
  it('값 하나가 예산보다 길어도 버리지 않고 혼자 한 덩어리가 된다', () => {
    const huge = `https://blog.naver.com/${'y'.repeat(9000)}/1`;
    const chunks = chunkForUrlFilter([huge, blogUrl(1)]);
    expect(chunks.flat()).toEqual([huge, blogUrl(1)]);
    expect(chunks[0]).toEqual([huge]);
  });

  it('빈 목록은 덩어리도 없다 — 빈 in.() 을 쏘지 않게', () => {
    expect(chunkForUrlFilter([])).toEqual([]);
  });

  it('한 덩어리에 들어가면 자르지 않는다', () => {
    expect(chunkForUrlFilter([blogUrl(1), blogUrl(2)])).toEqual([[blogUrl(1), blogUrl(2)]]);
  });

  // 퍼센트 인코딩으로 한 글자가 9배까지 부푼다 — 길이를 raw 로 세면 예산이 조용히 무너진다.
  it('한글처럼 인코딩되면 부푸는 값도 인코딩 뒤 길이로 센다', () => {
    const chunks = chunkForUrlFilter(Array.from({ length: 400 }, (_, i) => `https://blog.naver.com/가나다라마바사${i}/1`));
    for (const chunk of chunks) expect(encodedLength(chunk)).toBeLessThan(7000);
  });
});
