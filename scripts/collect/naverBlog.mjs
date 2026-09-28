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

// 검색 결과 한 페이지를 `blog_posts` 행과 제외 집계로 나눈다. `collect-blog.mjs` 의 루프 안에 있던 계산을 끌어냈다 —
// 진행 로그가 페이지마다 이 수치를 찍게 되면서 테스트가 필요해졌다(그전엔 실행이 끝날 때까지 화면에 아무것도 안 나왔다).
//
// `allOld` 가 **페이지 넘김을 멈출지**를 정한다(`sort=date` 라 다음 페이지는 더 오래되기만 한다).
// 담은 행이 하나라도 있거나, **나이가 아닌 이유**(비네이버·정규화 실패·제주 아님·postdate 불량)로 빠진 항목이
// 하나라도 있으면 false 다 — 후자를 "오래됨" 으로 세면 postdate 가 깨진 항목 하나가 그 키워드의 남은 1년을 잘라먹는다.
export function tallyPage(items, keyword, now) {
  const rows = [];
  let old = 0;
  let other = 0;
  for (const item of items) {
    const row = toBlogPostRow(item, keyword, now);
    if (row) {
      rows.push(row);
      continue;
    }
    // toBlogPostRow 가 null 을 주는 이유는 셋 중 하나 — 1년 밖 / 비네이버·정규화 실패 / 제주 아님.
    // "1년 밖" 만 페이지 중단 판단에 쓰므로 postdate 만 다시 파싱해서 구분한다.
    const postedAt = parsePostdate(item.postdate);
    if (postedAt !== null && !isWithinDays(postedAt, WINDOW_DAYS, now)) old += 1;
    else other += 1;
  }
  return { rows, old, other, allOld: rows.length === 0 && other === 0 };
}

/**
 * 페이지 하나를 처리한 뒤 — 계속 넘길까(`null`), 멈출까, 멈추면 **왜**인가. 라벨은 `collect-blog.mjs` 의 `STOP_LABEL`.
 *
 * 이 판정이 순수 함수로 나와 있는 이유는 **틀린 이유를 말하면 사용자가 엉뚱한 조치를 한다**는 것뿐이다(수집 결과는 어느 쪽이든 같다).
 * 처음엔 `let stop = 'cap'` 을 초기값으로 두고 `break` 가 덮게 했는데, 그러면 **마지막 페이지에서 루프 조건으로 끝나는 경우가
 * 전부 'cap'(창이 잘렸다)으로 새어 나갔다** — 잘린 게 없는 키워드에 ⚠️ 가 붙고 "키워드를 좁혀라" 를 권했다(멀쩡한 창을 더 줄이는 조치다).
 * 새어 나간 두 모양:
 *  - 마지막 페이지가 **덜 찼다**(예: 1년 안이 950건 → p10 이 50건) → 상한이 아니라 **결과가 바닥난 것**이다. `received < display` 로 갈린다.
 *  - 마지막 페이지가 꽉 찼지만 그 안에 **1년 밖 글이 섞여 있다** → 365일 경계를 **이미 넘어 봤다**는 직접 증거다(`sort=date`).
 *    `allOld` 는 false 라 예전 코드는 못 봤다. `tally.old > 0` 으로 갈린다.
 * 남는 참 양성은 "마지막 페이지가 꽉 찼고 전부 1년 안" 하나뿐이고, 그때만 창이 진짜 잘렸다.
 */
export function stopReason({ received, display, tally, isLastPage }) {
  if (received === 0) return 'empty';
  if (tally.allOld) return 'old'; // 이 페이지가 통째로 1년 밖 — 다음 페이지는 더 오래되기만 한다
  if (received < display) return 'empty'; // 덜 찬 페이지 = 결과가 여기서 끝났다(상한에 걸린 것이 아니다)
  if (!isLastPage) return null;
  return tally.old > 0 ? 'old' : 'cap'; // 마지막 페이지: 1년 밖을 봤으면 경계에 닿은 것, 전부 1년 안이면 거기서 잘렸다
}

// url 이 같은 행이 여러 키워드에서 나오면 먼저 온(=먼저 실행한 키워드) 것이 이긴다.
export function dedupeByUrl(rows) {
  const seen = new Map();
  for (const row of rows) {
    if (!seen.has(row.url)) seen.set(row.url, row);
  }
  return [...seen.values()];
}

/*
 * 진행 로그의 문구. `collect-blog.mjs` 는 6개 키워드 × 최대 10페이지를 도는 동안 예전엔 **한 줄도 안 찍었다** —
 * 첫 실행은 1년치라 몇 분이 걸리고, 그 사이 사용자가 멈춘 것과 도는 것을 구별할 방법이 없었다.
 *
 * ⚠️ **로그에는 응답 내용을 절대 싣지 않는다**(docs/todo/05-security.md · collect-blog.mjs 의 searchBlog 주석).
 * 여기 들어가는 것은 우리가 보낸 검색어 · 페이지 번호 · **개수**뿐이다. 검색 결과의 제목·링크·블로거명은
 * 개수로 집계될 뿐 문자열로 나가지 않는다 — 그래야 로그를 붙여 공유해도 되는 물건이 된다.
 */

/** 12.4초 · 2분 3초. 초를 먼저 반올림해 "1분 60초" 가 나오지 않게 한다. */
export function formatElapsed(ms) {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${(ms / 1000).toFixed(1)}초`;
  return `${Math.floor(seconds / 60)}분 ${seconds % 60}초`;
}

/** 페이지 한 장. 들여쓰기 두 칸은 analyze·apply 의 상세 줄과 같은 규칙이다. */
export function formatPageLine({ page, start, received, tally, total }) {
  const excluded = [tally.old && `1년밖 ${tally.old}`, tally.other && `비네이버·비제주 ${tally.other}`].filter(Boolean);
  const tail = excluded.length > 0 ? ` · 제외 ${excluded.join(' · ')}` : '';
  return `  p${page}(start=${start}) 받음 ${received} · 담음 ${tally.rows.length}${tail} · 누적 ${total}`;
}

/** 마지막 한 줄. 터미널에서 이 줄만 보면 된다(analyze 의 formatSummary 와 같은 자리). */
export function formatSummary({ collected, newCount, excludedOld, excludedOther, elapsedMs }) {
  return (
    `수집 ${collected}건 (신규 ${newCount} · 기존 ${collected - newCount} · ` +
    `1년 밖 제외 ${excludedOld} · 비네이버/비제주 제외 ${excludedOther}) · ${formatElapsed(elapsedMs)}`
  );
}
