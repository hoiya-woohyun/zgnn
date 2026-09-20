// 네이버 검색 오픈 API(blog.json) 응답을 blog_posts 행으로 다듬는 순수 함수들. I/O 없음 — 테스트는 naverBlog.test.mjs.
// 무엇을 왜 거르는지는 docs/todo/02-collect-naver-blog.md 가 정본.

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'" };

// 검색어 강조 태그(<b>)를 벗기고 HTML 엔티티를 디코드한다.
export function stripBold(s) {
  return s
    .replace(/<\/?b>/g, '')
    .replace(/&amp;|&lt;|&gt;|&quot;|&#39;|&apos;/g, (m) => ENTITIES[m]);
}

const BLOG_HOSTS = new Set(['blog.naver.com', 'm.blog.naver.com']);

// 여러 형태의 네이버 블로그 링크를 { url, blogId, logNo } 로 정규화한다. 네이버 블로그가 아니면 null.
export function normalizeBlogUrl(link) {
  let parsed;
  try {
    parsed = new URL(link);
  } catch {
    return null;
  }
  if (!BLOG_HOSTS.has(parsed.hostname)) return null;

  const segments = parsed.pathname.split('/').filter(Boolean);
  let blogId;
  let logNo;

  if (/PostView\.(naver|nhn)$/i.test(parsed.pathname)) {
    blogId = parsed.searchParams.get('blogId');
    logNo = parsed.searchParams.get('logNo');
  } else if (segments.length === 2) {
    [blogId, logNo] = segments;
  } else {
    return null;
  }

  if (!blogId || !logNo) return null;
  return { url: `https://blog.naver.com/${blogId}/${logNo}`, blogId, logNo };
}

// 'YYYYMMDD' → 'YYYY-MM-DD'. 형식이 이상하거나 실존하지 않는 날짜면 null.
export function parsePostdate(postdate) {
  if (!/^\d{8}$/.test(postdate)) return null;
  const year = Number(postdate.slice(0, 4));
  const month = Number(postdate.slice(4, 6));
  const day = Number(postdate.slice(6, 8));
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${postdate.slice(0, 4)}-${postdate.slice(4, 6)}-${postdate.slice(6, 8)}`;
}

// isoDate 가 now 기준 days 일 이내(경계 포함)인가. now 를 주입받아 순수 함수로 둔다.
export function isWithinDays(isoDate, days, now) {
  const postedMs = new Date(`${isoDate}T00:00:00Z`).getTime();
  const nowMs = new Date(now).getTime();
  const diffDays = (nowMs - postedMs) / 86_400_000;
  return diffDays <= days;
}

// 제외 규칙은 최소로 — 제목·요약 어디에도 "제주" 가 없으면 버린다(02).
export function mentionsJeju(title, description) {
  return title.includes('제주') || description.includes('제주');
}

export const WINDOW_DAYS = 365;

// 검색 API 의 item 하나 → blog_posts 행. 정규화 실패·제주 아님·1년 밖이면 null.
export function toBlogPostRow(item, keyword, now) {
  const normalized = normalizeBlogUrl(item.link);
  if (!normalized) return null;

  const title = stripBold(item.title);
  const description = stripBold(item.description ?? '');
  if (!mentionsJeju(title, description)) return null;

  const postedAt = parsePostdate(item.postdate);
  if (!postedAt) return null;
  if (!isWithinDays(postedAt, WINDOW_DAYS, now)) return null;

  return { url: normalized.url, blog_id: normalized.blogId, log_no: normalized.logNo, title, posted_at: postedAt, keyword };
}

// url 이 같은 행이 여러 키워드에서 나오면 먼저 온(=먼저 실행한 키워드) 것이 이긴다.
export function dedupeByUrl(rows) {
  const seen = new Map();
  for (const row of rows) {
    if (!seen.has(row.url)) seen.set(row.url, row);
  }
  return [...seen.values()];
}
