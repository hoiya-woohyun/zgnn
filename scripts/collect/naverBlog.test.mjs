import { describe, expect, it } from 'vitest';
import {
  dedupeByUrl,
  formatPageLine,
  isWithinDays,
  mentionsJeju,
  normalizeBlogUrl,
  parsePostdate,
  stopReason,
  stripBold,
  tallyPage,
  toBlogPostRow,
} from './naverBlog.mjs';
import { formatElapsed } from '../../src/lib/runSummary.ts';

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

describe('tallyPage', () => {
  const NOW = '2026-09-28T00:00:00Z';
  const item = (over) => ({ link: 'https://blog.naver.com/dogjeju/1', title: '제주 강아지 카페', description: '', postdate: '20260901', ...over });

  it('담은 행과 제외 사유(1년밖 · 그 외)를 가른다', () => {
    const tally = tallyPage(
      [
        item({ link: 'https://blog.naver.com/dogjeju/1' }),
        item({ link: 'https://blog.naver.com/dogjeju/2', postdate: '20240101' }), // 1년 밖
        item({ link: 'https://blog.naver.com/dogjeju/3', title: '부산 강아지 카페' }), // 제주 아님
        item({ link: 'https://example.com/post/4' }), // 네이버 블로그 아님
      ],
      '제주 강아지 동반 카페',
      NOW,
    );
    expect(tally.rows.map((r) => r.url)).toEqual(['https://blog.naver.com/dogjeju/1']);
    expect(tally.old).toBe(1);
    expect(tally.other).toBe(2);
    expect(tally.allOld).toBe(false);
  });

  it('행에 keyword 를 실어 준다', () => {
    const { rows } = tallyPage([item()], '제주 애견 펜션', NOW);
    expect(rows[0].keyword).toBe('제주 애견 펜션');
  });

  it('전부 1년 밖이면 allOld — 여기서 페이지 넘김을 멈춘다', () => {
    const tally = tallyPage([item({ postdate: '20240101' }), item({ postdate: '20230101' })], 'k', NOW);
    expect(tally).toMatchObject({ old: 2, other: 0, allOld: true });
    expect(tally.rows).toEqual([]);
  });

  it('1년 밖에 postdate 불량이 섞이면 allOld 가 아니다 — 깨진 항목 하나가 남은 1년을 잘라먹지 않게', () => {
    const tally = tallyPage([item({ postdate: '20240101' }), item({ postdate: '2026-09-01' })], 'k', NOW);
    expect(tally).toMatchObject({ old: 1, other: 1, allOld: false });
  });

  it('담은 행이 하나라도 있으면 allOld 가 아니다', () => {
    expect(tallyPage([item(), item({ postdate: '20240101' })], 'k', NOW).allOld).toBe(false);
  });

  it('빈 페이지는 allOld — 호출처가 먼저 끊지만 여기서도 넘기지 않는다', () => {
    expect(tallyPage([], 'k', NOW)).toEqual({ rows: [], old: 0, other: 0, allOld: true });
  });
});

describe('stopReason', () => {
  // tally 는 개수만 쓰이므로 필요한 필드만 만든다.
  const tally = ({ kept = 0, old = 0, other = 0 }) => ({ rows: Array(kept).fill({}), old, other, allOld: kept === 0 && other === 0 });
  const call = (over) => stopReason({ display: 100, isLastPage: false, ...over });

  it('꽉 찬 페이지에 1년 안 글이 있으면 계속 넘긴다', () => {
    expect(call({ received: 100, tally: tally({ kept: 100 }) })).toBe(null);
  });

  it('빈 페이지는 결과 끝', () => {
    expect(call({ received: 0, tally: tally({}) })).toBe('empty');
  });

  it('전부 1년 밖이면 경계', () => {
    expect(call({ received: 100, tally: tally({ old: 100 }) })).toBe('old');
  });

  it('덜 찬 페이지는 결과 끝 — 상한이 아니다', () => {
    expect(call({ received: 50, tally: tally({ kept: 50 }) })).toBe('empty');
  });

  it('마지막 페이지가 덜 찼으면 상한이 아니라 결과 끝 — 1년 안이 901~1000건인 키워드에 거짓 ⚠️ 가 붙던 자리', () => {
    expect(call({ received: 50, tally: tally({ kept: 50 }), isLastPage: true })).toBe('empty');
  });

  it('마지막 페이지가 꽉 찼지만 1년 밖이 섞였으면 경계 — 창이 잘린 게 아니다(allOld 는 false 라 예전 코드가 못 봤다)', () => {
    expect(call({ received: 100, tally: tally({ kept: 50, old: 50 }), isLastPage: true })).toBe('old');
  });

  it('마지막 페이지가 꽉 찼고 전부 1년 안일 때만 상한 — 유일한 참 양성', () => {
    expect(call({ received: 100, tally: tally({ kept: 100 }), isLastPage: true })).toBe('cap');
  });

  it('마지막 페이지에서는 null 을 주지 않는다 — 새어 나간 초기값이 곧 거짓 ⚠️ 였다', () => {
    for (const t of [tally({ kept: 100 }), tally({ kept: 50, old: 50 }), tally({ kept: 99, other: 1 })]) {
      expect(call({ received: 100, tally: t, isLastPage: true })).not.toBe(null);
    }
  });
});

describe('formatElapsed', () => {
  it('1분 미만은 소수 한 자리 초', () => {
    expect(formatElapsed(1540)).toBe('1.5초');
    expect(formatElapsed(999)).toBe('1.0초');
  });

  it('1분 이상은 분·초', () => {
    expect(formatElapsed(123_456)).toBe('2분 3초');
  });

  it('59.96초는 "1분 60초" 가 아니라 "1분 0초"', () => {
    expect(formatElapsed(59_960)).toBe('1분 0초');
  });
});

describe('formatPageLine', () => {
  const tally = (over) => ({ rows: [], old: 0, other: 0, allOld: false, ...over });

  it('제외가 없으면 꼬리를 붙이지 않는다', () => {
    const line = formatPageLine({ page: 1, start: 1, received: 100, tally: tally({ rows: new Array(100).fill({}) }), total: 100 });
    expect(line).toBe('  p1(start=1) 받음 100 · 담음 100 · 누적 100');
  });

  it('제외 사유는 0 인 쪽을 빼고 붙인다', () => {
    const line = formatPageLine({ page: 3, start: 201, received: 100, tally: tally({ rows: new Array(40).fill({}), old: 60 }), total: 140 });
    expect(line).toBe('  p3(start=201) 받음 100 · 담음 40 · 제외 1년밖 60 · 누적 140');
  });

  it('두 사유가 다 있으면 둘 다', () => {
    const line = formatPageLine({ page: 2, start: 101, received: 100, tally: tally({ rows: new Array(50).fill({}), old: 30, other: 20 }), total: 150 });
    expect(line).toBe('  p2(start=101) 받음 100 · 담음 50 · 제외 1년밖 30 · 비네이버·비제주 20 · 누적 150');
  });

  it('검색 결과의 제목·링크는 싣지 않는다 — 개수만(05-security)', () => {
    const rows = [{ url: 'https://blog.naver.com/dogjeju/1', title: '제주 강아지 카페 후기' }];
    const line = formatPageLine({ page: 1, start: 1, received: 1, tally: tally({ rows }), total: 1 });
    expect(line).not.toContain('dogjeju');
    expect(line).not.toContain('후기');
  });
});

// 마지막 요약 한 줄은 src/lib/runSummary.ts 로 옮겼다 — 같은 두 줄을 runSummary.test.ts 의 fixture 가 지킨다.
