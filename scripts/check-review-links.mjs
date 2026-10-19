// `pnpm data links` — 게시된 장소의 후기 글(review_url)이 아직 읽히는지 점검해 `review_link_checks` 에 남긴다(14 W261019.4).
// 사람이 터미널에서 돌린다(네이버를 요청당 300ms 간격으로 읽는다) — 서버 워커(PIPELINE_STEPS)에 넣지 않는다. 세션이 필요하다(`pnpm data login`).
//
// 결과를 `places` 가 아닌 새 표에 적는 이유는 마이그레이션 머리 주석(20261019120000): places 트리거가 모든 update 에 재빌드를 건다.
// 판정은 순수 함수 `classifyReviewPage` — 삭제·비공개의 **긍정 증거**가 있을 때만 `gone` 이다. 차단·점검·네트워크 실패는 `unknown`.
//
// 2026-10-19 실측(게시 122곳, 전부 blog.naver.com): 읽힘 118, 못 읽음 4 — 삭제(200 + alert 껍데기 357B) · 삭제(404 + 큰 페이지) · 비공개(200 + alert).
// 셋 다 본문 컨테이너가 없다. 살아 있는 글에도 무관한 alert(…)(구 에디터 안내 등)가 있어서 **컨테이너를 먼저** 본다.
// pipeline_runs.script 의 CHECK 에 이 이름이 없어 runLog 는 쓰지 않는다(rewrite-published 도 같다). 단계 스크립트라 process.exit 를 부르지 않는다.
import { extractPostText, FETCH_TIMEOUT_MS, MAX_HTML_CHARS, postViewUrl } from './analyze/naverPostBody.mjs';
import { normalizeBlogUrl } from './collect/naverBlog.mjs';
import { isTableMissing } from './lib/collectRequests.mjs';
import { isDirectRun } from './lib/isDirectRun.mjs';
import { createSupabase } from './lib/supabaseClient.mjs';

/** 마이그레이션 `state in (...)` 와 같은 목록(테스트가 대 본다). */
export const REVIEW_LINK_STATES = ['alive', 'gone', 'unknown'];

export const REQUEST_DELAY_MS = 300;
const DETAIL_MAX = 200;
const USAGE = '사용법: pnpm data links [--dry-run] [--limit N]';

/** 네이버가 없는 글·비공개 글에 주는 껍데기의 안내문 — `var msg = '…'` 또는 `alert("…")`. 없으면 null. */
export function naverRedirectMessage(html) {
  const text = html ?? '';
  const msg = /var\s+msg\s*=\s*(['"])(.*?)\1/.exec(text)?.[2]?.trim();
  if (msg) return msg;
  const alertText = /\balert\(\s*(['"])(.*?)\1\s*\)/.exec(text)?.[2]?.trim();
  return alertText || null;
}

const trimDetail = (detail) => (detail == null ? null : detail.slice(0, DETAIL_MAX));

/**
 * 응답 하나 → { state, detail }. 순서가 뜻이다: 404·410 → 본문 컨테이너 → 안내문. 컨테이너가 있으면 무관한 alert 는 보지 않는다.
 * `gone` 은 긍정 증거(404·410 · 삭제/비공개 안내문)만 — 그 밖의 읽기 실패는 `unknown` (운영자가 멀쩡한 출처를 갈아 끼우지 않게).
 */
export function classifyReviewPage({ status, html }) {
  const message = naverRedirectMessage(html);
  if (status === 404 || status === 410) return { state: 'gone', detail: trimDetail(message ?? `HTTP ${status}`) };
  const ok = status >= 200 && status < 300;
  if (ok && extractPostText((html ?? '').slice(0, MAX_HTML_CHARS)) !== '') return { state: 'alive', detail: null };
  if (message && /삭제|비공개|존재하지/.test(message)) return { state: 'gone', detail: trimDetail(message) };
  return { state: 'unknown', detail: trimDetail(message ?? (ok ? '본문을 찾지 못했어요' : `HTTP ${status}`)) };
}

/** 후기 주소 하나를 받아 판정한다. `fetchPostText` 는 비 2xx 에 던져서 status·원문이 필요한 여기엔 못 쓴다. */
export async function checkReviewUrl(url, fetchImpl = fetch) {
  const blog = normalizeBlogUrl(url);
  if (!blog) return { state: 'unknown', detail: '네이버 블로그 주소가 아니에요', status: null };
  let res;
  let html;
  try {
    res = await fetchImpl(postViewUrl(blog.blogId, blog.logNo), { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    html = await res.text();
  } catch (e) {
    return { state: 'unknown', detail: trimDetail(`받지 못했어요(${e.message})`), status: null };
  }
  return { ...classifyReviewPage({ status: res.status, html }), status: res.status };
}

function parseArgs(argv) {
  const opts = { dryRun: false, limit: Infinity };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dry-run') opts.dryRun = true;
    else if (arg === '--limit') {
      const n = Number(argv[++i]);
      if (!Number.isInteger(n) || n < 1) return { error: `--limit 은 1 이상의 정수: ${argv[i]}` };
      opts.limit = n;
    } else return { error: `알 수 없는 인자: ${arg}` };
  }
  return opts;
}

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function main(argv = process.argv.slice(2), deps = {}) {
  const opts = parseArgs(argv);
  if (opts.error) {
    console.error(`${opts.error}\n${USAGE}`);
    return 2;
  }
  const { fetch: fetchImpl = fetch, sleep = defaultSleep, log = console.log } = deps;
  const supabase = deps.supabase ?? createSupabase({ readOnly: opts.dryRun });

  if (!opts.dryRun) {
    const probe = await supabase.from('review_link_checks').select('place_id').limit(1);
    if (isTableMissing(probe.error)) {
      console.error('review_link_checks 표가 아직 없어요 — 마이그레이션 20261019120000 을 먼저 적용하세요(`supabase db push`).');
      return 1;
    }
    if (probe.error) {
      console.error(`review_link_checks 조회 실패: ${probe.error.message}`);
      return 1;
    }
  }

  // 운영자 세션은 모든 상태의 행을 보므로 eq('status', 'published') 가 필요하다.
  const { data, error } = await supabase.from('places').select('id, name, review_url').eq('status', 'published').order('id');
  if (error) {
    console.error(`places 조회 실패: ${error.message}`);
    return 1;
  }
  const targets = (data ?? []).filter((row) => row.review_url?.trim()).slice(0, opts.limit);
  log(`대상 ${targets.length}곳(게시 · 후기 주소 있음)${opts.dryRun ? ' — dry-run: 쓰지 않는다' : ''}`);

  const rows = [];
  const tally = { alive: 0, gone: 0, unknown: 0 };
  let rateLimited = false;
  for (const [i, place] of targets.entries()) {
    if (i > 0) await sleep(REQUEST_DELAY_MS);
    const url = place.review_url.trim();
    const result = await checkReviewUrl(url, fetchImpl);
    if (result.status === 429) {
      rateLimited = true;
      log('네이버가 429 로 막았어요 — 여기까지만 남기고 멈춘다(잠시 뒤 다시)');
      break;
    }
    tally[result.state] += 1;
    if (result.state === 'gone') log(`✗ ${place.name} — ${result.detail}`);
    else if (result.state === 'unknown') log(`? ${place.name} — ${result.detail}`);
    rows.push({ place_id: place.id, url, state: result.state, detail: result.detail, checked_at: new Date().toISOString() });
  }
  log(`살아 있음 ${tally.alive} · 못 읽음 ${tally.gone} · 모름 ${tally.unknown}`);

  if (!opts.dryRun && rows.length) {
    const { error: writeError } = await supabase.from('review_link_checks').upsert(rows, { onConflict: 'place_id' });
    if (writeError) {
      console.error(`review_link_checks 쓰기 실패: ${writeError.message}`);
      return 1;
    }
    log(`${rows.length}곳을 review_link_checks 에 남겼어요`);
  }
  return rateLimited ? 2 : 0;
}

if (isDirectRun(import.meta.url)) {
  process.exitCode = await main();
}
