// blog_posts 의 미분석 글을 Claude 로 분석해 candidates 를 만든다(`pnpm data:analyze`). docs/todo/03-analyze-and-review.md 가 정본.
// 글 하나의 흐름: 본문 받기(naverPostBody) → 장소 추출(extractPlaces) → **교차점검(verifyPlaces, 조건 문장 없는 후보만)** →
// 좌표·주소 보강(naverLocal, 키 있을 때만) → 기존 장소와 대조(matchPlace) → 공식 홈페이지 카드(homepageCard, link 가 업체 사이트일 때만) → candidates insert → blog_posts.analyzed_at.
// 판별·조립 규칙은 scripts/analyze/analyzeCandidates.mjs 의 순수 함수에 있고 여기는 I/O 와 순서뿐이다.
//
//  - **Claude 를 세 번 부른다.** 셋째(제안, `proposePlaces.mjs`)는 루프가 끝난 뒤 갱신 후보가 생긴 장소마다 한 번이다(`--no-propose`).
//    두 번째(교차점검)는 "동반 조건 문장이 없는" 후보에만, 글 하나당 한 번이다. 추출 패스는
//    "반려견 동반 여행 블로그" 를 전제로 읽으므로 강아지를 두고 들른 일반 카페도 장소로 뽑는다 — 그 전제를 뒤집어
//    다시 읽는 것이 두 번째 패스의 일이다(verifyPlaces.mjs 머리 주석). 끄려면 `--no-verify`.
//
// 왜 이렇게 생겼나 —
//  - 본문은 그 자리에서만 읽고 버린다. DB 에도 로그에도 남기지 않는다(docs/todo/02 의 저작권·약관 기준). evidence(인용문)도 본문이라
//    로그에 찍지 않는다 — 후보 이름·종류·구간·confidence·이유만.
//  - 기존 장소는 **상태를 가리지 않고 전부** 읽는다(2026-09-29). draft 를 포함하는 이유는 지난 실행이 draft 로 넣은 가게를
//    또 신규로 만들면 같은 가게가 두 번 뜨기 때문이고, **archived 까지** 포함하는 이유는 내린 곳(소프트 삭제)을 쓴 새 글이
//    '신규' 가 되면 승인 한 번에 같은 가게가 새 id 로 되살아나기 때문이다. published 만 보는 pull-db.mjs 와 다른 점이다.
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
//  - 같은 가게의 신규 후보가 두 번 나와도(이번 실행이든 앞선 실행의 pending 이든) 둘 다 넣는다 — 지우지 않고 **두 번째가 첫 번째를
//    `dupOf` 로 가리킨다**(글 URL 또는 후보 id). 이름 키가 같으면 그대로, 키가 다르면 지점 표기만 다른 같은 건물이거나 같은 자리
//    (`newSiblingOf`)일 때 먼저 난 쪽의 키를 물려받는다 — 검수 화면은 키로 묶으므로 그래야 한 줄로 선다.
//  - `--dry-run` 은 DB 에 쓰지 않는다(analyzed_at 도). Claude 는 부른다 — 토큰은 쓰인다. 무엇이 후보가 되는지 보는 용도.
//  - 로그에 시크릿·응답 본문·헤더·본문 텍스트를 남기지 않는다(docs/todo/05). 글 URL·제목, 후보 요약 한 줄, error.message 만.
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import {
  blockFor,
  blockUntilLabel,
  editedKey,
  editedKeysFor,
  exclusionReason,
  formatCandidateLine,
  keyGate,
  formatSummary,
  parseArgs,
  pickPostsForRun,
  isFocusedTitle,
  isNoPetEvidenceNew,
  mergeFocusedFirst,
  newSiblingOf,
  deferBlogs,
  singlePlaceBlogs,
  PET_TITLE_SOURCE,
  JEJU_TITLE_SOURCE,
  LISTY_TITLE_SOURCE,
  TOPIC_TITLE_SOURCE,
  resolveRegionRaw,
  kindOf,
  tierOf,
  toCandidateRow,
  toMatchCandidate,
  toPostAnalysis,
} from './analyze/analyzeCandidates.mjs';
import { createUsageMeter, extractPlaces, isFatal, isRetryable, MODEL, PROMPT_VERSION, runClaudeCli } from './analyze/extractPlaces.mjs';
import { formatGeocodeSummary, geocodeAddress, newGeocodeReasons, pickGeocoded, shouldGeocode } from './analyze/naverGeocode.mjs';
import { newPickReasons, pickNaverPlace, searchNaverPlace } from './analyze/naverLocal.mjs';
import { matchPlace, normalizeName, siOf, townOf } from './analyze/matchPlace.mjs';
import { fetchHomepageCard } from './analyze/homepageCard.mjs';
import { fetchPostText } from './analyze/naverPostBody.mjs';
import { needsDogCheck, resolveVerifyModel, verifyLabel, VERIFY_PROMPT_VERSION, verifyPlaces } from './analyze/verifyPlaces.mjs';
import { PROPOSE_PROMPT_VERSION, proposalTargets, proposeForPlace, resolveProposeModel } from './analyze/proposePlaces.mjs';
import { toMatchablePlace } from './lib/placeFields.mjs';
import { loadNaverEnvFile } from './lib/naverEnvFile.mjs';
import { naverKeyPairProblem } from './lib/naverKeyFormat.mjs';
import { readHidden } from './lib/readHidden.mjs';
import { acquireRunLock } from './lib/runLock.mjs';
import { createSupabase } from './lib/supabaseClient.mjs';

let args;
try {
  args = parseArgs(process.argv.slice(2));
} catch (e) {
  console.error(`${e.message} — 사용법: pnpm data:analyze [--limit N] [--max-per-blog N] [--no-geo] [--no-verify] [--no-propose] [--no-homepage] [--focused-only] [--dry-run] [--dump[=경로]]`);
  process.exit(1);
}
const { limit, dryRun, dump, maxPerBlog, noGeo, noVerify, noPropose, noHomepage, focusedOnly } = args;
console.log(dryRun ? '모드: dry-run — DB 에 쓰지 않는다(Claude 는 부른다)' : '모드: 분석 — candidates · blog_posts.analyzed_at 에 쓴다');

// 한 번에 하나만(`runLock.mjs`) — 둘이 돌면 시작할 때 같은 미분석 글을 골라 같은 후보를 두 번 넣는다. 워크트리가 달라도 DB 는 하나라 잠금은 레포 밖(tmpdir)에 둔다.
// dry-run 은 쓰지 않으므로 잠그지 않는다.
if (!dryRun) {
  const lock = acquireRunLock(join(tmpdir(), 'zgnn-data-analyze.lock'));
  if (!lock.ok) {
    console.error(`다른 data:analyze 가 이미 돌고 있다(pid ${lock.holder ?? '?'}) — 끝난 뒤 다시 실행. 같은 글을 두 번 분석해 후보가 겹친다.`);
    process.exit(1);
  }
  process.on('exit', lock.release);
}

// 좌표 보강은 **02(수집)과 같은 네이버 키**를 쓴다 — 키를 하나 더 발급·관리하지 않는다(ADR-008 v4).
// env 가 먼저고, 없으면 **사람 터미널에서만** 숨김 입력으로 받는다(`collect-blog.mjs` 와 같은 모양).
// 값은 이 프로세스 안에만 있고 어디에도 남기지 않는다(ADR-016).
//
// 예전에는 키가 없으면 로그 한 줄만 찍고 그냥 돌았다. 그 결과가 2026-09-28 의 첫 실행이다 —
// 글 50건을 다 읽고 Claude 한도를 쓴 뒤에야 좌표 0건인 걸 알았고, 후보 160건을 통째로 버렸다.
// 그래서 **기본을 뒤집는다**: 이름 축의 키가 없고 물을 수도 없으면 Claude 를 부르기 전에 멈춘다
// (마이그레이션 검사와 같은 어법 — 비싼 자원을 쓰기 전에 값싼 검사를 몰아 둔다). 좌표 없이 돌리려면 `--no-geo`.
// 두 축의 세기가 왜 다른지는 `keyGate` 의 주석에 있다.
//
// 앞뒤 공백을 턴다 — `export NAVER_CLIENT_ID=' xxx '` 한 줄이 그대로 401 이 되는데, 숨김 입력이라
// 붙여넣기가 끌고 온 공백을 사람이 볼 방법이 없다(2026-09-28 에 실제로 여기서 막혔다 → BUG-006).
const trimKey = (v) => (typeof v === 'string' ? v.trim() : v);
// 에이전트 세션에서는 묻지 않는다 — 입력한 값이 대화 기록에 실린다. env 로 넘어온 값은 그대로 쓴다(경계는 "누가 돌리나" 가 아니라 "값이 기록에 실리나").
const canPrompt = Boolean(process.stdin.isTTY && process.stdout.isTTY && !process.env.CLAUDECODE);
let rawModeGuarded = false;

/**
 * 키 **모양** 게이트(`naverKeyFormat.mjs`). 상태 코드가 없는 실패(헤더에 한글 → ByteString 오류)는 401 게이트를 지나쳐
 * "좌표 없이 진행" 으로 흐르므로, 부르기 전에 막는다. 이름 축은 멈추고(키가 없을 때와 같은 세기), 주소 축은 끈다.
 */
function checkedKeys(axis, names, keys) {
  const problem = naverKeyPairProblem(names, keys);
  if (!problem) return keys;
  if (axis === 'search') {
    console.error(`네이버 키 모양이 틀렸다: ${problem} — 고친 뒤 다시 실행하거나, 좌표 없이 돌릴 작정이면 --no-geo 를 붙인다.`);
    process.exit(1);
  }
  console.log(`  ${problem} — 주소→좌표 보강(두 번째 축)을 건너뛴다`);
  return null;
}

/**
 * 한 축의 키 두 개를 정한다. env → (사람 터미널이면) 숨김 입력 → 판정.
 * @param {'search'|'map'} axis
 * @param {[string, string]} names  env 이름 두 개(id, secret)
 * @returns {Promise<{ clientId: string, clientSecret: string } | null>}
 */
async function resolveKeys(axis, names) {
  const [idName, secretName] = names;
  let clientId = trimKey(process.env[idName]);
  let clientSecret = trimKey(process.env[secretName]);
  const gate = keyGate(axis, { hasKeys: Boolean(clientId && clientSecret), noGeo, canPrompt });

  if (gate === 'use') return checkedKeys(axis, names, { clientId, clientSecret });
  if (gate === 'stop') {
    console.error(
      `${idName} · ${secretName} 없음 — 좌표 없이 대조하면 동명 가게가 '확인요청' 이 아니라 '일치' 로 올라간다.\n` +
        'env 로 넘기거나 사람 터미널에서 돌려라(숨김 입력). 좌표 없이 돌릴 작정이면 --no-geo 를 붙인다.',
    );
    process.exit(1);
  }
  if (gate === 'skip') return null;

  // 예외로 빠져나가도 터미널이 raw 모드에 남지 않게(collect-blog.mjs · login.mjs 와 같다).
  if (!rawModeGuarded) {
    rawModeGuarded = true;
    process.on('exit', () => { try { process.stdin.setRawMode(false); } catch { /* TTY 아님 */ } });
  }
  try {
    // 둘 중 하나만 env 에 있으면 없는 쪽만 묻는다.
    if (!clientId) clientId = trimKey(await readHidden(`${idName}(숨김 입력${axis === 'map' ? ' · 비우면 건너뜀' : ''}): `));
    if (clientId && !clientSecret) clientSecret = trimKey(await readHidden(`${secretName}(숨김 입력): `)); // id 를 비웠으면 secret 은 묻지 않는다
  } catch {
    // Ctrl-C/Ctrl-D — readHidden 이 reject 한다. **축 하나를 끄는 게 아니라 실행을 끝낸다**(collect-blog.mjs:53 과 같다).
    // 여기서 null 을 돌려주고 계속 가면, 멈추려고 Ctrl-C 를 누른 사람이 좌표 없는 분석을 통째로 돌리게 된다 — 이 게이트가 막으려던 바로 그것이다.
    process.exit(130);
  }
  if (clientId && clientSecret) return checkedKeys(axis, names, { clientId, clientSecret });

  // 비어 있는 **이름**을 말한다(값은 절대 아니다) — id 를 비운 사람은 secret 프롬프트를 본 적이 없어 무엇을 다시 쳐야 하는지 모른다.
  const empty = [!clientId && idName, !clientSecret && secretName].filter(Boolean).join(' · ');
  if (axis === 'search') {
    // 빈 엔터를 '건너뛰기' 로 받으면 `--no-geo` 말고 **두 번째 옵트아웃**이 생긴다 — 붙여넣기가 실패해 `*` 가 0개인 것도 같은 모양이라
    // 사람이 의도한 건너뛰기와 구별되지 않는다. 좌표 없이 돌리는 길은 하나여야 하고, 그것은 명시하는 쪽(`--no-geo`)이다.
    console.error(`네이버 키가 비었다: ${empty} — 다시 실행해 입력하거나, 좌표 없이 돌릴 작정이면 --no-geo 를 붙인다.`);
    process.exit(1);
  }
  console.log(`  ${empty} 를 비웠다 — 주소→좌표 보강(두 번째 축)을 건너뛴다`);
  return null;
}

// Claude 인증은 env 로 검사하지 않는다 — 이 머신에 로그인된 `claude`(키체인)를 CLI 가 스스로 읽는다. 토큰 env 는 없다(ADR-016).
// 안 돼 있으면 첫 글에서 ClaudeCliError(auth, fatal) 가 나와 루프가 끊긴다.
// ANALYZE_MODEL 이 조용히 무시되는 일이 없게 실제로 쓰는 모델을 한 번 찍는다.
console.log(`모델 ${MODEL} · 프롬프트 ${PROMPT_VERSION} · 글 최대 ${limit}건 · 블로그당 최대 ${maxPerBlog || '무제한'}건`);
// 후보(extracted.meta)와 글(blog_posts.analysis)에 실린다 — 프롬프트를 고친 뒤 재분석 대상을 고르는 키.
const meta = { model: MODEL, promptVersion: PROMPT_VERSION };

const supabase = createSupabase();
const meter = createUsageMeter('추출');
/*
 * 교차점검(`verifyPlaces.mjs`)의 계량기를 **따로** 든다. 합쳐 세면 구독 5시간 한도를 무엇이 태웠는지 가릴 수 없고,
 * 이 패스는 글마다 최대 한 번 더 부르므로 그 값이 곧 "`--limit` 을 얼마로 나눌까" 의 근거다.
 */
const verifyMeter = createUsageMeter('교차점검');
if (noVerify) console.log('--no-verify — 교차점검을 하지 않는다(조건 문장 없는 후보에 동반 근거 표식이 붙지 않는다)');
else console.log(`교차점검 모델 ${resolveVerifyModel()} · 프롬프트 ${VERIFY_PROMPT_VERSION} (조건 문장 없는 후보가 있는 글에서만 돈다)`);
/*
 * 한 번 실패하면 **이 실행 동안 패스를 내린다** — 주소→좌표 축(`geocodeAxisOff`)과 같은 정책이고 이유도 같다:
 * 이 패스는 표식을 더하기만 하므로 죽어도 결과가 어제까지의 동작으로 돌아갈 뿐이고, 남은 글마다 같은 실패로
 * 한도를 더 태울 이유가 없다. 인증·CLI 없음(fatal)은 여기 오지 않고 루프를 끊는다.
 */
let verifyAxisOff = false;
/*
 * 셋째 패스 「제안」(`proposePlaces.mjs`, docs/todo/11 U3) — 이번 실행에서 **갱신 후보가 생긴 장소마다 한 번**, 루프가 끝난 뒤에 돈다.
 * 계량기를 따로 든다(교차점검과 같은 이유). 실패하면 이 실행 동안 내린다 — 제안은 더하기만 하는 값이라 후보는 그대로 남고,
 * 화면은 그 묶음을 `제안 없음` 으로 그린다.
 */
const proposeMeter = createUsageMeter('제안');
if (noPropose) console.log('--no-propose — 제안 패스를 끈다(갱신 묶음이 `제안 없음` 으로 남는다)');
else console.log(`제안 모델 ${resolveProposeModel()} · 프롬프트 ${PROPOSE_PROMPT_VERSION} (갱신 후보가 생긴 장소에서만 돈다)`);
/** 장소 id → 이번 실행에서 만든 갱신 후보 행들(글 날짜를 얹어). dry-run 은 DB 대신 이것으로 제안을 만든다. */
const updatedPlaces = new Map();

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

/*
 * 홈페이지 카드는 places 에 세 칸(마이그레이션 20260930120000)이 있어야 반영된다. 칸이 없는데 카드 든 후보를 만들면 그 후보의
 * **승인(insert)이 통째로 실패한다** — 그래서 멈추지 않고 카드만 끈다(이 값은 더하기만 하는 값이다).
 */
let homepageOff = noHomepage;
if (!homepageOff) {
  const { error } = await supabase.from('places').select('homepage_url').limit(1);
  if (error) {
    homepageOff = true;
    console.log('places.homepage_url 이 없다 — 공식 홈페이지 카드를 끈다(supabase/migrations/20260930120000_places_homepage.sql 을 적용하면 켜진다)');
  }
} else console.log('--no-homepage — 공식 홈페이지 카드를 읽지 않는다');

/*
 * 키는 **세션·마이그레이션 검사 뒤에** 묻는다(`collect-blog.mjs:22` 가 같은 이유로 같은 순서다).
 * 먼저 물으면 키 넷을 치고 나서 "pnpm data:login" 이나 "마이그레이션을 적용해라" 로 멈춰 그 입력이 통째로 헛수고가 된다.
 */
if (noGeo) console.log('--no-geo — 좌표·주소 보강을 하지 않는다(후보는 이름·종류로만 대조된다)');
// env 에 없는 네이버 키는 사용자 홈의 파일에서 얹는다(레포 밖 · 이름 넷 고정 · 600 — lib/naverEnvFile.mjs). 그래야 에이전트 세션·재실행이 숨김 입력 없이 돈다.
try {
  const fromFile = loadNaverEnvFile();
  if (fromFile.loaded.length) console.log(`네이버 키: ${fromFile.path} 에서 ${fromFile.loaded.join(' · ')}`);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
const naverKeys = await resolveKeys('search', ['NAVER_CLIENT_ID', 'NAVER_CLIENT_SECRET']);
// 두 번째 축(주소 → 좌표)의 키는 **검색 키가 아니다** — NCP 콘솔의 Maps Application 쪽이고 헤더 이름만 같다(lib/naverMapsApi.mjs 의 표).
// 검색 키를 여기 넣으면 그냥 401 이라, env 이름을 갈라 두는 것이 그 혼동의 유일한 방어다(BUG-006 이 같은 함정이었다).
const mapKeys = await resolveKeys('map', ['NAVER_MAP_CLIENT_ID', 'NAVER_MAP_CLIENT_SECRET']);
if (!mapKeys && !noGeo) console.log('주소→좌표 보강(두 번째 축)은 꺼져 있다 — 이름 축만 돈다');

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

// 최신 글부터 — 다만 **제목이 한 가게 후기로 보이는 글을 먼저**(`isFocusedTitle`, 2026-10-02). 목록·일정 글, 장소 없는 주제 글, 반려동물 말이 없는 글은
// 지우지 않고 뒤로 미룬다 — 앞 줄이 비면 같은 실행에서 이어서 읽는다. 오래된 글이 계속 밀리는 건 감수한다.
// limit 보다 넉넉히 읽는 이유 — 한 블로그의 글을 maxPerBlog 건으로 자르면(pickPostsForRun) 빈 자리를 다음 글이 채워야 한다.
const postWindow = maxPerBlog > 0 ? Math.min(limit * 4, 400) : limit;
const unanalyzed = () =>
  supabase
    .from('blog_posts')
    .select('url, blog_id, log_no, title, keyword, posted_at')
    .is('analyzed_at', null)
    .order('posted_at', { ascending: false });
const { data: focusedPosts, error: focusedError } = await unanalyzed()
  .filter('title', 'imatch', PET_TITLE_SOURCE)
  .filter('title', 'match', JEJU_TITLE_SOURCE)
  .not('title', 'imatch', LISTY_TITLE_SOURCE)
  .not('title', 'imatch', TOPIC_TITLE_SOURCE)
  .limit(postWindow);
if (focusedError) throw new Error(`blog_posts 조회 실패(집중 글): ${focusedError.message}`);
// 한 가게만 되풀이하는 블로그(`singlePlaceBlogs`)의 글은 집중이어도 맨 뒤로 — 그 블로그의 분석 끝난 글만 읽는다.
const singlePlace = new Set();
async function noteSinglePlaceBlogs(fetched) {
  const blogIds = [...new Set(fetched.map((post) => post.blog_id).filter(Boolean))];
  if (blogIds.length === 0) return;
  const { data, error } = await supabase.from('blog_posts').select('blog_id, analysis').in('blog_id', blogIds).not('analyzed_at', 'is', null);
  if (error) throw new Error(`blog_posts 조회 실패(블로그 이력): ${error.message}`);
  for (const blogId of singlePlaceBlogs(data)) singlePlace.add(blogId);
}
await noteSinglePlaceBlogs(focusedPosts);
let fetchedPosts = focusedPosts;
let droppedSinglePlace = 0; // --focused-only 가 아예 뺀 한 가게 블로그 글 수(로그용)
if (focusedOnly) {
  // 앞줄만 — 한 가게 블로그의 글도 뺀다(그것도 '뒤' 다).
  fetchedPosts = focusedPosts.filter((post) => !singlePlace.has(post.blog_id));
  droppedSinglePlace = focusedPosts.length - fetchedPosts.length;
} else if (pickPostsForRun(focusedPosts.filter((post) => !singlePlace.has(post.blog_id)), limit, maxPerBlog).length < limit) {
  const { data: restPosts, error: restError } = await unanalyzed().limit(postWindow + focusedPosts.length);
  if (restError) throw new Error(`blog_posts 조회 실패: ${restError.message}`);
  await noteSinglePlaceBlogs(restPosts);
  fetchedPosts = mergeFocusedFirst(focusedPosts, restPosts);
}
fetchedPosts = deferBlogs(fetchedPosts, singlePlace);
const posts = pickPostsForRun(fetchedPosts, limit, maxPerBlog);
// 앞줄이 비면 끝 — 반복 실행(`for … || break`)이 빈 실행을 되풀이하지 않게 exit 1 로 알린다.
if (focusedOnly && posts.length === 0) {
  console.log('앞줄(--focused-only)에 남은 글이 없다 — 끝.');
  process.exit(1);
}

// 지금 규모(86곳 + 신규 draft 몇)는 supabase-js 기본 1000행 제한에 한참 못 미친다 — 늘어나면 range() 로 페이지네이션.
// **archived 를 빼지 않는다**(2026-09-29). 빼면 내린 곳(소프트 삭제)을 쓴 새 글이 '신규' 로 판정돼, 승인 한 번에
// 같은 가게가 새 id 로 되살아난다. 짝이 잡혀야 `apply-approved` 의 archived 가드와 /admin 의 '되살려서 합치기' 가
// 일할 자리가 생긴다 — 대조 corpus 는 세 곳(여기 · apply-approved.mjs:58 · src/lib/adminCandidates.ts)이 같아야 한다.
// `.order('id')` 는 동점 승자를 고정한다 — 순서가 없으면 UPDATE 한 번이 heap 순서를 바꿔 같은 후보가 다른 짝을 얻는다.
const { data: placeRows, error: placesError } = await supabase.from('places').select('*').order('id');
if (placesError) throw new Error(`places 조회 실패: ${placesError.message}`);
const existing = placeRows.map(toMatchablePlace);
// 차이 게이트가 짝의 지금 값을 본다(`kindOf`) — 짝 id → 행.
const placeById = new Map(placeRows.map((row) => [row.id, row]));
// 짝짓기 뒤 제외 이유의 로그 말(`kindOf`).
const EXCLUDE_LABEL = { sameAsSite: '사이트와 같은 말', stale: '확인 날짜보다 옛 글', weak: '근거 약함(방문 안 함·동반 근거 없음)' };
// 86곳이 있어야 정상이다. 비어 있으면 다른 프로젝트·잘못된 키다 — 그대로 가면 후보 전부가 '신규' 로 기록된다(리뷰 지적).
if (existing.length === 0) {
  console.error('places 가 비어 있다 — link 된 프로젝트(supabase/.temp/project-ref)가 맞는지 확인. 후보를 만들지 않고 멈춘다.');
  process.exit(1);
}

// 이전 실행의 pending 후보 이름을 미리 읽어 같은 가게가 또 나오면 dupOf 로 묶는다(2026-09-28 설계 검토 NQ-8 — 첫 분석에서 같은 펜션이 13건).
// 옛 후보(nameKey 없음)는 이름으로 계산한다. 넣지 않는 게 아니라 **표시만** 한다 — evidence 가 다른 글이라 검수에 쓸모가 있다.
const { data: pendingRows, error: pendingError } = await supabase.from('candidates').select('id, post_url, reviewer_note, extracted').eq('status', 'pending').limit(1000);
if (pendingError) throw new Error(`candidates 조회 실패: ${pendingError.message}`);
// 차단 목록(`place_blocks`, ADR-020 D1·D2) — 걸린 가게는 후보를 만들지 않는다. 만료는 스케줄러가 아니라 **읽는 순간의 비교**다(`blockFor`).
// 표는 마이그레이션이 원격에 적용돼야 생긴다(🧑 `supabase db push`). 조회가 실패하면(표 없음 등) **실행을 멈추지 않고** 차단 0건으로 가되 경고 한 줄 —
// 아니면 적용 전에 분석이 통째로 못 돈다. dry-run 도 이 조회는 한다(읽기다).
let blocks = [];
const { data: blockRows, error: blocksError } = await supabase.from('place_blocks').select('name_key, town, until, lifted_at');
if (blocksError) console.warn(`⚠ place_blocks 조회 실패 — 차단 0건으로 진행한다(마이그레이션 미적용이면 정상): ${blocksError.message}`);
else blocks = blockRows ?? [];
// 사람이 고친 pending 후보의 (글, 가게) — 같은 글을 다시 읽어도 그 가게는 새로 만들지 않는다(D3·T2.2). 옆에 AI 판단이 또 한 벌 붙지 않게.
const editedKeys = editedKeysFor(pendingRows);
const newNamesSeen = new Map(); // nameKey → 먼저 난 pending 후보 id(이전 실행) 또는 글 URL(이번 실행)
// 이름 키가 다른 같은 가게의 신규 후보 — 지점 표기만 다른 같은 건물("레스토랑 성산점" ↔ "레스토랑 제주성산점")이거나 같은 자리("본카페" ↔ "애월본카페").
// 위 Map 으로는 못 만난다. 검수 묶음은 `nameKey` 로 묶이므로(`groupCandidates`) 찾으면 `dupOf` 와 함께 **먼저 난 쪽의 키를 물려준다**(`newSiblingOf`).
// 좌표·주소 둘 다 없는 후보는 대상이 아니다.
const newPlacesSeen = []; // { key, name, type, geo, address, ref }
for (const row of pendingRows) {
  const key = row.extracted?.nameKey ?? normalizeName(row.extracted?.name ?? '');
  if (key && !newNamesSeen.has(key)) newNamesSeen.set(key, row.id);
  if (key && (row.extracted?.geo || row.extracted?.address) && (row.extracted?.match?.tier ?? 'new') === 'new') {
    newPlacesSeen.push({ key, name: row.extracted.name, type: row.extracted.type ?? null, geo: row.extracted.geo ?? null, address: row.extracted.address ?? null, ref: row.id });
  }
}

console.log(
  `미분석 글 ${posts.length}건(집중 ${posts.filter((post) => isFocusedTitle(post.title)).length} · 나머지 ${posts.filter((post) => !isFocusedTitle(post.title)).length} — 읽은 ${fetchedPosts.length}건 중 블로그당 ${maxPerBlog || '무제한'}건 · 한 가게 블로그 ${singlePlace.size}곳 글 ${droppedSinglePlace || fetchedPosts.filter((post) => singlePlace.has(post.blog_id)).length}건 ${focusedOnly ? '뺌' : '뒤로'}) · 기존 장소 ${existing.length}곳(archived 제외) · pending 후보 ${pendingRows.length}건`,
);

// 네이버가 잠깐 죽었다고 글 전체를 버리지 않는다 — 실패하면 좌표 없이 간다(status 만 로그). 단 401/403 은 키가 틀린 것이라 실행을
// 세운다: 조용히 이름만으로 대조하면 같은 이름의 다른 가게가 ask 대신 auto 로 올라간다(리뷰 지적). 검색 사이 200ms 는 collect-blog.mjs 와 같은 예의.
// 좌표 보강이 실제로 무슨 일을 했는지 — 실행 끝에 한 줄 찍는다(아래 요약).
const naverStats = { searched: 0, picked: 0, failed: 0 };

/*
 * 공식 홈페이지 카드(ADR-002 v2). 이름 축이 준 link 가 있을 때만 업체 사이트를 **한 번** 읽는다 — 네이버·SNS·예약 플랫폼 링크는
 * 부르지도 않는다(`homepageUrlOf`). 실패는 카드 없이 넘어간다: 판정·대조에 쓰이지 않는 '더하기만 하는' 값이라 실행을 세울 이유가 없다.
 * 같은 link 는 한 실행에 한 번만 읽는다 — 같은 가게가 여러 글에 나오는 것이 보통이다(첫 분석에서 한 펜션이 13번).
 */
const homepageStats = { tried: 0, card: 0, image: 0, failed: 0 };
const homepageCache = new Map();
async function readHomepage(link) {
  if (homepageOff || !link) return null;
  if (homepageCache.has(link)) return homepageCache.get(link);
  let card = null;
  try {
    card = await fetchHomepageCard(link);
    if (card) {
      homepageStats.tried++;
      homepageStats.card++;
      if (card.image) homepageStats.image++;
    }
  } catch (e) {
    homepageStats.tried++;
    homepageStats.failed++;
    // 응답 본문은 찍지 않는다 — status 나 타임아웃 이름뿐이다.
    console.log(`    홈페이지 읽기 실패(${e.name === 'TimeoutError' ? '시간 초과' : e.message}) — 카드 없이 간다`);
  }
  homepageCache.set(link, card);
  return card;
}
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

async function enrichWithNaver(name, { town, si }) {
  if (!naverKeys) return null;
  try {
    const items = await searchNaverPlace(name, naverKeys);
    naverStats.searched++;
    const picked = pickNaverPlace(items, { name, town, si }, pickReasons);
    if (picked) naverStats.picked++;
    return picked;
  } catch (e) {
    if (e?.status === 401 || e?.status === 403) {
      // **값보다 상품을 먼저 말한다**(2026-09-30 실측). 같은 키로 `collect`(블로그 검색)는 200 인데 여기(지역 검색)만 401 인 일이 실제로 있었다 —
      // API HUB 는 Application 에 검색 API 를 **하나씩** 추가하는 구조라, 값이 멀쩡해도 「지역」 이 없으면 이 축만 401 이다.
      // 값부터 의심하게 두면 멀쩡한 키를 다시 발급받게 된다(BUG-006 이 막으려던 종류의 헛수고).
      throw Object.assign(
        new Error(
          `네이버 인증 실패(status=${e.status}) — ① NCP 콘솔(API HUB)의 그 Application 에 **「지역」 검색이 추가돼 있는지** ` +
            '(블로그만 추가돼 있으면 collect 는 되고 여기만 401 이다) ② 그 다음 NAVER_CLIENT_ID · NAVER_CLIENT_SECRET 값. ' +
            '좌표 없이 대조하면 판정이 흐려져 실행을 멈춘다 — 좌표 없이 돌릴 작정이면 --no-geo',
        ),
        { fatal: true },
      );
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

const runStartedAt = new Date();
const stats = { analyzed: 0, skipped: 0, dropped: 0, candidates: 0, auto: 0, ask: 0, new: 0, dup: 0, edited: 0, update: 0, fill: 0, excluded: { other: 0, notJeju: 0, notAllowed: 0, sameAsSite: 0, stale: 0, weak: 0, blocked: 0, noPetEvidence: 0 }, verify: { checked: 0, noEvidence: 0, notAllowed: 0, failed: 0 } };
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

    /*
     * 교차점검 — **후보가 될 것 중 동반 조건 문장이 없는 것**만 묶어 한 번 부른다. 제외될 장소(제주 아님·other·
     * 동반 불가)를 넣지 않는 이유는 쿼터가 아니라 의미다: 버릴 것에 근거를 물어 봐야 아무 결정도 안 바뀐다.
     * 실패는 이 글을 버리지 않는다(`verifyAxisOff`) — 판단이 없는 후보는 `verify: null`(미점검)로 남는다.
     */
    const verifyTargets = noVerify || verifyAxisOff ? [] : places.filter((p) => !exclusionReason(p) && needsDogCheck(p));
    let verdicts = new Map();
    if (verifyTargets.length > 0) {
      const names = verifyTargets.map((p) => p.name);
      try {
        verdicts = await verifyPlaces(runClaudeCli, post, body, names, verifyMeter);
        stats.verify.checked += verdicts.size;
        // 판단의 `why`·`quote` 는 본문에서 파생된 것이라 찍지 않는다(evidence 와 같은 규칙, 05). 이름과 표식만.
        for (const [key, verdict] of verdicts) {
          const label = verifyLabel(verdict);
          if (label === '동반 근거 없음') stats.verify.noEvidence += 1;
          if (label === '동반 불가 정황') stats.verify.notAllowed += 1;
          if (label !== '동반 확인' && label !== '동반 표기만') console.log(`  교차점검 ${names.find((n) => normalizeName(n) === key) ?? key} — ${label}`);
        }
      } catch (e) {
        if (isFatal(e)) throw e;
        stats.verify.failed += verifyTargets.length;
        verifyAxisOff = true;
        console.error(`  교차점검 실패 — 이 실행 동안 패스를 내린다(후보는 미점검으로 남는다): ${e.message}`);
      }
    }

    const rows = [];
    const excluded = [];
    for (const extracted of places) {
      const reason = exclusionReason(extracted);
      /*
       * 동반 불가(`notAllowed`)는 **바로 버리지 않는다** — 그 가게가 이미 게시된 곳이면 "이제 안 받는다" 는 갱신 신호다(11 T1.1 메모의 구멍).
       * 짝을 찾아 게시된 곳과 확실히 같을 때만(`auto` + `published`) 갱신 후보로 올리고, 아니면 아래에서 지금처럼 `notAllowed` 로 뺀다.
       * 신규 가게의 동반 불가는 여전히 후보가 아니다(BUG-008 — 조건 없는 장소가 '갈 수 있어요' 로 읽힌다).
       */
      const denied = reason === 'notAllowed';
      if (reason && !denied) {
        excluded.push({ extracted, reason });
        stats.excluded[reason] += 1;
        const why = reason === 'notJeju' ? ' · 제주 아님' : reason === 'notAllowed' ? ' · 동반 불가' : '';
        console.log(`  제외 ${extracted.name} (${extracted.type}${why})`);
        continue;
      }
      const block = blockFor(extracted, blocks, runStartedAt);
      if (block) {
        excluded.push({ extracted, reason: 'blocked' });
        stats.excluded.blocked += 1;
        console.log(`  제외 ${extracted.name} · 차단(${blockUntilLabel(block)})`);
        continue;
      }
      if (editedKeys.has(editedKey(post.url, extracted.nameKey ?? normalizeName(extracted.name)))) {
        excluded.push({ extracted, reason: 'edited' });
        stats.edited += 1;
        console.log(`  제외 ${extracted.name} · 사람이 고친 후보가 있음`);
        continue;
      }
      // 같은 이름이 여럿일 때 AI 가 읽은 읍·면(regionRaw 또는 본문 주소)이 검색 결과를 고르는 힌트다 — 우도 카페살레 vs 본섬 동명(리뷰 지적).
      // 네이버 지역 검색은 display 상한이 5 라(Kakao 는 15) 동명 구분이 더 약하다 — 이 힌트가 그만큼 중요해졌다.
      // 시는 주소가 우선이다 — regionRaw 는 "동쪽 (성산읍)" 처럼 시가 없는 꼴이 보통이다. 다른 지역의 동명 가게는 받지 않는다(`pickNaverPlace`).
      let local = await enrichWithNaver(extracted.name, {
        town: townOf(extracted.regionRaw) ?? townOf(extracted.address),
        si: siOf(extracted.address) ?? siOf(extracted.regionRaw),
      });
      // 이름 축이 못 붙였을 때만 주소 축으로 물러선다 — 이름으로 찾은 업체 쪽이 좌표 말고 category 까지 주므로 항상 우선이다.
      if (!local) {
        // `chance` 는 **이름 축이 실제로 찾아보고 못 붙인** 수다. 검색 키가 없으면 이름 축은 아무것도 보지 않았으므로 세지 않는다 —
        // 안 세면 요약이 "이름 축이 좌표를 못 붙인 후보 N건" 을 후보 전체 수로 뻥튀기한다(리뷰 지적).
        if (naverKeys) geocodeStats.chance++;
        local = await enrichWithGeocode(extracted.address);
      }
      // regionRaw 는 주소 기반이 우선(analyzeCandidates.mjs). 주소는 네이버 → 본문 순.
      const regionRaw = resolveRegionRaw(local?.address ?? extracted.address, extracted.regionRaw, existing, extracted.name);
      const matched = matchPlace(toMatchCandidate(extracted, local), existing);
      const key = normalizeName(extracted.name);
      const geo = local ? { lat: local.lat, lng: local.lng } : null;
      const address = local?.address ?? extracted.address ?? null;
      const sibling = tierOf(matched) === 'new' && !newNamesSeen.has(key) ? newSiblingOf({ name: extracted.name, type: extracted.type ?? null, geo, address }, newPlacesSeen) : null;
      const dupOf = tierOf(matched) === 'new' ? (newNamesSeen.get(key) ?? sibling?.ref ?? null) : null;
      const row = toCandidateRow(post, extracted, local, regionRaw, matched, {
        meta,
        dupOf,
        // 물어보지 않은 후보는 `null`(미점검)이다 — `?? null` 이 그 뜻을 지킨다.
        verify: verdicts.get(normalizeName(extracted.name)) ?? null,
        homepage: await readHomepage(local?.naverLink),
      });
      /*
       * 차이 게이트(`kindOf`, docs/todo/11 U1) — 게시된 곳을 쓴 글은 **사이트와 다른 말을 할 때만** 후보가 된다.
       * 같은 말 · 옛 글(확인 날짜 전) · 근거 약함(목록글 · 동반 근거 없음)은 후보를 만들지 않고 이유를 남긴다.
       * 추출·네이버 조회는 이미 끝난 뒤라 **아끼는 것은 비용이 아니라 운영자가 훑을 줄 수**다 — 그래서 조용히 넘기지 않고
       * 이름·짝을 한 줄 찍고 `analysis.excluded` 에도 남긴다. 안 남기면 "왜 이 글에서 후보가 0건이지" 의 답이 사라진다.
       * 짝 행은 위에서 읽은 `placeRows` 에서 찾는다(새 조회 없음). `verified_at` 칸이 없는 원격에선 undefined → 날짜 규칙이 안 걸린다.
       */
      const kind = kindOf(matched, row.extracted, placeById.get(matched.match?.id) ?? null, { postedAt: post.posted_at });
      // 동반 불가 글은 게시된 짝에 붙는 갱신일 때만 후보다 — 그 밖(신규·애매한 짝·초안·내린 곳·옛 글·목록글)은 지금처럼 `notAllowed` 로 뺀다.
      if (denied && (kind.exclude || kind.kind !== 'update' || matched.match?.status !== 'published')) {
        excluded.push({ extracted, reason: 'notAllowed' });
        stats.excluded.notAllowed += 1;
        console.log(`  제외 ${extracted.name} (${extracted.type} · 동반 불가)`);
        continue;
      }
      if (denied) console.log(`  ※ ${extracted.name} — 글이 동반 불가라고 한다 · 게시된 ${matched.match.name} 의 갱신 후보로 올린다(등록 해제 또는 사이트가 맞아요)`);
      if (kind.exclude) {
        excluded.push({ extracted, reason: kind.exclude });
        stats.excluded[kind.exclude] += 1;
        console.log(`  제외 ${extracted.name} (${extracted.type}) · ${EXCLUDE_LABEL[kind.exclude]} → ${matched.match.name}`);
        continue;
      }
      // 신규인데 교차점검이 동반 근거를 못 찾았다 — 후보로 만들지 않고 재검색 재료와 함께 남긴다(`isNoPetEvidenceNew`, ADR-019 v6 임시 단계).
      if (isNoPetEvidenceNew(row.extracted.match.tier, row.extracted.verify)) {
        excluded.push({
          extracted,
          reason: 'noPetEvidence',
          extra: { town: townOf(regionRaw) ?? null, address: local?.address ?? extracted.address ?? null, recheck: null },
        });
        stats.excluded.noPetEvidence += 1;
        console.log(`  제외 ${extracted.name} (${extracted.type}) · 신규·동반 근거 없음${row.extracted.visited === false ? ' · 방문 안 함' : ''}`);
        continue;
      }
      if (sibling) row.extracted.nameKey = sibling.key;
      row.extracted.match.kind = kind.kind;
      row.extracted.match.changes = kind.changes;
      const tier = row.extracted.match.tier;
      console.log(`  ${formatCandidateLine(row, matched.match?.name)}${row.extracted.visited === false ? ' · 방문 안 함' : ''}`);

      if (tier === 'new') {
        if (dupOf) {
          stats.dup += 1;
          console.log(`    ※ ${sibling ? `같은 자리의 신규 후보(${sibling.name})가` : '같은 이름의 신규 후보가'} 이미 있음(${dupOf}) — dupOf 로 표시하고 넣는다. pnpm data:review 가 묶어 보여 준다`);
        } else {
          newNamesSeen.set(key, post.url);
          if (geo || address) newPlacesSeen.push({ key, name: extracted.name, type: extracted.type ?? null, geo, address, ref: post.url });
        }
      }
      rows.push(row);
    }

    dumpEntries.push({ post: { url: post.url, title: post.title, posted_at: post.posted_at }, candidates: rows, excluded });
    if (rows.length > 0) await write(`candidates ${rows.length}건 insert`, () => supabase.from('candidates').insert(rows));
    for (const row of rows) {
      if (row.extracted.match.kind !== 'update' || !row.match_place_id) continue;
      if (!updatedPlaces.has(row.match_place_id)) updatedPlaces.set(row.match_place_id, []);
      updatedPlaces.get(row.match_place_id).push({ ...row, posted_at: post.posted_at });
    }
    // 후보가 0개여도(장소 없음 · 제주 아님 · other 뿐) 분석은 끝난 것이다 — 다시 읽지 않게 analyzed_at 을 찍고, "왜 0건인가" 를 analysis 에 남긴다.
    const analysis = toPostAnalysis({ meta, candidates: rows, excluded });
    await write(`analyzed_at 기록${rows.length === 0 ? ' (후보 없음)' : ''}`, () =>
      supabase.from('blog_posts').update({ analyzed_at: new Date().toISOString(), analysis }).eq('url', post.url),
    );

    // 끝까지 간 뒤에만 센다 — 중간에 실패한 글은 "건너뜀" 이지 "분석" 이 아니고, 그 글의 후보도 세지 않는다.
    stats.analyzed += 1;
    stats.candidates += rows.length;
    for (const row of rows) {
      stats[row.extracted.match.tier] += 1;
      if (row.extracted.match.tier === 'auto' && (row.extracted.match.kind === 'update' || row.extracted.match.kind === 'fill')) stats[row.extracted.match.kind] += 1;
    }
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

/*
 * 제안 — 갱신 후보가 생긴 장소마다 한 번. 입력은 그 장소의 **pending 후보 전부**(이번 실행 것 + 이전 실행 것)라 DB 에서 다시 읽는다
 * (dry-run 은 이번 실행 것만). 결과는 가장 새 글의 행 `extracted.proposal` 에, 같은 장소의 살아 있는 옛 제안은 `superseded` 로.
 * 로그에는 칸 수·충돌 수만 — 제안 값·인용은 본문에서 파생된 것이라 찍지 않는다(05).
 */
stats.propose = { places: noPropose ? 0 : updatedPlaces.size, done: 0, failed: 0 };
let proposeOff = noPropose;
for (const [placeId, runRows] of updatedPlaces) {
  const placeRow = placeById.get(placeId);
  if (proposeOff || !placeRow) continue;
  try {
    let rowsForPlace = runRows;
    if (!dryRun) {
      const { data, error } = await supabase
        .from('candidates')
        .select('id, post_url, extracted, blog_posts(posted_at)')
        .eq('status', 'pending')
        .eq('match_place_id', placeId);
      if (error) throw new Error(`후보 다시 읽기 실패: ${error.message}`);
      rowsForPlace = data ?? [];
    }
    const proposal = await proposeForPlace(runClaudeCli, placeRow, rowsForPlace, proposeMeter);
    if (!proposal) continue;
    const { target, supersede } = proposalTargets(rowsForPlace);
    const changed = Object.values(proposal.fields).filter((field) => field.action !== 'keep').length;
    await write(`제안 ${placeRow.name} — 바꿀 칸 ${changed} · 글마다 다른 칸 ${proposal.conflicts.length} (글 ${rowsForPlace.length}건)`, () =>
      supabase.from('candidates').update({ extracted: { ...target.extracted, proposal } }).eq('id', target.id),
    );
    for (const old of supersede) {
      await write(`  옛 제안 superseded ${old.id}`, () =>
        supabase.from('candidates').update({ extracted: { ...old.extracted, proposal: { ...old.extracted.proposal, superseded: true } } }).eq('id', old.id),
      );
    }
    stats.propose.done += 1;
  } catch (e) {
    stats.propose.failed += 1;
    proposeOff = true;
    console.error(`  제안 실패 — 이 실행 동안 패스를 내린다(후보는 '제안 없음' 으로 남는다): ${e.message}`);
  }
}

console.log(formatSummary(stats, meter.summary(), { dryRun }));
if (verifyMeter.totals().calls > 0) console.log(`  ${verifyMeter.summary()}`);
if (proposeMeter.totals().calls > 0) console.log(`  ${proposeMeter.summary()}`);

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
      `  탈락 사유 — 제주밖주소 ${r.notJejuAddress} · 좌표파싱실패 ${r.coordUnparsable} · 좌표제주밖 ${r.coordOutOfJeju} · 이름불일치 ${r.nameMismatch} · 지역불일치 ${r.regionMismatch ?? 0} · 결과있었으나미채택 ${r.itemsButNoPick ?? 0}(호출 단위)`,
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

if (homepageStats.tried > 0) {
  console.log(
    `공식 홈페이지: 읽은 ${homepageStats.tried}곳 · 카드 ${homepageStats.card} (사진 있음 ${homepageStats.image})` +
      `${homepageStats.failed ? ` · 실패 ${homepageStats.failed}` : ''}`,
  );
}

// 글 단위 실패는 정상 경로(다음 실행에 재시도)라 exit 0. 시도한 글 중 성공이 0 이면 1 — "분석 불가" 도 성공이 아니다(위에서 닫지도 않았다).
// process.exit() 은 파이프로 나가던 stdout 을 잘라먹을 수 있어 자연 종료를 기다린다.
process.exitCode = fatal || (posts.length > 0 && stats.analyzed === 0) ? 1 : 0;
