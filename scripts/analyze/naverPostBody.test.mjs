import { describe, expect, it } from 'vitest';
import { extractPostText, fetchPostText, MAX_BODY_CHARS, MAX_HTML_CHARS, postViewUrl } from './naverPostBody.mjs';

// 실제 페이지(300KB)를 커밋하지 않는다 — 구조만 흉내 낸 최소 fixture 다. 세 세대 에디터의 컨테이너 모양은 naverPostBody.mjs 머리 주석.

describe('postViewUrl', () => {
  it('본문을 실제로 주는 데스크톱 PostView.naver 주소', () => {
    expect(postViewUrl('dogjeju', '223456789')).toBe('https://blog.naver.com/PostView.naver?blogId=dogjeju&logNo=223456789');
  });

  it('쿼리 값은 URL 인코딩된다', () => {
    expect(postViewUrl('a b&c', '1')).toBe('https://blog.naver.com/PostView.naver?blogId=a+b%26c&logNo=1');
  });
});

describe('extractPostText — SmartEditor ONE (.se-main-container)', () => {
  // 데스크톱 SE ONE 페이지의 뼈대: 스크립트에 셀렉터 문자열이 있고, 바깥 상자에 `_postViewArea{logNo}` 클래스가 있고,
  // 컨테이너 앞뒤로 제목·댓글이 있다. 본문 안은 se-component 가 중첩된다.
  const html = `<html><head>
<script>var imageLazyLoader = new ImageLazyLoader(".se-main-container,.__se_component_area");</script>
<style>.se-main-container { color: red }</style>
</head><body>
<div id="post-view223456789" class="wrap_rabbit pcol2 _postViewArea223456789">
  <div class="se-viewer">
    <div class="se-component se-documentTitle"><p class="se-title-text"><span>제주 강아지 동반 숙소 후기</span></p></div>
    <div class="se-main-container">
      <div class="se-component se-text"><div class="se-module se-module-text">
        <p class="se-text-paragraph"><span class="se-fs- se-ff-">솔숲펜션은&nbsp;세화에서 차로 5분</span></p>
        <p class="se-text-paragraph"><span>&#8203;</span></p>
        <p class="se-text-paragraph"><span>반려동물 동반 가능 (최대 2마리) &amp; 소형견</span></p>
      </div></div>
      <div class="se-component se-imageGroup"><div class="se-imageGroup-navigation">
        <button type="button"><span class="se-blind">Previous image</span></button>
        <button type="button"><span class="se-blind">Next image</span></button>
      </div></div>
      <div class="se-component se-placesMap"><div class="se-module se-module-map">
        <strong class="se-map-title">솔숲펜션</strong><p class="se-map-address">제주 제주시 구좌읍 충렬로 141-15</p>
      </div></div>
    </div>
  </div>
</div>
<div class="comment_area"><p>댓글 3개</p><p>공감 12</p></div>
</body></html>`;

  it('본문 컨테이너 안의 문단만, 문단마다 한 줄로', () => {
    expect(extractPostText(html)).toBe(
      ['솔숲펜션은 세화에서 차로 5분', '반려동물 동반 가능 (최대 2마리) & 소형견', '솔숲펜션', '제주 제주시 구좌읍 충렬로 141-15'].join('\n'),
    );
  });

  it('제목·댓글·스크립트·스크린리더 라벨은 섞이지 않는다', () => {
    const text = extractPostText(html);
    expect(text).not.toContain('제주 강아지 동반 숙소 후기');
    expect(text).not.toContain('댓글');
    expect(text).not.toContain('ImageLazyLoader');
    expect(text).not.toContain('Previous image');
  });

  it('중첩된 div 에서 첫 </div> 로 끊기지 않는다', () => {
    // 세 번째 문단·지도 주소는 첫 </div> 보다 한참 뒤에 있다.
    expect(extractPostText(html)).toContain('제주 제주시 구좌읍');
  });
});

describe('extractPostText — 구 에디터 (#postViewArea)', () => {
  it('<br> 로 줄을 바꾼 본문을 줄 단위로', () => {
    const html = `<body><div id="postViewArea"><div id="post-view1" class="post-view">
<p><span style="font-size:10pt">강아지랑 제주 카페</span><br /><br /><font>테라스만 가능하대요</font></p>
</div></div><div class="footer">이전 다음</div></body>`;
    expect(extractPostText(html)).toBe('강아지랑 제주 카페\n테라스만 가능하대요');
  });

  it('SE ONE 의 `_postViewArea{logNo}` 클래스는 구 에디터 컨테이너로 오인하지 않는다', () => {
    const html = '<div id="post-view1" class="pcol2 _postViewArea223456789"><p>제목만</p></div><div id="postViewArea"><p>진짜 본문</p></div>';
    expect(extractPostText(html)).toBe('진짜 본문');
  });
});

describe('extractPostText — SmartEditor 3 (.__se_component_area)', () => {
  it('SE3 텍스트 주석은 남지 않고 본문 안 엔티티는 태그가 되지 않는다', () => {
    const html = `<div class="se_component_wrap sect_dsc __se_component_area">
<div class="se_component se_paragraph"><div class="se_sectionArea"><div class="se_editArea"><div class="se_textView">
<p class="se_textarea"><!-- SE3-TEXT { --><span>웹툰&nbsp;&lt;이름을&nbsp;불러주세요&gt;&nbsp;9화</span><!-- } SE3-TEXT --></p>
</div></div></div></div></div>`;
    expect(extractPostText(html)).toBe('웹툰 <이름을 불러주세요> 9화');
  });
});

describe('extractPostText — 컨테이너가 없으면 빈 문자열', () => {
  it('iframe 껍데기(blog.naver.com/{id}/{logNo})', () => {
    const html = '<html><head><title>냠 :) : 네이버 블로그</title></head><body><iframe id="mainFrame" src="/PostView.naver?blogId=a&logNo=1"></iframe></body></html>';
    expect(extractPostText(html)).toBe('');
  });

  it('스크립트 안에만 셀렉터 문자열이 있는 페이지', () => {
    const html = '<script>new ImageLazyLoader(".se-main-container");</script><div class="post_ct"><p>페이지 전체 텍스트</p></div>';
    expect(extractPostText(html)).toBe('');
  });

  it('빈 입력', () => {
    expect(extractPostText('')).toBe('');
    expect(extractPostText(undefined)).toBe('');
  });
});

describe('extractPostText — 텍스트 정리', () => {
  const wrap = (inner) => `<div class="se-main-container">${inner}</div>`;

  it('엔티티는 태그를 지운 뒤 한 번만 디코드한다', () => {
    expect(extractPostText(wrap('<p>&amp;lt;b&amp;gt; &#39;따옴표&#x27; &#8220;둥근&#8221; &unknown;</p>'))).toBe(
      "&lt;b&gt; '따옴표' “둥근” &unknown;",
    );
  });

  it('zero-width space · nbsp · 연속 공백 · 빈 줄을 정리한다', () => {
    expect(extractPostText(wrap('<p>\u200b</p><p>  가나&nbsp;&nbsp;다  \t 라 </p>\r\n<p></p><p>마</p>'))).toBe('가나 다 라\n마');
  });

  it('블록 태그(li·h2)와 표 셀(th·td)도 줄을 나눈다', () => {
    expect(
      extractPostText(wrap('<h2>제목</h2><ul><li>하나</li><li>둘</li></ul><table><tr><th>소형견</th><td>10,000원</td></tr></table>')),
    ).toBe('제목\n하나\n둘\n소형견\n10,000원');
  });

  it('잘린 HTML(짝 안 맞는 div)은 끝까지 쓴다', () => {
    expect(extractPostText('<div class="se-main-container"><div><p>끝까지</p>')).toBe('끝까지');
  });

  it('MAX_BODY_CHARS 를 넘으면 자른다', () => {
    const text = extractPostText(wrap(`<p>${'가'.repeat(MAX_BODY_CHARS + 500)}</p>`));
    expect(text).toHaveLength(MAX_BODY_CHARS);
  });
});

describe('fetchPostText', () => {

  it('비 2xx 에러에 status 가 실리고, 404·410 만 permanent — 403(차단)·5xx 는 다음 실행에 재시도', async () => {
    const at = (status) => async () => ({ ok: false, status, text: async () => '' });
    await expect(fetchPostText({ blogId: 'a', logNo: '1' }, at(404))).rejects.toMatchObject({ status: 404, permanent: true });
    await expect(fetchPostText({ blogId: 'a', logNo: '1' }, at(410))).rejects.toMatchObject({ status: 410, permanent: true });
    await expect(fetchPostText({ blogId: 'a', logNo: '1' }, at(403))).rejects.toMatchObject({ status: 403, permanent: false });
    await expect(fetchPostText({ blogId: 'a', logNo: '1' }, at(503))).rejects.toMatchObject({ status: 503, permanent: false });
  });
  it('원본 HTML 이 MAX_HTML_CHARS 를 넘으면 앞부분만 파싱한다(정규식 최악 O(n²) 방어)', async () => {
    const huge = `<div class="se-main-container"><p>앞</p></div>${'x'.repeat(MAX_HTML_CHARS + 10)}`;
    const fetchHuge = async () => ({ ok: true, status: 200, text: async () => huge });
    expect(await fetchPostText({ blogId: 'a', logNo: '1' }, fetchHuge)).toBe('앞');
    expect(MAX_HTML_CHARS).toBeGreaterThan(MAX_BODY_CHARS);
  });
  const post = { blogId: 'dogjeju', logNo: '223456789' };

  it('PostView 주소로 받아 본문 텍스트를 돌려준다', async () => {
    const calls = [];
    const fetchImpl = async (url) => {
      calls.push(url);
      return { ok: true, status: 200, text: async () => '<div class="se-main-container"><p>본문</p></div>' };
    };
    await expect(fetchPostText(post, fetchImpl)).resolves.toBe('본문');
    expect(calls).toEqual([postViewUrl('dogjeju', '223456789')]);
  });

  it('비 2xx 면 throw — 메시지에 status 와 blogId/logNo 만, 응답 본문·헤더는 없다', async () => {
    const fetchImpl = async () => ({
      ok: false,
      status: 404,
      headers: new Headers({ 'set-cookie': 'NID_SES=secret-cookie' }),
      text: async () => '<html>secret-body</html>',
    });
    const error = await fetchPostText(post, fetchImpl).catch((e) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain('status=404');
    expect(error.message).toContain('blogId=dogjeju');
    expect(error.message).toContain('logNo=223456789');
    expect(error.message).not.toContain('secret');
  });
});
