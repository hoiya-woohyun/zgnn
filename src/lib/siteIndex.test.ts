import { describe, expect, it } from 'vitest';
import { PLACES } from './places';
import { ROBOTS_DISALLOW, sitemapPaths } from './siteIndex';

describe('sitemapPaths', () => {
  const paths = sitemapPaths();

  it('모든 장소 상세와 종류 셋을 담는다', () => {
    expect(paths).toContain('/places/stay/');
    expect(paths.filter((path) => path.startsWith('/place/'))).toHaveLength(PLACES.length);
  });

  it('운영자·내 기기 화면은 넣지 않는다', () => {
    for (const hidden of ['/admin', '/saved', '/dog', '/settings']) {
      expect(paths.some((path) => path.startsWith(hidden))).toBe(false);
    }
  });

  it('trailingSlash 와 맞게 전부 슬래시로 끝나고 겹치지 않는다', () => {
    expect(paths.every((path) => path.endsWith('/'))).toBe(true);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('robots 가 /admin 을 막는다', () => {
    expect(ROBOTS_DISALLOW).toContain('/admin/');
  });
});
