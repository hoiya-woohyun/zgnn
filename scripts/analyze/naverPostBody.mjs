// 네이버 블로그 글 하나의 본문을 텍스트로 뽑는다. 분석(03)이 부르는 순간에만 받아 쓰고 버린다 — DB 에도 파일에도
// 저장하지 않는다(docs/todo/02 의 저작권·약관 기준). 파싱은 의존성 없이 정규식으로만 한다.
//
// 왜 데스크톱 PostView.naver 인가 — 2026-09 에 curl 로 확인한 결과:
//  - `blog.naver.com/{blogId}/{logNo}` 는 2.8KB iframe 껍데기라 본문이 없다.
//  - `blog.naver.com/PostView.naver?blogId=&logNo=` 는 세 세대 에디터 모두 본문을 준다(User-Agent 없이도).
//    SmartEditor ONE(2019~) `.se-main-container` · SmartEditor 3(2016~2018) `.__se_component_area` ·
//    구 에디터 `#postViewArea`. 없는 글은 404.
//  - `m.blog.naver.com/PostView.naver` 도 본문을 주지만 구 에디터 글이 `#postViewArea` 가 아니라 `#viewTypeSelector` 로
//    오고, docs/todo/02 가 이미 데스크톱 주소를 적어 뒀다. 페이지가 45% 가벼운 것 말고는 얻는 게 없다.
//
// 컨테이너를 못 찾으면 '' 다 — 페이지 전체 텍스트를 본문인 척 넘기면 AI 가 사이드바·댓글에서 장소를 지어낸다.

/** 파싱에 넣을 원본 HTML 상한. 실제 글은 200~600KB — 2MB 를 넘는 건 정상 글이 아니다. */
export const MAX_HTML_CHARS = 2_000_000;

/** 본문이 이보다 길면 잘라서 준다. 여행기 하나가 이 길이를 넘는 일은 드물고, 넘으면 대개 사진 캡션·광고다. */
export const MAX_BODY_CHARS = 20_000;

/** 본문을 실제로 주는 주소(위 머리 주석). blogId·logNo 는 URL 인코딩된다. */
export function postViewUrl(blogId, logNo) {
  const url = new URL('https://blog.naver.com/PostView.naver');
  url.searchParams.set('blogId', blogId);
  url.searchParams.set('logNo', logNo);
  return url.toString();
}

/**
 * 본문 컨테이너 여는 태그. 순서가 곧 우선순위다 — 데스크톱 SE ONE 페이지에는 `_postViewArea{logNo}` 라는 **클래스**가
 * 같이 있어서 `postViewArea` 를 부분 문자열로 찾으면 오탐한다. 그래서 id 는 따옴표까지 붙여 정확히 맞춘다.
 * `#post-view{logNo}` 는 세 세대 모두를 감싸는 바깥 상자라 마지막 보루로만 둔다(제목 줄이 섞이지만 페이지 전체는 아니다).
 */
const CONTAINER_OPENERS = [
  /<div\b[^>]*\bclass="[^"]*\bse-main-container\b[^"]*"[^>]*>/i,
  /<div\b[^>]*\bclass="[^"]*\b__se_component_area\b[^"]*"[^>]*>/i,
  /<div\b[^>]*\bid="postViewArea"[^>]*>/i,
  /<div\b[^>]*\bid="post-view\d+"[^>]*>/i,
];

// 컨테이너를 찾기 **전에** 지운다 — 모든 페이지에 `new ImageLazyLoader(".se-main-container,.__se_component_area")` 라는
// 스크립트 줄이 있어서, 스크립트를 남겨 두면 그 문자열에 걸린다. SE3 는 본문 안에 `<!-- SE3-TEXT { -->` 주석도 넣는다.
// `.se-blind`/`.blind` 는 스크린리더 전용 라벨("Previous image"·"본문 기타 기능")이라 글 내용이 아니다 — 잎 요소만 지운다.
function stripNonContent(html) {
  return html
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style\s*>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(span|em|strong|b|i)\b[^>]*\bclass="[^"]*\b(?:se-|se_)?blind\b[^"]*"[^>]*>[^<]*<\/\1\s*>/gi, '');
}

// 여는 태그 위치부터 <div>/</div> 깊이를 세어 짝이 맞는 곳까지 자른다. 첫 </div> 에서 끊으면 SE ONE 은 첫 문단에서 끝난다.
// 끝까지 짝이 안 맞으면(잘린 HTML) 끝까지 쓴다 — 있는 본문을 버리는 것보다 낫다.
function sliceContainer(html) {
  let open = null;
  for (const re of CONTAINER_OPENERS) {
    const m = re.exec(html);
    if (m) { open = m; break; }
  }
  if (!open) return null;

  const start = open.index + open[0].length;
  const tag = /<(\/?)div\b[^>]*>/gi;
  tag.lastIndex = start;
  let depth = 1;
  let m;
  while ((m = tag.exec(html)) !== null) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) return html.slice(start, m.index);
  }
  return html.slice(start);
}

const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

// 한 번에 치환한다 — `&amp;lt;` 가 `<` 로 두 번 풀리지 않게. 모르는 이름은 그대로 둔다.
function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
  });
}

// 줄을 나누는 태그. SE ONE 은 문단마다 <p class="se-text-paragraph">, 구 에디터는 <br> 로 줄을 바꾼다 — 둘 다 개행으로.
// 블록 태그는 여닫는 쪽 모두 개행이다 — <strong>제목</strong><p>주소</p> 처럼 인라인 뒤에 바로 블록이 오면 붙어 버린다.
// 표 셀(td·th)도 한 줄씩 — 요금표의 "소형견 | 10,000원" 이 "소형견10,000원" 으로 붙지 않게.
const BLOCK_BREAK = /<br\b[^>]*\/?>|<\/?(?:p|div|li|tr|td|th|h[1-6]|blockquote|table|ul|ol|dl|dd|dt|section|article|pre)\b[^>]*>/gi;

// 태그 → 개행/제거 → 엔티티 디코드 순서다. 먼저 디코드하면 본문의 "&lt;b&gt;" 가 진짜 태그가 돼 지워진다.
export function htmlToText(fragment) {
  const text = decodeEntities(fragment.replace(BLOCK_BREAK, '\n').replace(/<[^>]+>/g, ''));
  return text
    .replace(/[\u200b\ufeff\r]/g, '') // SE ONE 은 빈 문단을 zero-width space 로 채운다
    .replace(/\u00a0/g, ' ')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

/** PostView HTML → 본문 컨테이너 안쪽 HTML(스크립트·주석·스크린리더 라벨을 뺀). 컨테이너가 없으면 null. 사진 고르기(postImages.mjs)도 같은 범위를 본다. */
export function postContainerHtml(html) {
  return sliceContainer(stripNonContent(html ?? ''));
}

/** PostView HTML → 본문 텍스트. 컨테이너가 없으면 ''. MAX_BODY_CHARS 로 잘린다. */
export function extractPostText(html) {
  const fragment = postContainerHtml(html);
  if (fragment === null) return '';
  return htmlToText(fragment).slice(0, MAX_BODY_CHARS);
}

/**
 * 글 하나를 받아 본문 텍스트를 돌려준다. 비 2xx 면 throw — 메시지에는 status 와 blogId/logNo 만 넣는다.
 * 응답 본문·헤더는 로그에 남기지 않는다(docs/todo/05). fetchImpl 은 테스트 주입용.
 */
/** 본문 요청 상한. undici 기본(300초)은 글 하나가 잡 시간을 다 먹을 수 있다. 넘기면 status 없는 에러 → 재시도 분류. */
export const FETCH_TIMEOUT_MS = 15_000;

export async function fetchPostText({ blogId, logNo }, fetchImpl = fetch) {
  const res = await fetchImpl(postViewUrl(blogId, logNo), { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  // status 를 에러에 싣고, 404·410(삭제된 글)만 permanent 로 표시한다 — 호출자가 "분석 불가" 로 닫는다. 403 은 봇 차단일 수 있고
  // 5xx·네트워크는 잠깐일 수 있으니 permanent 가 아니다(다음 실행에 재시도). 4xx 전부를 닫으면 차단 한 번에 백로그가 통째로 닫힌다(리뷰 지적).
  if (!res.ok) {
    throw Object.assign(new Error(`네이버 블로그 본문 요청 실패: status=${res.status} blogId=${blogId} logNo=${logNo}`), {
      status: res.status,
      permanent: res.status === 404 || res.status === 410,
    });
  }
  const html = await res.text();
  // 파싱 정규식은 닫히지 않은 태그에 최악 O(n²) 라 원본 크기부터 자른다 — 본문 상한(MAX_BODY_CHARS)은 파싱 **뒤**에만 걸리기 때문이다.
  return extractPostText(html.length > MAX_HTML_CHARS ? html.slice(0, MAX_HTML_CHARS) : html);
}
