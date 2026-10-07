import { describe, expect, it } from 'vitest';
import { OG_SITE_FILE, ogImageFile, ogImagePath, placeIdOfOgImageFile, siteOpenGraph } from './ogImage';

describe('ogImage', () => {
  it('파일 이름과 장소 id 가 서로 되돌아간다', () => {
    expect(ogImageFile()).toBe(OG_SITE_FILE);
    expect(ogImageFile('abc-1')).toBe('abc-1.png');
    expect(placeIdOfOgImageFile(ogImageFile('abc-1'))).toBe('abc-1');
    expect(placeIdOfOgImageFile(OG_SITE_FILE)).toBeNull();
    expect(placeIdOfOgImageFile('abc-1')).toBeUndefined();
  });

  it('주소는 .png 로 끝난다 — 점 없는 경로는 Vercel 이 슬래시를 붙여 404 로 보낸다', () => {
    expect(ogImagePath()).toBe('/og/site.png');
    expect(ogImagePath('abc-1')).toMatch(/^\/og\/abc-1\.png$/);
  });

  it('장소를 주면 그 장소의 카드를, 아니면 사이트 카드를 싣는다', () => {
    expect(siteOpenGraph('x').images).toEqual([{ url: '/og/site.png', width: 1200, height: 630, alt: 'x' }]);
    expect(siteOpenGraph('y', 'abc-1').images).toEqual([{ url: '/og/abc-1.png', width: 1200, height: 630, alt: 'y' }]);
  });
});
