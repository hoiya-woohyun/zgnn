import { describe, expect, it } from 'vitest';
import { decodeHtml, fetchHomepageCard, homepageUrlOf, isInternalHost, MAX_REDIRECTS, parseHomepageCard } from './homepageCard.mjs';

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

describe('homepageUrlOf — 번호로 된 주소는 플랫폼의 업체 페이지다', () => {
  it('경로 마디나 쿼리 값이 숫자뿐이면 목록에 없는 호스트여도 카드를 만들지 않는다', () => {
    for (const link of [
      'https://www.some-directory.kr/0647230303',
      'https://reservation.some-booking.kr/81278',
      'https://noti.some-waiting.kr/link/point?path=restaurant_details&restaurant_idx=11235',
    ]) {
      expect(homepageUrlOf(link)).toBeNull();
    }
  });

  it('업체 자기 사이트의 하위 경로는 그대로 받는다', () => {
    for (const link of [
      'https://www.glad-hotels.com/maisongladjeju/index.do',
      'http://www.sunsetcoast.kr/html/index.html',
      'https://www.sonohotelsresorts.com/calm_jj',
      'https://phoenixhnr.co.kr/page/main/jeju',
    ]) {
      expect(homepageUrlOf(link)).not.toBeNull();
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

describe('내부 주소 거부 (20 T12)', () => {
  it('사설·루프백·링크로컬·메타데이터 대역과 내부 이름은 홈페이지가 아니다', () => {
    for (const link of [
      'http://127.0.0.1/', 'http://localhost:3000/', 'http://10.0.0.5/', 'http://172.16.0.1/', 'http://172.31.255.1/', 'http://192.168.0.1/',
      'http://169.254.169.254/latest/meta-data/', 'http://2130706433/', 'http://0x7f.1/', 'http://100.64.0.1/', 'http://0.0.0.0/',
      'http://[::1]/', 'http://[fe80::1]/', 'http://[fd00::1]/', 'http://[::ffff:127.0.0.1]/', 'http://intranet/', 'http://db.internal/', 'http://printer.local/',
    ]) {
      expect(homepageUrlOf(link), link).toBeNull();
    }
  });

  it('공인 주소는 받는다', () => {
    expect(isInternalHost('172.32.0.1')).toBe(false);
    expect(isInternalHost('8.8.8.8')).toBe(false);
    expect(homepageUrlOf('https://www.solsup.com/')).not.toBeNull();
  });
});

describe('fetchHomepageCard — 리다이렉트를 홉마다 검사', () => {
  const redirect = (location, status = 302) => ({ ok: false, status, url: '', headers: new Headers({ location }) });
  const page = (html = '<meta property="og:image" content="/a.jpg">') => ({
    ok: true,
    status: 200,
    url: '',
    headers: new Headers({ 'content-type': 'text/html' }),
    arrayBuffer: async () => new TextEncoder().encode(html).buffer,
  });
  const script = (...responses) => {
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push({ url, redirect: init.redirect });
      return responses[calls.length - 1];
    };
    return { calls, fetchImpl };
  };

  it('redirect: manual 로 부르고, 상대 Location 은 현재 주소 기준으로 풀어 따라간다', async () => {
    const { calls, fetchImpl } = script(redirect('/home/'), page());
    const out = await fetchHomepageCard('https://www.solsup.com/', fetchImpl);
    expect(calls.map((c) => c.redirect)).toEqual(['manual', 'manual']);
    expect(calls[1].url).toBe('https://www.solsup.com/home/');
    expect(out.image).toBe('https://www.solsup.com/a.jpg');
  });

  it('중간 홉이 내부 주소로 가면 그 주소를 부르지 않고 null', async () => {
    for (const location of ['http://169.254.169.254/latest/meta-data/', 'http://127.0.0.1:8080/', 'http://[::1]/', '//10.0.0.1/x']) {
      const { calls, fetchImpl } = script(redirect(location), page());
      expect(await fetchHomepageCard('https://www.solsup.com/', fetchImpl), location).toBeNull();
      expect(calls).toHaveLength(1);
    }
  });

  it('두 번째 홉에서 내부로 꺾어도 막는다', async () => {
    const { calls, fetchImpl } = script(redirect('https://other.example.com/'), redirect('http://192.168.0.1/'), page());
    expect(await fetchHomepageCard('https://www.solsup.com/', fetchImpl)).toBeNull();
    expect(calls).toHaveLength(2);
  });

  it('시작 주소가 내부면 부르지도 않는다', async () => {
    const { calls, fetchImpl } = script(page());
    expect(await fetchHomepageCard('http://169.254.169.254/', fetchImpl)).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('홉 상한을 넘으면 던진다 · Location 이 없어도 던진다', async () => {
    const loop = Array.from({ length: MAX_REDIRECTS + 2 }, () => redirect('/again'));
    await expect(fetchHomepageCard('https://www.solsup.com/', script(...loop).fetchImpl)).rejects.toThrow('번을 넘었어요');
    const noLocation = { ok: false, status: 301, url: '', headers: new Headers() };
    await expect(fetchHomepageCard('https://www.solsup.com/', script(noLocation).fetchImpl)).rejects.toThrow('Location');
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
