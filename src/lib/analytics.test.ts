import { describe, expect, it } from 'vitest';
import { analyticsUrlOf } from './analytics';

const base = { hostname: 'zgnn.vercel.app', siteHostname: 'zgnn.vercel.app', webdriver: false };

describe('analyticsUrlOf', () => {
  it('운영 주소의 화면은 경로만 남겨 보낸다 — 쿼리·해시는 뗀다', () => {
    expect(analyticsUrlOf({ ...base, url: 'https://zgnn.vercel.app/place/abc/?saved=1#x' })).toBe(
      'https://zgnn.vercel.app/place/abc/',
    );
  });

  it('운영 주소가 아니면 안 센다 — 로컬·LAN·프리뷰 배포', () => {
    for (const hostname of ['localhost', '192.168.0.5', 'zgnn-git-x.vercel.app']) {
      expect(analyticsUrlOf({ ...base, hostname, url: `https://${hostname}/` })).toBeNull();
    }
  });

  it('webdriver(/ux-eval·Playwright)는 안 센다', () => {
    expect(analyticsUrlOf({ ...base, webdriver: true, url: 'https://zgnn.vercel.app/' })).toBeNull();
  });

  it('/admin 은 안 센다 — 운영자 화면', () => {
    expect(analyticsUrlOf({ ...base, url: 'https://zgnn.vercel.app/admin/' })).toBeNull();
    expect(analyticsUrlOf({ ...base, url: 'https://zgnn.vercel.app/admin/ops/' })).toBeNull();
    expect(analyticsUrlOf({ ...base, url: 'https://zgnn.vercel.app/administer/' })).not.toBeNull();
  });

  it('읽을 수 없는 주소는 안 센다', () => {
    expect(analyticsUrlOf({ ...base, url: 'not a url' })).toBeNull();
  });
});
