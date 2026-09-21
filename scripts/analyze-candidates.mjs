// blog_posts 의 미분석 글을 Claude 로 분석해 candidates 를 만든다(`pnpm data:analyze`). docs/todo/03-analyze-and-review.md 가 정본.
// 글 하나의 흐름: 본문 받기(naverPostBody) → 장소 추출(extractPlaces) → 좌표·주소 보강(kakaoLocal, 키 있을 때만) →
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
//  - 글 하나가 실패하면 그 글만 건너뛴다. 다시 받아도 같을 실패(본문 4xx · 본문 컨테이너 없음 · blog_id 없음 · 모델이 스키마를 못 맞춤)는
//    analyzed_at 을 찍어 **닫는다** — 안 찍으면 매 실행 --limit 창을 잠식하며 영원히 재시도한다(리뷰 지적). 잠깐의 실패(5xx · 네트워크 ·
//    한도 · 타임아웃 · DB 쓰기 실패)는 analyzed_at 을 비워 둬 다음 실행이 다시 시도한다. 글 단위 실패는 exit code 를 올리지 않는다.
//    시도한 글이 **전부** 실패했을 때만 exit 1 로 잡을 빨갛게 한다(네이버가 데이터센터 IP 를 막는 등 구조적 문제 — 02 가 걱정한 그 경우).
//  - 같은 글의 후보는 insert 한 번에 넣는다(PostgREST 의 한 요청 = 한 문장이라 원자적). insert 와 analyzed_at 사이에서 죽으면
//    다음 실행이 그 글의 후보를 한 번 더 만든다 — 창은 작고, Studio 에서 보인다.
//  - Claude 는 API SDK 가 아니라 `claude -p`(구독, setup-token) 로 부른다 — extractPlaces.mjs 머리 주석. 인증 실패·CLI 없음 같은
//    fatal 은 나머지 글도 전부 같은 이유로 실패하므로 루프를 끊고 exit 1. 한도(429·session limit)는 글 단위 건너뜀 → 다음 실행.
//  - 재시도는 CLI 에 맡긴다. 여기서 한 번 더 돌면 실패 한 건에 호출이 배가 된다.
//  - 같은 실행 안에서 같은 이름의 신규 후보가 두 번 나와도 둘 다 넣는다(두 번째가 첫 번째를 가리키게 하지 않는다). 로그에만
//    남기고 사람이 Studio 에서 본다 — 단순하게.
//  - `--dry-run` 은 DB 에 쓰지 않는다(analyzed_at 도). Claude 는 부른다 — 토큰은 쓰인다. 무엇이 후보가 되는지 보는 용도.
//  - 로그에 시크릿·응답 본문·헤더·본문 텍스트를 남기지 않는다(docs/todo/05). 글 URL·제목, 후보 요약 한 줄, error.message 만.
import { createClient } from '@supabase/supabase-js';
import {
  formatCandidateLine,
  formatSummary,
  isPlaceCandidate,
  parseArgs,
  resolveRegionRaw,
  toCandidateRow,
  toMatchCandidate,
} from './analyze/analyzeCandidates.mjs';
import { createUsageMeter, ExtractionError, extractPlaces, isFatal, isRetryable, MODEL, runClaudeCli } from './analyze/extractPlaces.mjs';
import { pickKakaoPlace, searchKakaoPlace } from './analyze/kakaoLocal.mjs';
import { matchPlace, normalizeName } from './analyze/matchPlace.mjs';
import { fetchPostText } from './analyze/naverPostBody.mjs';
import { fromPlaceRow } from './lib/placeFields.mjs';

let args;
try {
  args = parseArgs(process.argv.slice(2));
} catch (e) {
  console.error(`${e.message} — 사용법: pnpm data:analyze [--limit N] [--dry-run]`);
  process.exit(1);
}
const { limit, dryRun } = args;
console.log(dryRun ? '모드: dry-run — DB 에 쓰지 않는다(Claude 는 부른다)' : '모드: 분석 — candidates · blog_posts.analyzed_at 에 쓴다');

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, KAKAO_REST_API_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY 가 필요합니다. .env.local 을 확인하세요.');
  process.exit(1);
}
// Claude 인증은 env 로 검사하지 않는다 — 로컬은 `claude` 의 키체인 로그인, Actions 는 CLAUDE_CODE_OAUTH_TOKEN 이고 둘 다 CLI 가 읽는다.
// 안 돼 있으면 첫 글에서 ClaudeCliError(auth, fatal) 가 나와 루프가 끊긴다.
// 좌표 보강은 선택이다 — 키가 없으면 후보는 좌표·주소 없이 들어가고, matchPlace 는 이름·종류만으로 대조한다(감점 없음).
if (!KAKAO_REST_API_KEY) console.log('KAKAO_REST_API_KEY 없음 — 좌표·주소 보강을 건너뛴다');
// ANALYZE_MODEL 이 조용히 무시되는 일이 없게 실제로 쓰는 모델을 한 번 찍는다.
console.log(`모델 ${MODEL} · 글 최대 ${limit}건`);

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const meter = createUsageMeter();

const KAKAO_DELAY_MS = 200;
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
const { data: posts, error: postsError } = await supabase
  .from('blog_posts')
  .select('url, blog_id, log_no, title, keyword, posted_at')
  .is('analyzed_at', null)
  .order('posted_at', { ascending: false })
  .limit(limit);
if (postsError) throw new Error(`blog_posts 조회 실패: ${postsError.message}`);

// 지금 규모(86곳 + 신규 draft 몇)는 supabase-js 기본 1000행 제한에 한참 못 미친다 — 늘어나면 range() 로 페이지네이션.
const { data: placeRows, error: placesError } = await supabase.from('places').select('*').neq('status', 'archived');
if (placesError) throw new Error(`places 조회 실패: ${placesError.message}`);
const existing = placeRows.map(fromPlaceRow);
// 86곳이 있어야 정상이다. 비어 있으면 다른 프로젝트·잘못된 키다 — 그대로 가면 후보 전부가 '신규' 로 기록된다(리뷰 지적).
if (existing.length === 0) {
  console.error('places 가 비어 있다 — SUPABASE_URL 이 맞는 프로젝트인지 확인. 후보를 만들지 않고 멈춘다.');
  process.exit(1);
}

console.log(`미분석 글 ${posts.length}건 · 기존 장소 ${existing.length}곳(archived 제외)`);

// Kakao 가 잠깐 죽었다고 글 전체를 버리지 않는다 — 실패하면 좌표 없이 간다(status 만 로그). 단 401/403 은 키가 틀린 것이라 실행을
// 세운다: 조용히 이름만으로 대조하면 같은 이름의 다른 가게가 ask 대신 auto 로 올라간다(리뷰 지적). 검색 사이 200ms 는 collect-blog.mjs 와 같은 예의.
async function enrichWithKakao(name) {
  if (!KAKAO_REST_API_KEY) return null;
  try {
    const documents = await searchKakaoPlace(name, KAKAO_REST_API_KEY);
    return pickKakaoPlace(documents, { name });
  } catch (e) {
    if (e?.status === 401 || e?.status === 403) {
      throw Object.assign(new Error(`Kakao 인증 실패(status=${e.status}) — KAKAO_REST_API_KEY 를 확인. 좌표 없이 대조하면 판정이 흐려져 실행을 멈춘다`), { fatal: true });
    }
    console.log(`    Kakao 보강 실패(좌표 없이 진행): ${e.message}`);
    return null;
  } finally {
    await sleep(KAKAO_DELAY_MS);
  }
}

// 다시 받아도 같을 실패인가 — 그러면 analyzed_at 을 찍어 닫는다. 판단이 애매한 것(CLI 출력이 result 가 아님·structured_output 없음)은
// CLI 버전·설정 문제일 수 있어 닫지 않는다. DB 쓰기 실패는 여기 오기 전에 걸러진다(permanent 표시가 없다).
function isPermanentFailure(e) {
  if (e?.permanent === true) return true;
  if (typeof e?.status === 'number' && e.status >= 400 && e.status < 500 && e.status !== 429) return true;
  if (e instanceof ExtractionError) return !['not_result', 'no_structured_output'].includes(e.code);
  return false;
}

// 건너뛴 이유를 한 단어 더 — 일시 오류(다음 실행에 될 가능성 큼)와 모델 응답 문제(다음에도 같을 수 있음)를 사람이 구분하게.
function skipHint(e) {
  if (isRetryable(e)) return ' [일시 오류 — 다음 실행에 재시도]';
  if (e?.name === 'ExtractionError') return ` [모델 응답 문제 code=${e.code} — 다음 실행에도 같을 수 있다]`;
  return '';
}

const stats = { analyzed: 0, skipped: 0, dropped: 0, candidates: 0, auto: 0, ask: 0, new: 0 };
let fatal = false;
const newNamesSeen = new Map(); // normalizeName(이름) → 먼저 나온 글 URL

for (const post of posts) {
  console.log(`글 ${post.url} (${post.title ?? '제목 없음'})`);
  try {
    if (!post.blog_id || !post.log_no) throw Object.assign(new Error('blog_id/log_no 가 비어 있어 본문 주소를 만들 수 없다'), { permanent: true });
    const body = await fetchPostText({ blogId: post.blog_id, logNo: post.log_no });
    // 컨테이너를 못 찾으면 '' 다. 비공개·삭제 글이거나 에디터 구조가 바뀐 것 — 빈 본문으로 모델을 부르면 토큰만 쓴다.
    if (!body) throw Object.assign(new Error('본문 컨테이너를 찾지 못함(비공개·삭제 글이거나 에디터 구조가 바뀜)'), { permanent: true });

    const places = await extractPlaces(runClaudeCli, post, body, meter);
    const rows = [];
    for (const extracted of places) {
      if (!isPlaceCandidate(extracted)) {
        console.log(`  제외 ${extracted.name} (${extracted.type}${extracted.isJeju ? '' : ' · 제주 아님'})`);
        continue;
      }
      const kakao = await enrichWithKakao(extracted.name);
      // regionRaw 는 주소 기반이 우선(analyzeCandidates.mjs). 주소는 Kakao → 본문 순.
      const regionRaw = resolveRegionRaw(kakao?.address ?? extracted.address, extracted.regionRaw, existing);
      const matched = matchPlace(toMatchCandidate(extracted, kakao), existing);
      const row = toCandidateRow(post, extracted, kakao, regionRaw, matched);
      const tier = row.extracted.match.tier;
      console.log(`  ${formatCandidateLine(row, matched.match?.name)}`);

      if (tier === 'new') {
        const key = normalizeName(extracted.name);
        const firstUrl = newNamesSeen.get(key);
        if (firstUrl) console.log(`    ※ 같은 이름의 신규 후보가 이 실행에서 이미 나옴(${firstUrl}) — 둘 다 넣는다. Studio 에서 확인`);
        else newNamesSeen.set(key, post.url);
      }
      rows.push(row);
    }

    if (rows.length > 0) await write(`candidates ${rows.length}건 insert`, () => supabase.from('candidates').insert(rows));
    // 후보가 0개여도(장소 없음 · 제주 아님 · other 뿐) 분석은 끝난 것이다 — 다시 읽지 않게 analyzed_at 을 찍는다.
    await write(`analyzed_at 기록${rows.length === 0 ? ' (후보 없음)' : ''}`, () =>
      supabase.from('blog_posts').update({ analyzed_at: new Date().toISOString() }).eq('url', post.url),
    );

    // 끝까지 간 뒤에만 센다 — 중간에 실패한 글은 "건너뜀" 이지 "분석" 이 아니고, 그 글의 후보도 세지 않는다.
    stats.analyzed += 1;
    stats.candidates += rows.length;
    for (const row of rows) stats[row.extracted.match.tier] += 1;
  } catch (e) {
    // 인증 실패·CLI 없음·Kakao 키 오류는 다음 글도 전부 같다 — 50건을 헛돌지 않고 여기서 끊는다. analyzed_at 은 안 찍혔으니 다음 실행이 이어 간다.
    if (isFatal(e)) {
      stats.skipped += 1;
      console.error(`  중단: ${e.message}`);
      console.error('  이 실행의 나머지 글은 건너뛴다(같은 이유로 실패한다).');
      fatal = true;
      break;
    }
    if (isPermanentFailure(e)) {
      // 닫는다 — 후보 없이 analyzed_at 만. 이 write 마저 실패하면 다음 실행이 한 번 더 시도하는 것뿐이다.
      try {
        await write(`analyzed_at 기록 (분석 불가: ${e.message})`, () =>
          supabase.from('blog_posts').update({ analyzed_at: new Date().toISOString() }).eq('url', post.url),
        );
        stats.dropped += 1;
        continue;
      } catch (writeError) {
        console.error(`  analyzed_at 기록 실패: ${writeError.message}`);
      }
    }
    stats.skipped += 1;
    console.error(`  건너뜀: ${e.message}${skipHint(e)}`);
  }
}

console.log(formatSummary(stats, meter.summary(), { dryRun }));
// 글 단위 실패는 정상 경로(다음 실행에 재시도)라 exit 0. 시도한 글이 전부 실패했을 때만 1 — 구조적 문제를 잡이 빨갛게 알린다.
// process.exit() 은 파이프로 나가던 stdout 을 잘라먹을 수 있어 자연 종료를 기다린다.
process.exitCode = fatal || (posts.length > 0 && stats.analyzed === 0 && stats.dropped === 0) ? 1 : 0;
