import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { checkReviewUrl, classifyReviewPage, main, naverRedirectMessage, REVIEW_LINK_STATES } from './check-review-links.mjs';

// 2026-10-19 실측한 네이버 응답 조각(전문은 100KB 대라 판정에 쓰이는 부분만).
const DELETED_200 = `<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN">
<html><head><meta http-equiv="Content-Type" content="text/html; charset=UTF-8"></head>
<body>
<script language="JavaScript" >
    alert("게시물이 삭제되었거나 다른 페이지로 변경되었습니다.");
  location.href = 'https://section.blog.naver.com';
</script>
</body></html>`;
const DELETED_404 = `<meta name="robots" content="noindex,nofollow" />
</head>
<body>
<script language="JavaScript" >
var msg = '게시물이 삭제되었거나 다른 페이지로 변경되었습니다.';
if( msg != '' )
alert(msg);
location.replace('/PostList.naver?blogId=cozyzzz-');
</script>`;
const PRIVATE_200 = `<meta name="robots" content="noindex,nofollow" />
</head>
<body>
<script language="JavaScript" >
var msg = '비공개 글 입니다.';
if( msg != '' )
alert(msg);
location.replace('/PostList.naver?blogId=gogowithyou&fromClosedPost=true');
</script>`;
const LIVE = '<div class="se-main-container"><div class="se-component se-text"><p class="se-text-paragraph"><span>반려견 동반 가능해요</span></p></div></div>';
const LIVE_WITH_ALERT = `<script>alert('SE1.0 으로 작성된 글로…');</script>${LIVE}`;

describe('naverRedirectMessage', () => {
  it('var msg 와 alert("…") 둘 다 읽는다', () => {
    expect(naverRedirectMessage(DELETED_200)).toBe('게시물이 삭제되었거나 다른 페이지로 변경되었습니다.');
    expect(naverRedirectMessage(DELETED_404)).toBe('게시물이 삭제되었거나 다른 페이지로 변경되었습니다.');
    expect(naverRedirectMessage(PRIVATE_200)).toBe('비공개 글 입니다.');
    expect(naverRedirectMessage("<script>alert('안녕')</script>")).toBe('안녕');
  });
  it('없으면 null', () => {
    expect(naverRedirectMessage(LIVE)).toBeNull();
    expect(naverRedirectMessage(null)).toBeNull();
  });
});

describe('classifyReviewPage', () => {
  it('삭제(200 껍데기) · 삭제(404) · 비공개(200) 는 gone', () => {
    expect(classifyReviewPage({ status: 200, html: DELETED_200 })).toEqual({ state: 'gone', detail: '게시물이 삭제되었거나 다른 페이지로 변경되었습니다.' });
    expect(classifyReviewPage({ status: 404, html: DELETED_404 })).toEqual({ state: 'gone', detail: '게시물이 삭제되었거나 다른 페이지로 변경되었습니다.' });
    expect(classifyReviewPage({ status: 200, html: PRIVATE_200 })).toEqual({ state: 'gone', detail: '비공개 글 입니다.' });
  });
  it('본문 컨테이너가 있으면 alive — 무관한 alert 가 있어도', () => {
    expect(classifyReviewPage({ status: 200, html: LIVE })).toEqual({ state: 'alive', detail: null });
    expect(classifyReviewPage({ status: 200, html: LIVE_WITH_ALERT })).toEqual({ state: 'alive', detail: null });
  });
  it('404 인데 안내문이 없으면 gone("HTTP 404")', () => {
    expect(classifyReviewPage({ status: 404, html: '' })).toEqual({ state: 'gone', detail: 'HTTP 404' });
  });
  it('503 같은 차단·점검은 unknown — 삭제로 읽지 않는다', () => {
    expect(classifyReviewPage({ status: 503, html: '<html>점검 중</html>' })).toEqual({ state: 'unknown', detail: 'HTTP 503' });
  });
  it('모르는 안내문은 unknown', () => {
    expect(classifyReviewPage({ status: 200, html: "<script>alert('잠시 후 다시 시도해 주세요');</script>" })).toEqual({
      state: 'unknown',
      detail: '잠시 후 다시 시도해 주세요',
    });
    expect(classifyReviewPage({ status: 200, html: '<html></html>' }).detail).toBe('본문을 찾지 못했어요');
  });
  it('detail 은 200자로 자른다', () => {
    expect(classifyReviewPage({ status: 404, html: `<script>alert('${'가'.repeat(300)}')</script>` }).detail).toHaveLength(200);
  });
});

describe('checkReviewUrl', () => {
  const reply = (status, html) => vi.fn(async () => ({ status, text: async () => html }));
  it('블로그 주소가 아니면 요청 없이 unknown', async () => {
    const fetchImpl = reply(200, LIVE);
    expect(await checkReviewUrl('https://example.com/a', fetchImpl)).toMatchObject({ state: 'unknown', detail: '네이버 블로그 주소가 아니에요' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('PostView 주소를 받아 판정하고 status 를 싣는다', async () => {
    const fetchImpl = reply(404, DELETED_404);
    expect(await checkReviewUrl('https://blog.naver.com/abc/123', fetchImpl)).toMatchObject({ state: 'gone', status: 404 });
    expect(fetchImpl.mock.calls[0][0]).toBe('https://blog.naver.com/PostView.naver?blogId=abc&logNo=123');
  });
  it('던지면 unknown', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('boom');
    });
    expect(await checkReviewUrl('https://blog.naver.com/abc/123', fetchImpl)).toMatchObject({ state: 'unknown', detail: '받지 못했어요(boom)' });
  });
});

describe('표와의 짝', () => {
  it('표의 CHECK 와 같은 목록이다', () => {
    const sql = readFileSync(new URL('../supabase/migrations/20261019120000_review_link_checks.sql', import.meta.url), 'utf8');
    const listed = /state\s+text not null check \(state in \(([^)]+)\)/.exec(sql)?.[1].match(/'([a-z_]+)'/g)?.map((v) => v.slice(1, -1));
    expect(listed).toEqual([...REVIEW_LINK_STATES]);
  });
});

describe('main', () => {
  const PLACES = [
    { id: 'p1', name: '살아있는곳', review_url: 'https://blog.naver.com/a/1' },
    { id: 'p2', name: '호텔 핀코', review_url: 'https://blog.naver.com/b/2' },
    { id: 'p3', name: '후기없음', review_url: null },
  ];
  function fakeSupabase({ probeError = null } = {}) {
    const upsert = vi.fn(async () => ({ error: null }));
    const supabase = {
      upsert,
      from: (table) => {
        if (table === 'review_link_checks') {
          return { select: () => ({ limit: async () => ({ error: probeError }) }), upsert };
        }
        return { select: () => ({ eq: () => ({ order: async () => ({ data: PLACES, error: null }) }) }) };
      },
    };
    return supabase;
  }
  const fetchBy = async (url) => (url.includes('logNo=1') ? { status: 200, text: async () => LIVE } : { status: 404, text: async () => DELETED_404 });
  const deps = (supabase) => ({ supabase, fetch: vi.fn(fetchBy), sleep: async () => {}, log: vi.fn() });

  it('dry-run 은 쓰지 않는다', async () => {
    const d = deps(fakeSupabase());
    expect(await main(['--dry-run'], d)).toBe(0);
    expect(d.supabase.upsert).not.toHaveBeenCalled();
    expect(d.log).toHaveBeenCalledWith('살아 있음 1 · 못 읽음 1 · 모름 0');
  });
  it('쓰기는 place_id 로 upsert 한다', async () => {
    const d = deps(fakeSupabase());
    expect(await main([], d)).toBe(0);
    const [rows, opts] = d.supabase.upsert.mock.calls[0];
    expect(opts).toEqual({ onConflict: 'place_id' });
    expect(rows.map(({ checked_at, ...r }) => r)).toEqual([
      { place_id: 'p1', url: 'https://blog.naver.com/a/1', state: 'alive', detail: null },
      { place_id: 'p2', url: 'https://blog.naver.com/b/2', state: 'gone', detail: '게시물이 삭제되었거나 다른 페이지로 변경되었습니다.' },
    ]);
    expect(rows.every((r) => typeof r.checked_at === 'string')).toBe(true);
  });
  it('표가 없으면 1', async () => {
    const d = deps(fakeSupabase({ probeError: { code: 'PGRST205', message: 'x' } }));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await main([], d)).toBe(1);
    expect(d.fetch).not.toHaveBeenCalled();
    spy.mockRestore();
  });
  it('429 면 멈추고 거기까지만 쓰고 2', async () => {
    const d = deps(fakeSupabase());
    d.fetch = vi.fn(async (url) => (url.includes('logNo=1') ? { status: 200, text: async () => LIVE } : { status: 429, text: async () => '' }));
    expect(await main([], d)).toBe(2);
    expect(d.supabase.upsert.mock.calls[0][0].map((r) => r.place_id)).toEqual(['p1']);
  });
});
