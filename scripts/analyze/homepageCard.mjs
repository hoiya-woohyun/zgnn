// 업체 **공식 홈페이지**의 링크 카드 재료(주소 · 사이트 이름 · 대표 사진 URL)를 읽는다. 분석(03)이 네이버 지역 검색의
// `link`(naverLocal 의 naverLink)를 받았을 때만 부른다. 사진은 **URL 만** 남긴다 — 내려받지 않는다(ADR-002 v2).
//
// 왜 `og:image` 하나뿐인가 — 업체가 **공유 미리보기용으로 내놓은** 사진이라, 링크 카드(사진 + 출처 + 홈페이지로 가는 링크)로
// 보여 주는 것이 그 용도 그대로다. 본문 `<img>` 를 긁어 여러 장을 모으면 그 범위를 벗어난다(ADR-002 v2 의 저작권 검토).
//
// 받지 않는 링크: 네이버(플레이스·블로그 — 약관·남의 사진) · 인스타그램·페이스북(로그인 벽, 이미지 주소가 서명돼 곧 만료) ·
// 예약 플랫폼(업체가 아니라 플랫폼의 페이지다). 그런 링크는 카드 자체를 만들지 않는다 — 홈페이지라고 부를 수 없어서다.
//
// 원칙은 naverLocal 과 같다: "지어내지 않는다". 못 읽으면 null 이고, 사진이 없으면 사진 없는 카드다.
// 실패는 후보를 막지 않는다 — 부르는 쪽이 로그 한 줄만 남기고 넘어간다. 응답 본문은 로그에 남기지 않는다.

/** 홈페이지가 아닌 곳. 호스트가 이것이거나 이것의 하위 도메인이면 카드를 만들지 않는다. */
export const NOT_HOMEPAGE_HOSTS = [
  'naver.com', 'naver.me',
  'instagram.com', 'facebook.com', 'fb.com', 'fb.me',
  'kakao.com', 'daum.net',
  'airbnb.co.kr', 'airbnb.com', 'booking.com', 'agoda.com', 'yanolja.com', 'goodchoice.kr', 'yeogi.com',
  'tripadvisor.co.kr', 'tripadvisor.com', 'catchtable.co.kr', 'bookinghub.co.kr', 'tabling.co.kr', 'onda.me',
  'linktr.ee', 'youtube.com',
  'ok114.co.kr', // 전화번호부 사이트 — 업체 페이지처럼 보이지만 디렉터리의 한 줄이다
];

/** 읽을 HTML 상한. 메타 태그는 `<head>` 에 있으니 앞부분이면 충분하다 — 큰 페이지를 끝까지 받지 않는다. */
export const MAX_HTML_BYTES = 512 * 1024;

const isHostIn = (host, list) => list.some((h) => host === h || host.endsWith(`.${h}`));

/**
 * 경로 마디나 쿼리 값이 숫자뿐인가 — 플랫폼은 업체를 **번호로** 가리키고(`/81278` · `?restaurant_idx=11235`) 업체 자기 사이트는 그러지 않는다.
 * 위 목록은 아는 호스트만 막는다: 첫 114건에서 목록 밖 플랫폼이 다섯 번 나왔고 넷이 이 꼴이었다(전화번호부 · 예약 · 대기 접수, 2026-10-04).
 */
const NUMERIC_ID = /^\d{3,}$/;
const hasNumericId = (url) =>
  url.pathname.split('/').some((part) => NUMERIC_ID.test(part)) || [...url.searchParams.values()].some((value) => NUMERIC_ID.test(value));

/**
 * 네이버 지역 검색의 link → 홈페이지 주소. http(s) 이고 위 목록 밖이고 번호로 된 주소가 아닐 때만. 아니면 null.
 * @param {string | null | undefined} link
 * @returns {string | null}
 */
export function homepageUrlOf(link) {
  const text = (link ?? '').trim();
  if (!text) return null;
  let url;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (isHostIn(url.hostname.toLowerCase().replace(/^www\./, ''), NOT_HOMEPAGE_HOSTS)) return null;
  if (hasNumericId(url)) return null;
  return url.toString();
}

const decodeEntities = (s) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();

/** `<meta property|name="key" content="…">` 의 content. 속성 순서가 뒤집힌 꼴도 받는다. 없으면 null. */
function metaContent(html, key) {
  const k = key.replace(/[.:]/g, (c) => `\\${c}`);
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    if (!new RegExp(`\\b(?:property|name)\\s*=\\s*["']${k}["']`, 'i').test(tag)) continue;
    const m = tag.match(/\bcontent\s*=\s*"([^"]*)"|\bcontent\s*=\s*'([^']*)'/i);
    const value = m ? decodeEntities(m[1] ?? m[2] ?? '') : '';
    if (value) return value;
  }
  return null;
}

/**
 * 사진 URL 로 쓸 수 있나 — **https 만.** 사이트는 https 라 http 사진은 섞인 콘텐츠로 막히거나 올려 받기에 실패한다.
 * 상대 주소는 페이지 주소로 푼다. 파비콘·SVG 는 대표 사진이 아니다.
 */
function usableImage(raw, pageUrl) {
  if (!raw) return null;
  let url;
  try {
    url = new URL(raw, pageUrl);
  } catch {
    return null;
  }
  if (url.protocol === 'http:') url.protocol = 'https:'; // 대부분 같은 주소로 https 도 준다. 안 주면 화면이 사진을 접는다.
  if (url.protocol !== 'https:') return null;
  if (/\.(ico|svg)$/i.test(url.pathname)) return null;
  return url.toString();
}

/**
 * HTML → 카드 재료. 순수 함수다.
 * @param {string} html
 * @param {string} pageUrl  리다이렉트 뒤 최종 주소(상대 경로를 풀 기준)
 * @returns {{ url: string, siteName: string | null, image: string | null }}
 */
export function parseHomepageCard(html, pageUrl) {
  const head = html.slice(0, MAX_HTML_BYTES);
  const image =
    usableImage(metaContent(head, 'og:image:secure_url'), pageUrl) ??
    usableImage(metaContent(head, 'og:image'), pageUrl) ??
    usableImage(metaContent(head, 'twitter:image'), pageUrl);
  const title = head.match(/<title[^>]*>([^<]*)<\/title>/i);
  const siteName = metaContent(head, 'og:site_name') ?? (title ? decodeEntities(title[1]) || null : null);
  return { url: pageUrl, siteName: siteName ? siteName.slice(0, 80) : null, image };
}

/**
 * 바이트 → 문자열. **제주 작은 업체 사이트는 아직 EUC-KR 이 흔하다** — utf-8 로 풀면 사이트 이름이 깨진 채 카드에 박힌다.
 * 헤더의 charset → 문서 앞머리의 `<meta charset>` → utf-8 순. 모르는 이름이면 utf-8 로 물러선다.
 */
export function decodeHtml(bytes, contentType = '') {
  const fromHeader = contentType.match(/charset=["']?([\w-]+)/i)?.[1];
  const sniff = new TextDecoder('latin1').decode(bytes.subarray(0, 2048));
  const fromMeta = sniff.match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1];
  for (const label of [fromHeader, fromMeta, 'utf-8']) {
    if (!label) continue;
    try {
      return new TextDecoder(label).decode(bytes);
    } catch {
      // 모르는 charset — 다음 후보로
    }
  }
  return '';
}

/** 응답 본문을 상한까지만 읽는다. content-length 를 믿지 않는다(없거나 틀린 서버가 흔하다). */
async function readCapped(res) {
  if (!res.body?.getReader) return new Uint8Array(await res.arrayBuffer()).subarray(0, MAX_HTML_BYTES);
  const reader = res.body.getReader();
  const chunks = [];
  let size = 0;
  while (size < MAX_HTML_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.byteLength;
  }
  await reader.cancel().catch(() => {});
  return new Uint8Array(Buffer.concat(chunks)).subarray(0, MAX_HTML_BYTES);
}

/**
 * 홈페이지 카드. 홈페이지가 아니면(위 목록) 부르지 않고 null. 받지 못하면 throw — 부르는 쪽이 이유 한 줄만 남기고 넘어간다.
 * 리다이렉트 끝이 홈페이지 목록 밖으로 나가면(인스타 등으로 튕김) null 이다.
 * @param {string | null | undefined} link  pickNaverPlace 의 naverLink
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<{ url: string, siteName: string | null, image: string | null } | null>}
 */
export async function fetchHomepageCard(link, fetchImpl = fetch) {
  const start = homepageUrlOf(link);
  if (!start) return null;
  const res = await fetchImpl(start, {
    redirect: 'follow',
    headers: { Accept: 'text/html,application/xhtml+xml', 'User-Agent': 'Mozilla/5.0 (compatible; zgnn-link-preview)' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`홈페이지 응답 status=${res.status}`);
  const finalUrl = homepageUrlOf(res.url || start);
  if (!finalUrl) return null;
  const contentType = res.headers.get('content-type') ?? 'text/html';
  if (!/html/i.test(contentType)) return null;
  return parseHomepageCard(decodeHtml(await readCapped(res), contentType), finalUrl);
}
