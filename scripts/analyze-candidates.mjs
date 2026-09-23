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
//    fatal 은 나머지 글도 전부 같은 이유로 실패하므로 루프를 끊고 exit 1. 한도(429·session limit)는 글 단위 건너뜀 → 다음 실행.
//  - 재시도는 CLI 에 맡긴다. 여기서 한 번 더 돌면 실패 한 건에 호출이 배가 된다.
//  - 같은 실행 안에서 같은 이름의 신규 후보가 두 번 나와도 둘 다 넣는다(두 번째가 첫 번째를 가리키게 하지 않는다). 로그에만
//    남기고 사람이 Studio 에서 본다 — 단순하게.
//  - `--dry-run` 은 DB 에 쓰지 않는다(analyzed_at 도). Claude 는 부른다 — 토큰은 쓰인다. 무엇이 후보가 되는지 보는 용도.
//  - 로그에 시크릿·응답 본문·헤더·본문 텍스트를 남기지 않는다(docs/todo/05). 글 URL·제목, 후보 요약 한 줄, error.message 만.
import {
  formatCandidateLine,
  formatSummary,
  isPlaceCandidate,
  parseArgs,
  resolveRegionRaw,
  toCandidateRow,
  toMatchCandidate,
} from './analyze/analyzeCandidates.mjs';
import { createUsageMeter, extractPlaces, isFatal, isRetryable, MODEL, runClaudeCli } from './analyze/extractPlaces.mjs';
import { newPickReasons, pickNaverPlace, searchNaverPlace } from './analyze/naverLocal.mjs';
import { matchPlace, normalizeName, townOf } from './analyze/matchPlace.mjs';
import { fetchPostText } from './analyze/naverPostBody.mjs';
import { fromPlaceRow } from './lib/placeFields.mjs';
import { createSupabase } from './lib/supabaseClient.mjs';

let args;
try {
  args = parseArgs(process.argv.slice(2));
} catch (e) {
  console.error(`${e.message} — 사용법: pnpm data:analyze [--limit N] [--dry-run]`);
  process.exit(1);
}
const { limit, dryRun } = args;
console.log(dryRun ? '모드: dry-run — DB 에 쓰지 않는다(Claude 는 부른다)' : '모드: 분석 — candidates · blog_posts.analyzed_at 에 쓴다');

// 좌표 보강은 **02(수집)과 같은 네이버 키**를 쓴다 — 키를 하나 더 발급·관리하지 않는다(ADR-008 v4).
// env 에 둘 다 있을 때만 켠다. 여기서는 숨김 입력을 받지 않는다: 분석은 글마다 몇 분씩 도는 일이라
// 중간에 프롬프트가 뜨면 안 되고, Claude 가 --dry-run 으로 돌리는 경로이기도 해서다(docs/todo/03).
const { NAVER_CLIENT_ID: naverClientId, NAVER_CLIENT_SECRET: naverClientSecret } = process.env;
const naverKeys = naverClientId && naverClientSecret ? { clientId: naverClientId, clientSecret: naverClientSecret } : null;
// Claude 인증은 env 로 검사하지 않는다 — 이 머신에 로그인된 `claude`(키체인)를 CLI 가 스스로 읽는다. 토큰 env 는 없다(ADR-016).
// 안 돼 있으면 첫 글에서 ClaudeCliError(auth, fatal) 가 나와 루프가 끊긴다.
// 좌표 보강은 선택이다 — 키가 없으면 후보는 좌표·주소 없이 들어가고, matchPlace 는 이름·종류만으로 대조한다(감점 없음).
if (!naverKeys) console.log('NAVER_CLIENT_ID · NAVER_CLIENT_SECRET 없음 — 좌표·주소 보강을 건너뛴다(후보는 이름·종류로만 대조된다)');
// ANALYZE_MODEL 이 조용히 무시되는 일이 없게 실제로 쓰는 모델을 한 번 찍는다.
console.log(`모델 ${MODEL} · 글 최대 ${limit}건`);

const supabase = createSupabase();
const meter = createUsageMeter();

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
  console.error('places 가 비어 있다 — link 된 프로젝트(supabase/.temp/project-ref)가 맞는지 확인. 후보를 만들지 않고 멈춘다.');
  process.exit(1);
}

console.log(`미분석 글 ${posts.length}건 · 기존 장소 ${existing.length}곳(archived 제외)`);

// 네이버가 잠깐 죽었다고 글 전체를 버리지 않는다 — 실패하면 좌표 없이 간다(status 만 로그). 단 401/403 은 키가 틀린 것이라 실행을
// 세운다: 조용히 이름만으로 대조하면 같은 이름의 다른 가게가 ask 대신 auto 로 올라간다(리뷰 지적). 검색 사이 200ms 는 collect-blog.mjs 와 같은 예의.
// 좌표 보강이 실제로 무슨 일을 했는지 — 실행 끝에 한 줄 찍는다(아래 요약).
const naverStats = { searched: 0, picked: 0, failed: 0 };
const pickReasons = newPickReasons();

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
      throw Object.assign(new Error('네이버 검색 쿼터 소진(status=429) — 일 상한(25,000)을 썼다. 좌표 없이 대조하면 동명 가게가 auto 로 올라가므로 멈춘다. 내일 다시 돌리거나 남은 건을 --limit 으로 나눠라'), { fatal: true });
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
  if (e?.name === 'ExtractionError') return ` [모델 응답 문제 code=${e.code} — 다음 실행에도 같을 수 있다]`;
  return '';
}

const stats = { analyzed: 0, skipped: 0, dropped: 0, candidates: 0, auto: 0, ask: 0, new: 0 };
let fatal = false;
const pendingCloses = []; // { url, reason } — 루프 끝에 성공이 1건이라도 있을 때만 analyzed_at 을 찍는다
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
      // 같은 이름이 여럿일 때 AI 가 읽은 읍·면(regionRaw 또는 본문 주소)이 검색 결과를 고르는 힌트다 — 우도 카페살레 vs 본섬 동명(리뷰 지적).
      // 네이버 지역 검색은 display 상한이 5 라(Kakao 는 15) 동명 구분이 더 약하다 — 이 힌트가 그만큼 중요해졌다.
      const local = await enrichWithNaver(extracted.name, townOf(extracted.regionRaw) ?? townOf(extracted.address));
      // regionRaw 는 주소 기반이 우선(analyzeCandidates.mjs). 주소는 네이버 → 본문 순.
      const regionRaw = resolveRegionRaw(local?.address ?? extracted.address, extracted.regionRaw, existing);
      const matched = matchPlace(toMatchCandidate(extracted, local), existing);
      const row = toCandidateRow(post, extracted, local, regionRaw, matched);
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
          supabase.from('blog_posts').update({ analyzed_at: new Date().toISOString() }).eq('url', url),
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
      `  탈락 사유 — 제주밖주소 ${r.notJejuAddress} · 좌표파싱실패 ${r.coordUnparsable} · 좌표제주밖 ${r.coordOutOfJeju} · 이름불일치 ${r.nameMismatch}`,
  );
  if (naverStats.picked === 0 && r.sample) {
    console.log(
      `  ⚠️ 채택 0건이다. 실제 응답 표본 mapx=${r.sample.mapx} mapy=${r.sample.mapy} ` +
        '— 자릿수가 10자리(10^7 배)가 아니면 parseNaverCoord 를 고쳐야 한다(docs/todo/README.md 의 ⚠️ 미검증 1).',
    );
  }
}
// 글 단위 실패는 정상 경로(다음 실행에 재시도)라 exit 0. 시도한 글 중 성공이 0 이면 1 — "분석 불가" 도 성공이 아니다(위에서 닫지도 않았다).
// process.exit() 은 파이프로 나가던 stdout 을 잘라먹을 수 있어 자연 종료를 기다린다.
process.exitCode = fatal || (posts.length > 0 && stats.analyzed === 0) ? 1 : 0;
