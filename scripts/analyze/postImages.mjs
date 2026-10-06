// 블로그 글의 사진 몇 장을 골라 받아 온다 — **평가 실험 전용**(`pnpm data:eval extract --images`, docs/features/extraction-eval.md 「사진도 읽히는 실험」).
// 운영 분석(analyze-candidates.mjs)은 이 파일을 부르지 않는다.
//
// 왜 있나 — 시드 21곳을 채점해 보니 사람이 적은 조건(무게 상한·마릿수·요금)의 상당수가 글 본문에 없었다(근거없음).
// 예약 페이지 캡처·안내문 사진 속 글자일 수 있어서, 사진 몇 장을 같이 보여 주면 그 칸이 살아나는지 잰다.
//
// ADR-002 와의 관계 — 사진은 **분석하는 순간에만 메모리에서** 읽고 버린다. 파일로도 DB 로도 남기지 않고, 화면에도 안 쓴다.
// 캐시(data/raw/eval/extract/)에는 추출 JSON 과 고른 사진의 **URL** 만 남는다.
//
// 고르는 법(selectPostImages) — 글 하나에 사진이 13~53장이라 전부 보내면 토큰이 감당이 안 된다. 상한(기본 8장) 안에서:
//  1. 바로 앞·뒤 글 문단에 조건 낱말(요금·추가·kg·마리·이용·안내·주의·규정·제한·무게 …)이 있는 사진 — 캡처를 붙이며 "이용 안내예요" 라고 쓰는 경우.
//     '강아지·애견·반려' 는 넣지 않는다 — 반려견 글이라 거의 모든 문단에 있어 결국 글 순서와 같아진다.
//  2. 비율이 카메라 비율(1:1 · 4:3 · 3:2 · 16:9 와 그 세로)이 아닌 사진 — 휴대폰 화면 캡처(1170x2532)·잘라 낸 안내문이 그렇다.
//  3. 남는 자리는 글 순서대로 채운다.
//  고른 사진은 글 순서로 되돌려 보낸다. 스티커·gif·작은 그림(긴 변 200px 미만)은 후보에서 뺀다.
//  크기는 네이버 썸네일 변형(`?type=w773`, 긴 쪽 773px)으로 받아 토큰을 줄인다 — 캡처 글자가 읽히는 선.
import { htmlToText, postContainerHtml } from './naverPostBody.mjs';

export const DEFAULT_MAX_IMAGES = 8;
/** 네이버 사진 서버의 폭 변형. 원본(최대 4032px)을 받으면 장당 바이트·토큰이 몇 배다. */
export const IMAGE_SIZE_TYPE = 'w773';
/** 한 장 상한. 넘으면 그 사진만 건너뛴다. */
export const MAX_IMAGE_BYTES = 1_500_000;
export const IMAGE_FETCH_TIMEOUT_MS = 15_000;
/** Claude 가 받는 이미지 형식. gif 는 고르는 단계에서 이미 뺀다. */
const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

const CONDITION_WORDS = /요금|추가|kg|㎏|키로|킬로|마리|이용|안내|주의|규정|제한|불가|무게|몸무게|입실|예약/i;
const CAMERA_RATIOS = [1, 4 / 3, 3 / 4, 3 / 2, 2 / 3, 16 / 9, 9 / 16];
const RATIO_TOLERANCE = 0.015; // 900x1638(휴대폰 캡처) 이 9:16 에서 2.3% — 3% 면 카메라로 읽힌다
const MIN_LONG_SIDE = 200;

const attr = (tag, name) => new RegExp(`\\b${name}="([^"]*)"`, 'i').exec(tag)?.[1] ?? null;
const decodeAmp = (s) => s.replace(/&amp;/g, '&');

/** 네이버 사진 서버(pstatic) 주소만 본문 사진이다 — 프로필·광고·외부 그림은 아니다. */
function isPostImageUrl(url) {
  try {
    const u = new URL(url);
    return /^(postfiles|blogfiles|mblogthumb-phinf)\.pstatic\.net$/.test(u.hostname);
  } catch {
    return false;
  }
}

/** 원본 주소의 쿼리(`?type=w80_blur` 등)를 버리고 폭 변형을 붙인다. */
export function resizedImageUrl(url, type = IMAGE_SIZE_TYPE) {
  const u = new URL(url);
  u.search = `?type=${type}`;
  return u.toString();
}

/** 너비·높이가 카메라 비율에서 벗어났나 — 화면 캡처·잘라 낸 안내문의 표시. 크기를 모르면 false. */
export function looksLikeScreenshot(width, height) {
  if (!(width > 0 && height > 0)) return false;
  const r = width / height;
  return !CAMERA_RATIOS.some((c) => Math.abs(r - c) / c <= RATIO_TOLERANCE);
}

/** `<img>` 태그 하나 → 사진 후보. 진짜 주소는 data-lazy-src(src 는 흐린 자리표시 `w80_blur`)다. */
function imageFromTag(tag) {
  const raw = attr(tag, 'data-lazy-src') ?? attr(tag, 'src');
  if (!raw) return null;
  const url = decodeAmp(raw);
  if (!isPostImageUrl(url)) return null;
  if (/\.gif(?:$|\?)/i.test(new URL(url).pathname) || /\bse-sticker-image\b/.test(tag)) return null;
  const width = Number(attr(tag, 'data-width') ?? attr(tag, 'width')) || null;
  const height = Number(attr(tag, 'data-height') ?? attr(tag, 'height')) || null;
  if (width && height && Math.max(width, height) < MIN_LONG_SIDE) return null;
  return { url: resizedImageUrl(url), originalUrl: url, width, height };
}

const imagesIn = (fragment) => [...fragment.matchAll(/<img\b[^>]*>/gi)].map((m) => imageFromTag(m[0])).filter(Boolean);

/**
 * PostView HTML → 본문 사진 후보(글 순서). 각 후보에 앞·뒤 글 문단(가장 가까운 것)을 붙인다.
 * SmartEditor ONE 은 `se-component` 단위로 나눠 문단과 사진의 이웃을 알 수 있고, 옛 에디터는 이웃 없이 순서만 준다.
 * @returns {{ url: string, originalUrl: string, width: number|null, height: number|null, index: number, before: string, after: string }[]}
 */
export function postImageCandidates(html) {
  const container = postContainerHtml(html);
  if (container === null) return [];
  const parts = container.split(/(?=<div\b[^>]*\bclass="se-component\s)/i);
  if (parts.length <= 1) return imagesIn(container).map((img, index) => ({ ...img, index, before: '', after: '' }));

  const blocks = parts.map((p) => {
    const kind = /\bclass="se-component\s+se-(\w+)/i.exec(p)?.[1] ?? '';
    const isText = kind === 'text' || kind === 'quotation' || kind === 'table';
    return { kind, text: isText ? htmlToText(p) : '', images: isText || kind === 'sticker' ? [] : imagesIn(p) };
  });
  const out = [];
  blocks.forEach((b, i) => {
    if (b.images.length === 0) return;
    const before = blocks.slice(0, i).reverse().find((x) => x.text)?.text ?? '';
    const after = blocks.slice(i + 1).find((x) => x.text)?.text ?? '';
    for (const img of b.images) out.push({ ...img, index: out.length, before, after });
  });
  return out;
}

/**
 * 후보 → 보낼 사진(글 순서). reason 은 왜 골랐나 — 'keyword'(이웃 문단에 조건 낱말) · 'screenshot'(카메라 비율 아님) · 'fill'(순서로 채움).
 * 결과가 0건 회수였을 때 "휴리스틱이 놓쳤나 · 사진에 없었나" 를 가르려고 캐시에 같이 적는다.
 */
export function selectPostImages(candidates, max = DEFAULT_MAX_IMAGES) {
  const scored = candidates.map((c) => {
    const keyword = CONDITION_WORDS.test(`${c.before}\n${c.after}`);
    const screenshot = looksLikeScreenshot(c.width, c.height);
    return { ...c, score: (keyword ? 2 : 0) + (screenshot ? 1 : 0), reason: keyword ? 'keyword' : screenshot ? 'screenshot' : 'fill' };
  });
  return [...scored]
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, Math.max(0, max))
    .sort((a, b) => a.index - b.index)
    .map(({ url, originalUrl, width, height, index, reason }) => ({ url, originalUrl, width, height, index, reason }));
}

/**
 * 고른 사진을 메모리로 받는다(파일로 쓰지 않는다). 형식이 이미지가 아니거나 상한을 넘거나 실패하면 그 사진만 건너뛴다 — 글은 실패시키지 않는다.
 * 폭 변형 주소가 4xx 면 원본 주소로 한 번 더 받는다.
 * @param {{ url: string, originalUrl?: string }[]} picks
 * @returns {Promise<{ images: { mediaType: string, data: string, bytes: number, url: string }[], skipped: { url: string, why: string }[] }>}
 */
export async function downloadImages(picks, fetchImpl = fetch, { maxBytes = MAX_IMAGE_BYTES, timeoutMs = IMAGE_FETCH_TIMEOUT_MS } = {}) {
  const images = [];
  const skipped = [];
  for (const pick of picks) {
    const tries = [pick.url, pick.originalUrl].filter((u, i, a) => u && a.indexOf(u) === i);
    let why = 'no_url';
    for (const url of tries) {
      try {
        const res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
        if (!res.ok) {
          why = `status_${res.status}`;
          continue;
        }
        const mediaType = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
        if (!ACCEPTED_TYPES.has(mediaType)) {
          why = `type_${mediaType || 'none'}`;
          break;
        }
        const declared = Number(res.headers.get('content-length'));
        if (declared > maxBytes) {
          why = 'too_large';
          break;
        }
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > maxBytes) {
          why = 'too_large';
          break;
        }
        images.push({ mediaType, data: buf.toString('base64'), bytes: buf.length, url });
        why = null;
        break;
      } catch (e) {
        why = e?.name === 'TimeoutError' ? 'timeout' : 'fetch_error';
      }
    }
    if (why) skipped.push({ url: pick.url, why });
  }
  return { images, skipped };
}
