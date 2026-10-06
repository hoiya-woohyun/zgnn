import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MAX_IMAGES,
  downloadImages,
  looksLikeScreenshot,
  postImageCandidates,
  resizedImageUrl,
  selectPostImages,
} from './postImages.mjs';

// 실제 페이지(300KB)를 커밋하지 않는다 — SE ONE 의 se-component 구조만 흉내 낸 최소 fixture.
const PIC = (n, w = 900, h = 675) =>
  `<img src="https://postfiles.pstatic.net/A/${n}.jpg?type=w80_blur" data-lazy-src="https://postfiles.pstatic.net/A/${n}.jpg?type=w773" data-width="${w}" data-height="${h}" class="se-image-resource" />`;
const text = (t) => `<div class="se-component se-text se-l-default"><p class="se-text-paragraph"><span>${t}</span></p></div>`;
const image = (...imgs) => `<div class="se-component se-image se-l-default"><a>${imgs.join('')}</a></div>`;
const strip = (...imgs) => `<div class="se-component se-imageStrip se-l-default">${imgs.join('')}</div>`;
const sticker = `<div class="se-component se-sticker se-l-default"><img src="https://storep-phinf.pstatic.net/ogq/original_1.png?type=p100_100" class="se-sticker-image" /></div>`;
const page = (inner) =>
  `<html><script>new ImageLazyLoader(".se-main-container")</script><body><div class="se-main-container">${inner}</div><div id="comments">${PIC('comment')}</div></body></html>`;

describe('postImageCandidates — 본문 사진 후보(글 순서)', () => {
  const html = page(
    [
      text('숙소 도착!'),
      image(PIC(1)),
      text('반려견 이용 안내는 아래 캡처 참고하세요'),
      strip(PIC(2, 900, 1665), PIC(3)),
      sticker,
      image('<img data-lazy-src="https://postfiles.pstatic.net/A/anim.gif?type=w773" data-width="500" data-height="300" class="se-image-resource" />'),
      image('<img data-lazy-src="https://example.com/x.jpg" data-width="900" data-height="675" />'),
      text('마당이 넓어요'),
    ].join(''),
  );
  const c = postImageCandidates(html);

  it('pstatic 본문 사진만, 컨테이너 밖(댓글)·스티커·gif·외부 그림은 뺀다', () => {
    expect(c.map((x) => x.originalUrl)).toEqual([1, 2, 3].map((n) => `https://postfiles.pstatic.net/A/${n}.jpg?type=w773`));
  });

  it('주소는 data-lazy-src(흐린 자리표시 아님)를 폭 변형으로 바꾼 것', () => {
    expect(c[0].url).toBe('https://postfiles.pstatic.net/A/1.jpg?type=w773');
    expect(resizedImageUrl('https://postfiles.pstatic.net/A/1.jpg?type=w80_blur', 'w580')).toBe('https://postfiles.pstatic.net/A/1.jpg?type=w580');
  });

  it('앞·뒤로 가장 가까운 글 문단을 붙인다', () => {
    expect(c[0]).toMatchObject({ index: 0, before: '숙소 도착!', after: '반려견 이용 안내는 아래 캡처 참고하세요', width: 900, height: 675 });
    expect(c[1]).toMatchObject({ index: 1, before: '반려견 이용 안내는 아래 캡처 참고하세요', after: '마당이 넓어요' });
  });

  it('se-component 가 없는 옛 에디터는 이웃 없이 순서만', () => {
    const old = `<div id="postViewArea"><p>글</p>${PIC(7)}<br>${PIC(8)}</div>`;
    expect(postImageCandidates(old).map((x) => [x.index, x.before, x.after])).toEqual([[0, '', ''], [1, '', '']]);
  });

  it('컨테이너가 없으면 빈 배열', () => {
    expect(postImageCandidates('<html><body>없음</body></html>')).toEqual([]);
  });
});

describe('looksLikeScreenshot', () => {
  it('카메라 비율(4:3 · 3:4 · 9:16 · 1:1 …)은 아니다', () => {
    for (const [w, h] of [[900, 675], [3024, 4032], [900, 1600], [900, 900], [900, 506], [731, 489]]) expect(looksLikeScreenshot(w, h)).toBe(false);
  });
  it('휴대폰 캡처·잘라 낸 안내문 비율은 그렇다', () => {
    for (const [w, h] of [[1170, 2532], [900, 1665], [900, 1638], [519, 975]]) expect(looksLikeScreenshot(w, h)).toBe(true);
  });
  it('크기를 모르면 false', () => {
    expect(looksLikeScreenshot(null, 500)).toBe(false);
  });
});

describe('selectPostImages — 상한 안에서 조건이 있을 법한 사진부터', () => {
  const cand = (index, over = {}) => ({ url: `u${index}`, originalUrl: `o${index}`, width: 900, height: 675, index, before: '', after: '', ...over });

  it('조건 낱말 이웃 > 캡처 비율 > 글 순서, 결과는 글 순서로', () => {
    const picks = selectPostImages(
      [cand(0), cand(1), cand(2, { width: 900, height: 1665 }), cand(3, { after: '1마리당 2만원 추가' }), cand(4)],
      3,
    );
    expect(picks.map((p) => [p.index, p.reason])).toEqual([[0, 'fill'], [2, 'screenshot'], [3, 'keyword']]);
    expect(picks[0]).toMatchObject({ url: 'u0', originalUrl: 'o0' });
  });

  it("'강아지'·'애견' 만으로는 조건 낱말이 아니다 — 반려견 글은 거의 모든 문단에 있다", () => {
    expect(selectPostImages([cand(0, { before: '강아지랑 애견 펜션' })], 1)[0].reason).toBe('fill');
  });

  it('기본 상한은 8장', () => {
    expect(DEFAULT_MAX_IMAGES).toBe(8);
    expect(selectPostImages(Array.from({ length: 20 }, (_, i) => cand(i)))).toHaveLength(8);
  });
});

describe('downloadImages — 메모리로만, 실패는 그 사진만 건너뛴다', () => {
  const res = (status, type, bytes, len) => ({
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'content-type': type, ...(len != null ? { 'content-length': String(len) } : {}) }),
    arrayBuffer: async () => new Uint8Array(bytes).buffer,
  });

  it('이미지면 base64 로, 형식이 아니거나 크면 건너뛴다', async () => {
    const table = {
      a: res(200, 'image/jpeg; charset=binary', 3),
      b: res(200, 'text/html', 3),
      c: res(200, 'image/png', 10),
      d: res(200, 'image/png', 3, 999),
    };
    const { images, skipped } = await downloadImages(
      ['a', 'b', 'c', 'd'].map((u) => ({ url: u })),
      async (u) => table[u],
      { maxBytes: 5 },
    );
    expect(images).toEqual([{ mediaType: 'image/jpeg', data: Buffer.from([0, 0, 0]).toString('base64'), bytes: 3, url: 'a' }]);
    expect(skipped).toEqual([
      { url: 'b', why: 'type_text/html' },
      { url: 'c', why: 'too_large' },
      { url: 'd', why: 'too_large' },
    ]);
  });

  it('폭 변형이 4xx 면 원본 주소로 한 번 더, 예외는 건너뛴다', async () => {
    const seen = [];
    const fetchImpl = async (u) => {
      seen.push(u);
      if (u === 'boom') throw new Error('net');
      return u === 'small' ? res(404, 'text/html', 0) : res(200, 'image/webp', 2);
    };
    const { images, skipped } = await downloadImages([{ url: 'small', originalUrl: 'orig' }, { url: 'boom' }], fetchImpl);
    expect(seen).toEqual(['small', 'orig', 'boom']);
    expect(images.map((i) => i.url)).toEqual(['orig']);
    expect(skipped).toEqual([{ url: 'boom', why: 'fetch_error' }]);
  });
});
