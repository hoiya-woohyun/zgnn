import { describe, expect, it } from 'vitest';
import { decodeHtml, fetchHomepageCard, homepageUrlOf, parseHomepageCard } from './homepageCard.mjs';

describe('homepageUrlOf — 홈페이지라고 부를 수 있는 링크만', () => {
  it('업체 도메인은 받는다', () => {
    expect(homepageUrlOf('http://www.solsup-pension.com')).toBe('http://www.solsup-pension.com/');
  });

  it('네이버·SNS·예약 플랫폼·빈 값·이상한 스킴은 받지 않는다', () => {
    for (const link of [
      'https://blog.naver.com/solsup',
      'https://m.place.naver.com/place/1/home',
      'https://naver.me/abc',
      'https://www.instagram.com/solsup',
      'https://m.facebook.com/solsup',
      'https://www.airbnb.co.kr/rooms/1',
      'https://www.yanolja.com/pension/1',
      '',
      null,
      'javascript:alert(1)',
      '솔숲펜션',
    ]) {
      expect(homepageUrlOf(link)).toBeNull();
    }
  });
});

describe('parseHomepageCard', () => {
  const page = 'https://www.solsup.com/main/';

  it('og:image · og:site_name 을 읽고 상대 주소를 푼다', () => {
    const html = `<html><head><meta content="/img/main.jpg" property="og:image"><meta property="og:site_name" content="솔숲펜션 &amp; 카페"><title>무시</title></head>`;
    expect(parseHomepageCard(html, page)).toEqual({ url: page, siteName: '솔숲펜션 & 카페', image: 'https://www.solsup.com/img/main.jpg' });
  });

  it('secure_url 이 먼저, 없으면 og:image, 그다음 twitter:image · 이름이 없으면 title', () => {
    const html = `<meta name="twitter:image" content="https://cdn.x/t.jpg"><title> 솔숲 </title>`;
    expect(parseHomepageCard(html, page)).toEqual({ url: page, siteName: '솔숲', image: 'https://cdn.x/t.jpg' });
    const both = `<meta property="og:image" content="https://cdn.x/a.jpg"><meta property="og:image:secure_url" content="https://cdn.x/b.jpg">`;
    expect(parseHomepageCard(both, page).image).toBe('https://cdn.x/b.jpg');
  });

  it('http 사진은 https 로 올리고, 파비콘·SVG 는 대표 사진이 아니다', () => {
    expect(parseHomepageCard(`<meta property="og:image" content="http://cdn.x/a.jpg">`, page).image).toBe('https://cdn.x/a.jpg');
    expect(parseHomepageCard(`<meta property="og:image" content="/favicon.ico">`, page).image).toBeNull();
    expect(parseHomepageCard(`<meta property="og:image" content="/logo.svg">`, page).image).toBeNull();
  });

  it('아무것도 없으면 사진·이름 없는 카드 — 지어내지 않는다', () => {
    expect(parseHomepageCard('<html></html>', page)).toEqual({ url: page, siteName: null, image: null });
  });
});

describe('fetchHomepageCard', () => {
  const response = (html, { url = 'https://www.solsup.com/', status = 200, type = 'text/html; charset=utf-8' } = {}) => ({
    ok: status >= 200 && status < 300,
    status,
    url,
    headers: new Headers({ 'content-type': type }),
    arrayBuffer: async () => new TextEncoder().encode(html).buffer,
  });

  it('홈페이지가 아니면 부르지도 않는다', async () => {
    let called = false;
    const out = await fetchHomepageCard('https://instagram.com/x', async () => {
      called = true;
    });
    expect(out).toBeNull();
    expect(called).toBe(false);
  });

  it('리다이렉트 끝이 인스타그램이면 카드를 만들지 않는다', async () => {
    const out = await fetchHomepageCard('https://www.solsup.com', async () => response('', { url: 'https://www.instagram.com/solsup/' }));
    expect(out).toBeNull();
  });

  it('비 2xx 는 던진다 · HTML 이 아니면 null', async () => {
    await expect(fetchHomepageCard('https://www.solsup.com', async () => response('', { status: 503 }))).rejects.toThrow('503');
    expect(await fetchHomepageCard('https://www.solsup.com', async () => response('', { type: 'application/pdf' }))).toBeNull();
  });

  it('최종 주소 기준으로 카드를 만든다', async () => {
    const html = '<meta property="og:image" content="img/a.jpg">';
    const out = await fetchHomepageCard('http://solsup.com', async () => response(html, { url: 'https://www.solsup.com/home/' }));
    expect(out).toEqual({ url: 'https://www.solsup.com/home/', siteName: null, image: 'https://www.solsup.com/home/img/a.jpg' });
  });
});

describe('decodeHtml', () => {
  // "솔숲" 의 EUC-KR 바이트
  const eucKr = new Uint8Array([0x3c, 0x74, 0x69, 0x74, 0x6c, 0x65, 0x3e, 0xbc, 0xd6, 0xbd, 0xa3, 0x3c, 0x2f, 0x74, 0x69, 0x74, 0x6c, 0x65, 0x3e]);

  it('헤더의 charset 으로 푼다', () => {
    expect(decodeHtml(eucKr, 'text/html; charset=euc-kr')).toBe('<title>솔숲</title>');
  });

  it('헤더에 없으면 문서의 meta charset 으로', () => {
    const meta = new TextEncoder().encode('<meta charset="euc-kr">');
    const bytes = new Uint8Array([...meta, ...eucKr]);
    expect(parseHomepageCard(decodeHtml(bytes, 'text/html'), 'https://a.kr/').siteName).toBe('솔숲');
  });

  it('모르는 charset 은 utf-8 로 물러선다', () => {
    expect(decodeHtml(new TextEncoder().encode('가'), 'text/html; charset=nope')).toBe('가');
  });
});
