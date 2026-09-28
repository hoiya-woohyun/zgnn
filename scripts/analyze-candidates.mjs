// blog_posts 의 미분석 글을 Claude 로 분석해 candidates 를 만든다(`pnpm data:analyze`). docs/todo/03-analyze-and-review.md 가 정본.
// 글 하나의 흐름: 본문 받기(naverPostBody) → 장소 추출(extractPlaces) → 좌표·주소 보강(naverLocal, 키 있을 때만) →
// 기존 장소와 대조(matchPlace) → candidates insert → blog_posts.analyzed_at. 판별·조립 규칙은 scripts/analyze/analyzeCandidates.mjs
// 의 순수 함수에 있고 여기는 I/O 와 순서뿐이다.
//
// 왜 이렇게 생겼나 —
//  - 본문은 그 자리에서만 읽고 버린다. DB 에도 로그에도 남기지 않는다(docs/todo/02 의 저작권·약관 기준). evidence(인용문)도 본문이라
//    로그에 찍지 않는다 — 후보 이름·종류·구간·confidence·이유만.
//  - 기존 장소는 archived 만 빼고 **draft 도 포함**해 읽는다. 지난 실행이 draft 로 넣은 가게를 이번 실행이 또 신규로 만들면
//    같은 가게가 두 번 뜬다. published 만 보는 pull-db.mjs 와 다른 점이다.
//  - 자동 병합(auto)은 바로 approved 로 넣는다 — 병합은 빈 칸만 채우므로(applyApproved.mjs) 틀려도 사람이 쓴 값이 덮이지 않는다.
//    03 의 THRESHOLD 주석이 말하는 "위험이 작다" 가 이것이다.
//  - 글 하나가 실패하면 그 글만 건너뛴다. 다시 받아도 같을 실패(본문 404/410 · 본문 컨테이너 없음 · blog_id 없음 · 모델이 스키마 재시도를
//    소진)는 analyzed_at 을 찍어 **닫는다** — 안 찍으면 매 실행 --limit 창을 잠식하며 영원히 재시도한다. 잠깐의 실패(403 차단 · 5xx ·
//    네트워크 · 한도 · 타임아웃 · DB 쓰기 실패)는 analyzed_at 을 비워 둬 다음 실행이 다시 시도한다. 글 단위 실패는 exit code 를 올리지 않는다.
//    단 닫기는 **루프 끝에 몰아서, 이 실행에서 성공한 글이 1건이라도 있을 때만** 쓴다 — 전부 "분석 불가" 면 글이 아니라 파이프라인이
//    고장 난 것(에디터 구조 변경 · 차단 페이지가 200 으로 옴)이라 아무것도 닫지 않고 exit 1(리뷰 지적). 시도한 글 중 성공이 0 이면 exit 1.
//  - 같은 글의 후보는 insert 한 번에 넣는다(PostgREST 의 한 요청 = 한 문장이라 원자적). insert 와 analyzed_at 사이에서 죽으면
//    다음 실행이 그 글의 후보를 한 번 더 만든다 — 창은 작고, Studio 에서 보인다.
//  - Claude 는 API SDK 가 아니라 `claude -p`(구독, 로컬 `claude` 로그인) 로 부른다 — extractPlaces.mjs 머리 주석. 인증 실패·CLI 없음 같은
//    fatal 은 나머지 글도 전부 같은 이유로 실패하므로 루프를 끊고 exit 1. **Claude 의** 한도(429·session limit)는 글 단위 건너뜀 → 다음 실행.
//  - 단 **네이버 검색의 429 는 fatal 이다**(Claude 의 429 와 다르다). 검색 쿼터를 `data:collect` 와 나눠 쓰므로 한 번 걸리면 남은 건도
//    같은 결과이고, 그대로 진행하면 전부 좌표 없이 대조돼 동명 가게가 ask 대신 auto 로 올라간다 — 401/403 을 세우는 이유와 같다.
//  - **두 번째 축(주소 → 좌표, naverGeocode.mjs)의 401/403/429 는 fatal 이 아니다.** 이름 축과 정반대인데 이유가 있다:
//    이 축은 이름 축이 **이미 좌표를 못 붙인** 후보에만 붙으므로, 죽어도 결과가 "오늘까지의 동작" 으로 돌아갈 뿐 그 아래로 내려가지 않는다
//    (`matchPlace` 는 값 없는 신호를 감점 없이 건너뛴다). 세우면 **더하기만 하는 기능이 잘 돌던 파이프라인을 죽이는 새 통로**가 된다.
//    대신 그 실행 동안 축을 **내리고**(geocodeAxisOff) 한 번만 크게 찍는다 — 남은 건마다 같은 실패를 반복해 쿼터를 더 태우지 않으려고.
//  - 재시도는 CLI 에 맡긴다. 여기서 한 번 더 돌면 실패 한 건에 호출이 배가 된다.
//  - 같은 실행 안에서 같은 이름의 신규 후보가 두 번 나와도 둘 다 넣는다(두 번째가 첫 번째를 가리키게 하지 않는다). 로그에만
//    남기고 사람이 Studio 에서 본다 — 단순하게.
//  - `--dry-run` 은 DB 에 쓰지 않는다(analyzed_at 도). Claude 는 부른다 — 토큰은 쓰인다. 무엇이 후보가 되는지 보는 용도.
//  - 로그에 시크릿·응답 본문·헤더·본문 텍스트를 남기지 않는다(docs/todo/05). 글 URL·제목, 후보 요약 한 줄, error.message 만.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  exclusionReason,
  formatCandidateLine,
  formatSummary,
  parseArgs,
  pickPostsForRun,
  resolveRegionRaw,
  tierOf,
  toCandidateRow,
  toMatchCandidate,
  toPostAnalysis,
} from './analyze/analyzeCandidates.mjs';
import { createUsageMeter, extractPlaces, isFatal, isRetryable, MODEL, PROMPT_VERSION, runClaudeCli } from './analyze/extractPlaces.mjs';
import { formatGeocodeSummary, geocodeAddress, newGeocodeReasons, pickGeocoded, shouldGeocode } from './analyze/naverGeocode.mjs';
import { newPickReasons, pickNaverPlace, searchNaverPlace } from './analyze/naverLocal.mjs';
import { matchPlace, normalizeName, townOf } from './analyze/matchPlace.mjs';
import { fetchPostText } from './analyze/naverPostBody.mjs';
import { fromPlaceRow } from './lib/placeFields.mjs';
import { createSupabase } from './lib/supabaseClient.mjs';

let args;
try {
  args = parseArgs(process.argv.slice(2));
} catch (e) {
  console.error(`${e.message} — 사용법: pnpm data:analyze [--limit N] [--max-per-blog N] [--dry-run] [--dump[=경로]]`);
  process.exit(1);
}
const { limit, dryRun, dump, maxPerBlog } = args;
console.log(dryRun ? '모드: dry-run — DB 에 쓰지 않는다(Claude 는 부른다)' : '모드: 분석 — candidates · blog_posts.analyzed_at 에 쓴다');

// 좌표 보강은 **02(수집)과 같은 네이버 키**를 쓴다 — 키를 하나 더 발급·관리하지 않는다(ADR-008 v4).
// env 에 둘 다 있을 때만 켠다. 여기서는 숨김 입력을 받지 않는다: 분석은 글마다 몇 분씩 도는 일이라
// 중간에 프롬프트가 뜨면 안 되고, Claude 가 --dry-run 으로 돌리는 경로이기도 해서다(docs/todo/03).
// env 도 앞뒤 공백을 턴다 — 이쪽은 숨김 입력이 없어 `export NAVER_CLIENT_ID=' xxx '` 한 줄이 그대로 401 이 되고,
// 분석은 글마다 몇 분씩 도는 일이라 **중간에** 터진다(수집처럼 첫 요청에서 바로 알려 주지 않는다).
const trimKey = (v) => (typeof v === 'string' ? v.trim() : v);
const naverClientId = trimKey(process.env.NAVER_CLIENT_ID);
const naverClientSecret = trimKey(process.env.NAVER_CLIENT_SECRET);
const naverKeys = naverClientId && naverClientSecret ? { clientId: naverClientId, clientSecret: naverClientSecret } : null;
// Claude 인증은 env 로 검사하지 않는다 — 이 머신에 로그인된 `claude`(키체인)를 CLI 가 스스로 읽는다. 토큰 env 는 없다(ADR-016).
// 안 돼 있으면 첫 글에서 ClaudeCliError(auth, fatal) 가 나와 루프가 끊긴다.
// 좌표 보강은 선택이다 — 키가 없으면 후보는 좌표·주소 없이 들어가고, matchPlace 는 이름·종류만으로 대조한다(감점 없음).
if (!naverKeys) console.log('NAVER_CLIENT_ID · NAVER_CLIENT_SECRET 없음 — 좌표·주소 보강을 건너뛴다(후보는 이름·종류로만 대조된다)');
// 두 번째 축(주소 → 좌표)의 키는 **검색 키가 아니다** — NCP 콘솔의 Maps Application 쪽이고 헤더 이름만 같다(lib/naverMapsApi.mjs 의 표).
// 검색 키를 여기 넣으면 그냥 401 이라, env 이름을 갈라 두는 것이 그 혼동의 유일한 방어다(BUG-006 이 같은 함정이었다).
const mapClientId = trimKey(process.env.NAVER_MAP_CLIENT_ID);
const mapClientSecret = trimKey(process.env.NAVER_MAP_CLIENT_SECRET);
const mapKeys = mapClientId && mapClientSecret ? { clientId: mapClientId, clientSecret: mapClientSecret } : null;
if (!mapKeys) console.log('NAVER_MAP_CLIENT_ID · NAVER_MAP_CLIENT_SECRET 없음 — 주소→좌표 보강(두 번째 축)을 건너뛴다(이름 축만 돈다)');
// ANALYZE_MODEL 이 조용히 무시되는 일이 없게 실제로 쓰는 모델을 한 번 찍는다.
console.log(`모델 ${MODEL} · 프롬프트 ${PROMPT_VERSION} · 글 최대 ${limit}건 · 블로그당 최대 ${maxPerBlog || '무제한'}건`);
// 후보(extracted.meta)와 글(blog_posts.analysis)에 실린다 — 프롬프트를 고친 뒤 재분석 대상을 고르는 키.
const meta = { model: MODEL, promptVersion: PROMPT_VERSION };

const supabase = createSupabase();
const meter = createUsageMeter();

// 마이그레이션 20260928150000(blog_posts.analysis · places.pet_policy)이 적용됐는지 먼저 본다 — 없으면 첫 글의 쓰기에서 42703 으로 죽는데,
// 그때까지 Claude 를 불러 한도만 쓴다. dry-run 도 같은 검사를 한다(실제 실행 전에 알아야 한다).
{
  const { error } = await supabase.from('blog_posts').select('analysis').limit(1);
  if (error) {
    console.error(
      `blog_posts.analysis 컬럼을 읽지 못했다(${error.message}) — supabase/migrations/20260928150000_analysis_and_pet_policy.sql 을 ` +
        '적용한 뒤 다시 돌린다(Studio SQL 편집기에 붙여 넣거나 supabase db push).',
    );
    process.exit(1);
  }
}

const LOCAL_DELAY_MS = 200;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 쓰기는 전부 이 한 곳을 지난다 — dry-run 분기를 호출처마다 두면 하나를 빠뜨리는 순간 dry-run 이 DB 를 건드린다(apply-approved.mjs 와 같은 꼴).
async function write(label, run) {
  if (dryRun) {
    console.log(`  [dry-run] ${label}`);
    return;
  }
  const { error } = await run();
  if (error) throw new Error(`${label}: ${error.message}`);
  console.log(`  ${label}`);
}

// 최신 글부터. 오래된 글이 계속 밀리는 건 감수한다 — 최근 글이 지금 운영 중인 가게일 가능성이 높다.
// limit 보다 넉넉히 읽는 이유 — 한 블로그의 글을 maxPerBlog 건으로 자르면(pickPostsForRun) 빈 자리를 다음 글이 채워야 한다.
const { data: fetchedPosts, error: postsError } = await supabase
  .from('blog_posts')
  .select('url, blog_id, log_no, title, keyword, posted_at')
  .is('analyzed_at', null)
  .order('posted_at', { ascending: false })
  .limit(maxPerBlog > 0 ? Math.min(limit * 4, 400) : limit);
if (postsError) throw new Error(`blog_posts 조회 실패: ${postsError.message}`);
const posts = pickPostsForRun(fetchedPosts, limit, maxPerBlog);

// 지금 규모(86곳 + 신규 draft 몇)는 supabase-js 기본 1000행 제한에 한참 못 미친다 — 늘어나면 range() 로 페이지네이션.
const { data: placeRows, error: placesError } = await supabase.from('places').select('*').neq('status', 'archived');
if (placesError) throw new Error(`places 조회 실패: ${placesError.message}`);
const existing = placeRows.map(fromPlaceRow);
// 86곳이 있어야 정상이다. 비어 있으면 다른 프로젝트·잘못된 키다 — 그대로 가면 후보 전부가 '신규' 로 기록된다(리뷰 지적).
if (existing.length === 0) {
  console.error('places 가 비어 있다 — link 된 프로젝트(supabase/.temp/project-ref)가 맞는지 확인. 후보를 만들지 않고 멈춘다.');
  process.exit(1);
}

// 이전 실행의 pending 후보 이름을 미리 읽어 같은 가게가 또 나오면 dupOf 로 묶는다(2026-09-28 설계 검토 NQ-8 — 첫 분석에서 같은 펜션이 13건).
// 옛 후보(nameKey 없음)는 이름으로 계산한다. 넣지 않는 게 아니라 **표시만** 한다 — evidence 가 다른 글이라 검수에 쓸모가 있다.
const { data: pendingRows, error: pendingError } = await supabase.from('candidates').select('id, extracted').eq('status', 'pending').limit(1000);
if (pendingError) throw new Error(`candidates 조회 실패: ${pendingError.message}`);
const newNamesSeen = new Map(); // nameKey → 먼저 난 pending 후보 id(이전 실행) 또는 글 URL(이번 실행)
for (const row of pendingRows) {
  const key = row.extracted?.nameKey ?? normalizeName(row.extracted?.name ?? '');
  if (key && !newNamesSeen.has(key)) newNamesSeen.set(key, row.id);
}

console.log(
  `미분석 글 ${posts.length}건(읽은 ${fetchedPosts.length}건 중 블로그당 ${maxPerBlog || '무제한'}건) · 기존 장소 ${existing.length}곳(archived 제외) · pending 후보 ${pendingRows.length}건`,
);

// 네이버가 잠깐 죽었다고 글 전체를 버리지 않는다 — 실패하면 좌표 없이 간다(status 만 로그). 단 401/403 은 키가 틀린 것이라 실행을
// 세운다: 조용히 이름만으로 대조하면 같은 이름의 다른 가게가 ask 대신 auto 로 올라간다(리뷰 지적). 검색 사이 200ms 는 collect-blog.mjs 와 같은 예의.
// 좌표 보강이 실제로 무슨 일을 했는지 — 실행 끝에 한 줄 찍는다(아래 요약).
const naverStats = { searched: 0, picked: 0, failed: 0 };
const pickReasons = newPickReasons();

// 두 번째 축(주소 → 좌표). `chance` 는 이름 축이 좌표를 못 붙인 후보 수 — 이 축이 구제할 대상의 크기다.
const geocodeStats = { chance: 0, tried: 0, picked: 0, failed: 0 };
const geocodeReasons = newGeocodeReasons();
// 401/403/429 를 만나면 이 실행 동안 축을 내린다. **실행을 세우지는 않는다**(머리 주석) — 남은 건마다 같은 실패로 쿼터를 태우지 않으려는 것뿐이다.
let geocodeAxisOff = false;

async function enrichWithGeocode(address) {
  if (!mapKeys || geocodeAxisOff) return null;
  if (!shouldGeocode(address, geocodeReasons)) return null;
  geocodeStats.tried++;
  try {
    const picked = pickGeocoded(await geocodeAddress(address, mapKeys), { address }, geocodeReasons);
    if (!picked) return null;
    geocodeStats.picked++;
    // 이름 축의 반환값과 같은 모양으로 맞춘다(toMatchCandidate·toCandidateRow 가 그 모양을 읽는다). 단 **naverLink·category 는 null 이다** —
    // Geocoding 은 주소를 좌표로 바꿀 뿐 업체를 모른다. 여기에 값을 지어 넣으면 apply 가 엉뚱한 category 로 빈 칸을 채운다.
    return { ...picked, naverLink: null, category: null, geoSource: 'geocode' };
  } catch (e) {
    geocodeStats.failed++;
    // 첫 실패를 요약 줄이 들고 갈 수 있게 남긴다 — 전 건이 실패하면 좌표 표본이 없어 이것만이 단서다.
    // e.message 는 status 와 게이트웨이 꼬리표뿐이고 주소·키는 들어 있지 않다(geocodeAddress).
    if (geocodeReasons.firstFailure === null) geocodeReasons.firstFailure = e.message;
    if (e?.status === 401 || e?.status === 403 || e?.status === 429) {
      geocodeAxisOff = true;
      console.log(
        `    주소→좌표 축을 이 실행 동안 내린다(status=${e.status}): ${e.message}\n` +
          '      → 키(NAVER_MAP_CLIENT_ID · NAVER_MAP_CLIENT_SECRET, 검색 키가 아니다)와 NCP 콘솔 Maps Application 의 Geocoding 체크를 본다.\n' +
          '      이름 축과 후보 생성은 계속한다 — 이 축은 좌표를 더하기만 하므로 없으면 오늘까지의 동작으로 돌아갈 뿐이다.',
      );
    } else {
      console.log(`    주소→좌표 보강 실패(좌표 없이 진행): ${e.message}`);
    }
    return null;
  } finally {
    await sleep(LOCAL_DELAY_MS);
  }
}

async function enrichWithNaver(name, town) {
  if (!naverKeys) return null;
  try {
    const items = await searchNaverPlace(name, naverKeys);
    naverStats.searched++;
    const picked = pickNaverPlace(items, { name, town }, pickReasons);
    if (picked) naverStats.picked++;
    return picked;
  } catch (e) {
    if (e?.status === 401 || e?.status === 403) {
      throw Object.assign(new Error(`네이버 인증 실패(status=${e.status}) — NAVER_CLIENT_ID · NAVER_CLIENT_SECRET 을 확인. 좌표 없이 대조하면 판정이 흐려져 실행을 멈춘다`), { fatal: true });
    }
    // 429 도 세운다. 검색 API 는 일 25,000 호출 상한이고 `data:collect` 와 **같은 키를 쓴다** —
    // 한 번 소진되면 그날 남은 전 건이 같은 결과다. 일시 장애처럼 흘려보내면 401/403 을 세우는
    // 이유(좌표 없이 이름만으로 대조 → 동명 가게가 ask 대신 auto)가 그대로 재현되는데 실행만 안 멈춘다.
    if (e?.status === 429) {
      // 429 만으로는 "일 상한 소진" 과 "순간 호출 제한" 을 구별할 수 없다 — 원인을 단정하지 않는다(리뷰 지적).
      throw Object.assign(new Error('네이버 검색 호출이 429 — 일 상한(25,000) 소진이거나 순간 호출 제한이다. 좌표 없이 대조하면 동명 가게가 auto 로 올라가므로 멈춘다. 잠시 뒤 또는 내일 다시 돌리고, 남은 건은 --limit 으로 나눠라'), { fatal: true });
    }
    naverStats.failed++;
    console.log(`    네이버 보강 실패(좌표 없이 진행): ${e.message}`);
    return null;
  } finally {
    await sleep(LOCAL_DELAY_MS);
  }
}

// 다시 받아도 같을 실패인가 — 던진 쪽이 permanent 를 명시한 것만 믿는다(본문 404/410 · 컨테이너 없음 · blog_id 없음 · 모델 스키마 소진).
// status 4xx 를 일반 규칙으로 닫지 않는 이유 — 네이버 403 은 차단, Claude 4xx 는 설정 오류라 글의 잘못이 아니다(리뷰 지적).
// CLI 출력이 result 가 아니거나 structured_output 이 없는 것도 CLI 버전·설정 문제일 수 있어 닫지 않는다.
function isPermanentFailure(e) {
  return e?.permanent === true;
}

// 건너뛴 이유를 한 단어 더 — 일시 오류(다음 실행에 될 가능성 큼)와 모델 응답 문제(다음에도 같을 수 있음)를 사람이 구분하게.
function skipHint(e) {
  if (isRetryable(e)) return ' [일시 오류 — 다음 실행에 재시도]';
  if (e?.name === 'ExtractionError' || e?.code === 'invalid_json') return ` [모델 응답 문제 code=${e.code} — 다음 실행에도 같을 수 있다]`;
  return '';
}

const stats = { analyzed: 0, skipped: 0, dropped: 0, candidates: 0, auto: 0, ask: 0, new: 0, dup: 0, excluded: { other: 0, notJeju: 0, notAllowed: 0 } };
let fatal = false;
const pendingCloses = []; // { url, reason } — 루프 끝에 성공이 1건이라도 있을 때만 analyzed_at 을 찍는다
// --dump 용. DB 에 들어갈 후보 행(extracted 그대로, 본문 없음)과 제외 목록 — 정규화 품질을 사람이 볼 유일한 창이다(로그에는 안 찍는다, 05).
const dumpEntries = [];

for (const post of posts) {
  console.log(`글 ${post.url} (${post.title ?? '제목 없음'})`);
  try {
    if (!post.blog_id || !post.log_no) throw Object.assign(new Error('blog_id/log_no 가 비어 있어 본문 주소를 만들 수 없다'), { permanent: true });
    const body = await fetchPostText({ blogId: post.blog_id, logNo: post.log_no });
    // 컨테이너를 못 찾으면 '' 다. 비공개·삭제 글이거나 에디터 구조가 바뀐 것 — 빈 본문으로 모델을 부르면 토큰만 쓴다.
    if (!body) throw Object.assign(new Error('본문 컨테이너를 찾지 못함(비공개·삭제 글이거나 에디터 구조가 바뀜)'), { permanent: true });

    const places = await extractPlaces(runClaudeCli, post, body, meter);
    const rows = [];
    const excluded = [];
    for (const extracted of places) {
      const reason = exclusionReason(extracted);
      if (reason) {
        excluded.push({ extracted, reason });
        stats.excluded[reason] += 1;
        const why = reason === 'notJeju' ? ' · 제주 아님' : reason === 'notAllowed' ? ' · 동반 불가' : '';
        console.log(`  제외 ${extracted.name} (${extracted.type}${why})`);
        continue;
      }
      // 같은 이름이 여럿일 때 AI 가 읽은 읍·면(regionRaw 또는 본문 주소)이 검색 결과를 고르는 힌트다 — 우도 카페살레 vs 본섬 동명(리뷰 지적).
      // 네이버 지역 검색은 display 상한이 5 라(Kakao 는 15) 동명 구분이 더 약하다 — 이 힌트가 그만큼 중요해졌다.
      let local = await enrichWithNaver(extracted.name, townOf(extracted.regionRaw) ?? townOf(extracted.address));
      // 이름 축이 못 붙였을 때만 주소 축으로 물러선다 — 이름으로 찾은 업체 쪽이 좌표 말고 category 까지 주므로 항상 우선이다.
      if (!local) {
        // `chance` 는 **이름 축이 실제로 찾아보고 못 붙인** 수다. 검색 키가 없으면 이름 축은 아무것도 보지 않았으므로 세지 않는다 —
        // 안 세면 요약이 "이름 축이 좌표를 못 붙인 후보 N건" 을 후보 전체 수로 뻥튀기한다(리뷰 지적).
        if (naverKeys) geocodeStats.chance++;
        local = await enrichWithGeocode(extracted.address);
      }
      // regionRaw 는 주소 기반이 우선(analyzeCandidates.mjs). 주소는 네이버 → 본문 순.
      const regionRaw = resolveRegionRaw(local?.address ?? extracted.address, extracted.regionRaw, existing);
      const matched = matchPlace(toMatchCandidate(extracted, local), existing);
      const key = normalizeName(extracted.name);
      const dupOf = tierOf(matched) === 'new' ? (newNamesSeen.get(key) ?? null) : null;
      const row = toCandidateRow(post, extracted, local, regionRaw, matched, { meta, dupOf });
      const tier = row.extracted.match.tier;
      console.log(`  ${formatCandidateLine(row, matched.match?.name)}${row.extracted.visited === false ? ' · 목록글' : ''}`);

      if (tier === 'new') {
        if (dupOf) {
          stats.dup += 1;
          console.log(`    ※ 같은 이름의 신규 후보가 이미 있음(${dupOf}) — dupOf 로 표시하고 넣는다. pnpm data:review 가 묶어 보여 준다`);
        } else newNamesSeen.set(key, post.url);
      }
      rows.push(row);
    }

    dumpEntries.push({ post: { url: post.url, title: post.title, posted_at: post.posted_at }, candidates: rows, excluded });
    if (rows.length > 0) await write(`candidates ${rows.length}건 insert`, () => supabase.from('candidates').insert(rows));
    // 후보가 0개여도(장소 없음 · 제주 아님 · other 뿐) 분석은 끝난 것이다 — 다시 읽지 않게 analyzed_at 을 찍고, "왜 0건인가" 를 analysis 에 남긴다.
    const analysis = toPostAnalysis({ meta, candidates: rows, excluded });
    await write(`analyzed_at 기록${rows.length === 0 ? ' (후보 없음)' : ''}`, () =>
      supabase.from('blog_posts').update({ analyzed_at: new Date().toISOString(), analysis }).eq('url', post.url),
    );

    // 끝까지 간 뒤에만 센다 — 중간에 실패한 글은 "건너뜀" 이지 "분석" 이 아니고, 그 글의 후보도 세지 않는다.
    stats.analyzed += 1;
    stats.candidates += rows.length;
    for (const row of rows) stats[row.extracted.match.tier] += 1;
  } catch (e) {
    // 인증 실패·CLI 없음·네이버 키 오류는 다음 글도 전부 같다 — 50건을 헛돌지 않고 여기서 끊는다. analyzed_at 은 안 찍혔으니 다음 실행이 이어 간다.
    if (isFatal(e)) {
      stats.skipped += 1;
      console.error(`  중단: ${e.message}`);
      console.error('  이 실행의 나머지 글은 건너뛴다(같은 이유로 실패한다).');
      fatal = true;
      break;
    }
    if (isPermanentFailure(e)) {
      console.error(`  분석 불가(루프 끝에 닫는다): ${e.message}`);
      pendingCloses.push({ url: post.url, reason: e.message });
      continue;
    }
    stats.skipped += 1;
    console.error(`  건너뜀: ${e.message}${skipHint(e)}`);
  }
}

// "분석 불가" 닫기 — 성공이 1건이라도 있어야 파이프라인이 살아 있다는 증거다. 아니면 글이 아니라 구조가 고장 난 것이니 닫지 않는다.
if (pendingCloses.length > 0) {
  if (stats.analyzed > 0) {
    for (const { url, reason } of pendingCloses) {
      try {
        await write(`analyzed_at 기록 ${url} (분석 불가: ${reason.slice(0, 80)})`, () =>
          supabase
            .from('blog_posts')
            .update({ analyzed_at: new Date().toISOString(), analysis: toPostAnalysis({ meta, skip: reason.slice(0, 200) }) })
            .eq('url', url),
        );
        stats.dropped += 1;
      } catch (writeError) {
        stats.skipped += 1;
        console.error(`  analyzed_at 기록 실패(다음 실행에 재시도): ${writeError.message}`);
      }
    }
  } else {
    stats.skipped += pendingCloses.length;
    console.error(`분석 성공이 0건이라 "분석 불가" ${pendingCloses.length}건을 닫지 않는다 — 글이 아니라 파이프라인 문제일 수 있다(에디터 구조 변경·차단 페이지). 다음 실행에 재시도.`);
  }
}

console.log(formatSummary(stats, meter.summary(), { dryRun }));

// --dump: 후보·제외 목록을 로컬 JSON 으로. data/raw/ 는 .gitignore 라 레포에 남지 않는다. 본문은 없고 evidence(인용 1~3문장)는 DB 와 같은 것이다.
if (dump !== null) {
  const path = resolve(dump || `data/raw/analyze-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify({ ...meta, dryRun, at: new Date().toISOString(), posts: dumpEntries }, null, 1));
  console.log(`덤프: ${path} (글 ${dumpEntries.length}건 · 후보 ${dumpEntries.reduce((n, e) => n + e.candidates.length, 0)}건 · 제외 ${dumpEntries.reduce((n, e) => n + e.excluded.length, 0)}건)`);
}

/*
 * 좌표 보강 요약. **이 줄이 `mapx`/`mapy` 포맷의 실측 보고**다 — 공식 문서가 스스로 모순돼
 * (본문은 WGS84, 예제는 옛 KATECH 6자리) 실제 응답을 봐야만 확정된다.
 * 읽는 법: `채택 0` 인데 `파싱실패`·`제주밖` 이 크면 포맷이 우리가 아는 것과 다른 것이고,
 * 그때 sample 의 자릿수를 보고 parseNaverCoord 를 고친 뒤 naverLocal.test.mjs 에 그 값을 못 박는다.
 * `이름불일치` 만 크면 포맷은 맞고 검색어·동명 문제다.
 */
if (naverStats.searched > 0) {
  const r = pickReasons;
  console.log(
    `좌표 보강: 검색 ${naverStats.searched} · 채택 ${naverStats.picked} · 요청실패 ${naverStats.failed}\n` +
      `  탈락 사유 — 제주밖주소 ${r.notJejuAddress} · 좌표파싱실패 ${r.coordUnparsable} · 좌표제주밖 ${r.coordOutOfJeju} · 이름불일치 ${r.nameMismatch} · 결과있었으나미채택 ${r.itemsButNoPick ?? 0}(호출 단위)`,
  );
  if (naverStats.picked === 0 && r.sample) {
    console.log(
      `  ⚠️ 채택 0건이다. 실제 응답 표본 mapx=${r.sample.mapx} mapy=${r.sample.mapy} ` +
        '— 자릿수가 10자리(10^7 배)가 아니면 parseNaverCoord 를 고쳐야 한다(docs/todo/README.md 의 ⚠️ 미검증 1).',
    );
  }
}
/*
 * 두 번째 축 요약. **키가 없을 때 전체 표를 찍지 않는다** — `shouldGeocode` 가 아예 안 돌아 "호출 전 탈락" 이 전부 0 이고,
 * 그 0 들은 "주소가 다 멀쩡했다" 가 아니라 "아무것도 보지 않았다" 는 뜻이라 읽는 사람을 속인다(⚠️ 판정 불가에 속지 말 것과 같은 자리).
 * 대신 기회의 크기만 한 줄 — 키를 넣을 값이 있는지 판단할 근거가 그것뿐이다.
 */
// `tried > 0` 도 본다 — 검색 키 없이 Maps 키만 있으면 chance 는 0 인데 축은 실제로 돌았다(설계 검토 OB-6). 그때 요약이 안 찍히면 ⚠️3 을 판정할 수 없다.
if (geocodeStats.chance > 0 || geocodeStats.tried > 0) {
  if (mapKeys) console.log(formatGeocodeSummary(geocodeStats, geocodeReasons));
  else {
    console.log(
      `주소→좌표(Geocoding): 꺼져 있다. 이름 축이 좌표를 못 붙인 후보 ${geocodeStats.chance}건이 이 축의 대상이었다 — ` +
        'NAVER_MAP_CLIENT_ID · NAVER_MAP_CLIENT_SECRET 을 주면 그중 주소가 있는 건을 시도한다(docs/todo/03).',
    );
  }
}

// 글 단위 실패는 정상 경로(다음 실행에 재시도)라 exit 0. 시도한 글 중 성공이 0 이면 1 — "분석 불가" 도 성공이 아니다(위에서 닫지도 않았다).
// process.exit() 은 파이프로 나가던 stdout 을 잘라먹을 수 있어 자연 종료를 기다린다.
process.exitCode = fatal || (posts.length > 0 && stats.analyzed === 0) ? 1 : 0;
