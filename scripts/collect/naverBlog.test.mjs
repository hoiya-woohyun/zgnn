import { describe, expect, it } from 'vitest';
import {
  dedupeByUrl,
  isWithinDays,
  mentionsJeju,
  normalizeBlogUrl,
  parsePostdate,
  stripBold,
  toBlogPostRow,
} from './naverBlog.mjs';

describe('stripBold', () => {
  it('강조 태그를 벗기고 엔티티를 디코드한다', () => {
    expect(stripBold('제주 <b>강아지</b> &amp; 카페')).toBe('제주 강아지 & 카페');
  });

  it('여러 개의 <b> 를 모두 벗긴다', () => {
    expect(stripBold('<b>제주</b> <b>애견</b> 동반')).toBe('제주 애견 동반');
  });
});

describe('normalizeBlogUrl', () => {
  const expected = { url: 'https://blog.naver.com/dogjeju/223456789', blogId: 'dogjeju', logNo: '223456789' };

  it('blog.naver.com/{blogId}/{logNo}', () => {
    expect(normalizeBlogUrl('https://blog.naver.com/dogjeju/223456789')).toEqual(expected);
  });

  it('m.blog.naver.com/{blogId}/{logNo}', () => {
    expect(normalizeBlogUrl('https://m.blog.naver.com/dogjeju/223456789')).toEqual(expected);
  });

  it('PostView.naver?blogId=&logNo=', () => {
    expect(normalizeBlogUrl('https://blog.naver.com/PostView.naver?blogId=dogjeju&logNo=223456789')).toEqual(expected);
  });

  it('PostView.nhn?blogId=&logNo=', () => {
    expect(normalizeBlogUrl('https://blog.naver.com/PostView.nhn?blogId=dogjeju&logNo=223456789')).toEqual(expected);
  });

  it('네이버 블로그가 아니면 null', () => {
    expect(normalizeBlogUrl('https://blog.example.com/dogjeju/223456789')).toBeNull();
  });

  it('경로가 이상하면 null', () => {
    expect(normalizeBlogUrl('https://blog.naver.com/dogjeju')).toBeNull();
  });

  it('URL 이 아니면 null', () => {
    expect(normalizeBlogUrl('not a url')).toBeNull();
  });
});

describe('parsePostdate', () => {
  it('YYYYMMDD → ISO date', () => {
    expect(parsePostdate('20260918')).toBe('2026-09-18');
  });

  it('형식이 아니면 null', () => {
    expect(parsePostdate('2026-09-18')).toBeNull();
    expect(parsePostdate('202609')).toBeNull();
  });

  it('실존하지 않는 날짜면 null', () => {
    expect(parsePostdate('20260231')).toBeNull();
    expect(parsePostdate('20261301')).toBeNull();
  });
});

describe('isWithinDays', () => {
  const now = '2026-09-20T00:00:00Z';

  it('365일 전은 포함', () => {
    expect(isWithinDays('2025-09-20', 365, now)).toBe(true);
  });

  it('366일 전은 제외', () => {
    expect(isWithinDays('2025-09-19', 365, now)).toBe(false);
  });
});

describe('mentionsJeju', () => {
  it('제목에 있으면 true', () => {
    expect(mentionsJeju('제주 애견카페', '설명')).toBe(true);
  });

  it('요약에 있으면 true', () => {
    expect(mentionsJeju('애견카페', '제주에 있는 카페')).toBe(true);
  });

  it('둘 다 없으면 false', () => {
    expect(mentionsJeju('부산 애견카페', '설명')).toBe(false);
  });
});

describe('toBlogPostRow', () => {
  const now = '2026-09-20T00:00:00Z';
  const baseItem = {
    title: '제주 <b>강아지</b> 동반 카페',
    description: '제주도 애견 동반 카페 후기',
    link: 'https://blog.naver.com/dogjeju/223456789',
    postdate: '20260101',
  };

  it('정상 항목을 행으로 변환한다', () => {
    expect(toBlogPostRow(baseItem, '제주 강아지 동반 카페', now)).toEqual({
      url: 'https://blog.naver.com/dogjeju/223456789',
      blog_id: 'dogjeju',
      log_no: '223456789',
      title: '제주 강아지 동반 카페',
      posted_at: '2026-01-01',
      keyword: '제주 강아지 동반 카페',
    });
  });

  it('네이버 블로그가 아니면 null', () => {
    expect(toBlogPostRow({ ...baseItem, link: 'https://blog.example.com/a/1' }, 'k', now)).toBeNull();
  });

  it('제주가 없으면 null', () => {
    expect(toBlogPostRow({ ...baseItem, title: '부산 강아지 카페', description: '부산 후기' }, 'k', now)).toBeNull();
  });

  it('1년보다 오래됐으면 null', () => {
    expect(toBlogPostRow({ ...baseItem, postdate: '20250101' }, 'k', now)).toBeNull();
  });

  it('postdate 가 이상하면 null', () => {
    expect(toBlogPostRow({ ...baseItem, postdate: 'bad' }, 'k', now)).toBeNull();
  });
});

describe('dedupeByUrl', () => {
  it('같은 url 은 먼저 온 것이 이긴다', () => {
    const rows = [
      { url: 'https://blog.naver.com/a/1', keyword: '첫번째' },
      { url: 'https://blog.naver.com/a/1', keyword: '두번째' },
      { url: 'https://blog.naver.com/b/2', keyword: '세번째' },
    ];
    expect(dedupeByUrl(rows)).toEqual([
      { url: 'https://blog.naver.com/a/1', keyword: '첫번째' },
      { url: 'https://blog.naver.com/b/2', keyword: '세번째' },
    ]);
  });
});
