// 네이버 검색 오픈 API 로 제주 반려동반 관련 블로그 글 목록을 모아 blog_posts 에 upsert 한다(`pnpm data collect`).
// **사용자 터미널에서 돌린다** — 스케줄·CI 없이, 운영자가 `pnpm data login` 한 세션으로만(ADR-016 v5). blog_posts 는 사용자가 돌릴 때만 찬다.
// HTML 을 통째로 긁지 않는 이유 — 네이버 약관(HTML 크롤링 금지)과 저작권(ADR-002 와 같은 기준). 검색 API 는
// 공식 · 하루 25,000회 무료이고 title·link·description·postdate 만 준다. **본문은 여기서도, DB 에도 저장하지 않는다** —
// 03(분석) 이 링크를 열어 그 순간에만 읽고 버린다. docs/todo/02-collect-naver-blog.md 가 정본.
// `/admin` 의 **추가 수집** 요청(`collect_requests`)이 있으면 키워드 뒤에 그 검색어도 돈다 — `--only-requests` 면 요청만(키워드 47개를 건너뛴다).
// 실행마다 `pipeline_runs` 에 한 행을 남긴다(scripts/lib/runLog.mjs, docs/todo/15) — 기록이 안 되면 경고 한 줄만 찍고 수집은 그대로 돈다.
import { readFile } from 'node:fs/promises';
import { chunkForUrlFilter } from './lib/chunkForUrlFilter.mjs';
import { fetchQueuedRequests, markRequestDone, REQUEST_KEYWORD, requestOutcome } from './lib/collectRequests.mjs';
import { describeKeyShape, naverErrorTail } from './lib/naverApiError.mjs';
import { NAVER_BLOG_SEARCH_URL, countNaverCall, naverAuthHeaders, readNaverCalls } from './lib/naverSearchApi.mjs';
import { loadNaverEnvFile } from './lib/naverEnvFile.mjs';
import { naverKeyPairProblem } from './lib/naverKeyFormat.mjs';
import { readHidden } from './lib/readHidden.mjs';
import { beginRun, classifyRunError, NO_RUN, RUN_ERROR } from './lib/runLog.mjs';
import { createSupabase } from './lib/supabaseClient.mjs';
import { formatCollectSummary, formatElapsed } from '../src/lib/runSummary.ts';
import {
  WINDOW_DAYS,
  dedupeByUrl,
  formatPageLine,
  stopReason,
  tallyPage,
} from './collect/naverBlog.mjs';
import { isDirectRun } from './lib/isDirectRun.mjs';

export async function main(argv = process.argv.slice(2)) {
  // 세션 검사가 키 입력보다 먼저다 — 키 두 개를 치고 나서 "pnpm data login" 으로 멈추면 헛수고라서.
  const supabase = createSupabase();

  // 요청도 키 입력보다 먼저 본다 — `--only-requests` 인데 대기 중인 요청이 없으면 키를 칠 이유가 없다.
  const onlyRequests = argv.includes('--only-requests');
  // 추가 수집 요청(먼저 누른 것부터). 표가 아직 원격에 없으면 경고 한 줄 — 수집은 키워드만으로 그대로 돈다.
  const { requests, missing: requestsMissing } = await fetchQueuedRequests(supabase);
  if (requestsMissing) console.warn('⚠️ collect_requests 표가 원격에 없다(마이그레이션 미적용) — 추가 수집 요청 없이 돈다.');
  if (onlyRequests && requests.length === 0) {
    console.log('대기 중인 추가 수집 요청이 없다 — 끝.');
    return 0;
  }

  // 네이버 검색 키(client id·secret)는 사용자가 로컬에서 직접 관리한다(ADR-016 v5) — 레포·키체인·파일 어디에도 없다.
  // env 로 받고, 없으면 터미널에서 숨김 입력으로 받는다. 받은 값은 이 프로세스 메모리에만 있고 로그·파일·키체인 어디에도 남기지 않는다 —
  // 저장하면 그 자리가 곧 유출 경로가 되고, 매번 치는 비용은 수집이 사용자가 돌릴 때만 도는 일이라 감수한다.
  // env 가 둘 다 있으면 그대로 쓴다(사용자가 셸에서 넘긴 것) — 에이전트 세션이라도 막지 않는다. 입력을 받는 경우에만 CLAUDECODE 를 거부한다(대화 기록에 실릴 수 있다).
  // 앞뒤 공백을 턴다. **숨김 입력이라 붙여넣기가 끌고 온 공백을 사용자가 볼 방법이 없다** — 화면에 아무것도 안 찍히니
  // 눈으로 잡을 수 없고, 결과는 네이버의 401 하나뿐이라 원인이 값인지 설정인지도 안 갈린다(2026-09-28 실제로 여기서 막혔다).
  // `readHidden` 안에서 털지 않는 이유: `pnpm data login` 의 비밀번호와 공유하는데 비밀번호는 앞뒤 공백이 값일 수 있다.
  // 네이버 키는 그럴 수 없으므로 **소유자 쪽인 여기서** 턴다. env 로 받은 값도 같이 턴다(셸에서 따옴표로 감싸며 붙기 쉽다).
  const trimKey = (v) => (typeof v === 'string' ? v.trim() : v);

  // env 에 없으면 사용자 홈의 파일에서 얹는다(레포 밖 · 이름 넷 고정 · 600 — lib/naverEnvFile.mjs). 없으면 아래의 숨김 입력으로 간다.
  try {
    const fromFile = loadNaverEnvFile();
    if (fromFile.loaded.length) console.log(`네이버 키: ${fromFile.path} 에서 ${fromFile.loaded.join(' · ')}`);
  } catch (e) {
    console.error(e.message);
    return 1;
  }
  let { NAVER_CLIENT_ID: naverClientId, NAVER_CLIENT_SECRET: naverClientSecret } = process.env;
  naverClientId = trimKey(naverClientId);
  naverClientSecret = trimKey(naverClientSecret);
  if (!naverClientId || !naverClientSecret) {
    if (process.env.CLAUDECODE) {
      console.error('네이버 키는 에이전트 세션에서 입력하지 않는다 — 수집은 사용자 터미널에서 `pnpm data collect`.');
      return 1;
    }
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      console.error('NAVER_CLIENT_ID · NAVER_CLIENT_SECRET 을 env 로 넘기거나 터미널에서 실행(숨김 입력).');
      return 1;
    }
    // 예외로 빠져나가도 터미널이 raw 모드에 남지 않게(login.mjs 와 같다).
    process.on('exit', () => { try { process.stdin.setRawMode(false); } catch { /* TTY 아님 */ } });
    // 둘 중 하나만 env 에 있으면 없는 쪽만 묻는다.
    try {
      if (!naverClientId) naverClientId = trimKey(await readHidden('NAVER_CLIENT_ID(숨김 입력): '));
      if (naverClientId && !naverClientSecret) naverClientSecret = trimKey(await readHidden('NAVER_CLIENT_SECRET(숨김 입력): ')); // id 를 비웠으면 secret 은 묻지 않는다
    } catch {
      return 130; // Ctrl-C/Ctrl-D — readHidden 이 reject 한다
    }
    // 비어 있는 **이름**을 말한다(값은 절대 아니다) — 한 문장으로 두면 세 상황(id 를 빈 채 엔터 · secret 만 비움 · env 로 한쪽만 줌)을
    // 똑같이 가리킨다. 특히 id 를 비운 사용자는 secret 프롬프트를 본 적이 없어 무엇을 다시 쳐야 하는지 알 수 없다. 이 파일엔 테스트가 없어 문구가 유일한 진단이다.
    if (!naverClientId || !naverClientSecret) {
      const empty = [!naverClientId && 'NAVER_CLIENT_ID', !naverClientSecret && 'NAVER_CLIENT_SECRET'].filter(Boolean);
      console.error(`네이버 키가 비었다: ${empty.join(' · ')} — env 로 넘기거나 터미널에서 다시 실행(숨김 입력).`);
      return 1;
    }
  }

  // 모양 검사(`naverKeyFormat.mjs`) — 헤더에 실을 수 없는 키(예시 문구의 한글)는 401 이 아니라 ByteString 오류로 죽어 원인이 흐려진다.
  {
    const problem = naverKeyPairProblem(['NAVER_CLIENT_ID', 'NAVER_CLIENT_SECRET'], { clientId: naverClientId, clientSecret: naverClientSecret });
    if (problem) {
      console.error(`네이버 키 모양이 틀렸다: ${problem} — 고친 뒤 다시 실행.`);
      return 1;
    }
  }

  // supabase-js 의 `error` 는 **Error 가 아니라 맨 객체**다. 그대로 던지면 스택이 없고, 엣지가 거절한 경우엔
  // 내용도 `{ message: 'Bad Request' }` 한 줄뿐이라 어느 질의가 왜 죽었는지 사라진다(→ BUG-007).
  // 무엇을 하다가 몇 건에서 죽었는지를 붙여 Error 로 감싼다 — url 값은 싣지 않는다(개수만).
  function dbError(what, error, count) {
    const code = error?.code ? ` code=${error.code}` : '';
    const detail = error?.details ? ` details=${error.details}` : '';
    return new Error(`${what} 실패(${count}건)${code}${detail}: ${error?.message ?? '알 수 없는 오류'}`);
  }

  const ROOT = new URL('./', import.meta.url);
  const keywords = onlyRequests ? [] : JSON.parse(await readFile(new URL('collect/keywords.json', ROOT), 'utf8'));

  const DISPLAY = 100;
  // 추가 수집은 한 페이지(최신 30건)만 — 가게 하나의 근거를 더 찾는 일이라 1년치를 다 볼 이유가 없고, 담은 글마다 분석이 `claude -p` 를 한 번 부른다.
  const REQUEST_DISPLAY = 30;
  const MAX_START = 1000;
  const MAX_PAGES = Math.ceil(MAX_START / DISPLAY);
  const REQUEST_DELAY_MS = 200;
  const UPSERT_CHUNK = 500;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // 키워드가 왜 멈췄는가 — 이 셋뿐이고, `cap` 만 문제다(아래 경고).
  const STOP_LABEL = {
    empty: '검색 결과 끝',
    old: `${WINDOW_DAYS}일 경계`,
    cap: `페이지 상한 ${MAX_PAGES}장`,
  };

  // 응답 본문·헤더는 절대 로그에 남기지 않는다 — status 와 요청 URL 의 query 만 남긴다(docs/todo/05-security.md).
  async function searchBlog(query, start, display = DISPLAY) {
    const url = new URL(NAVER_BLOG_SEARCH_URL);
    url.searchParams.set('query', query);
    url.searchParams.set('display', String(display));
    url.searchParams.set('start', String(start));
    url.searchParams.set('sort', 'date');

    countNaverCall();
    const res = await fetch(url, {
      headers: naverAuthHeaders(naverClientId, naverClientSecret),
    });
    // 본문은 검색 **결과**라 남기지 않는다(05-security) — 실패 응답에서만, 그것도 우리가 쓴 라벨과 errorCode 만 꺼낸다.
    // status 만으로는 401 의 원인이 갈리지 않아서다(`lib/naverApiError.mjs` 의 주석이 정본).
    if (!res.ok) {
      // 401 일 때만 **보낸 값의 모양**(길이·글자 종류, 값은 아님)을 함께 찍는다 — 숨김 입력이라 사용자가
      // 무엇을 넣었는지 볼 방법이 이것뿐이고, 흔한 실수(뒤바꿔 입력)가 여기서 한눈에 드러난다.
      if (res.status === 401) console.error(describeKeyShape(naverClientId, naverClientSecret));
      // 429 만 분류를 붙인다(실행 기록의 error 칸 — 분류 문구만 적는다, lib/runLog.mjs). 나머지는 '알 수 없음' 이고 원문은 콘솔에 남는다.
      throw Object.assign(new Error(`네이버 검색 API 실패: status=${res.status}${await naverErrorTail(res)} query=${url.searchParams.get('query')}`), {
        status: res.status,
        ...(res.status === 429 ? { runError: RUN_ERROR.naver429 } : {}),
      });
    }
    return res.json();
  }

  const now = new Date().toISOString();
  const startedAt = Date.now();
  let collected = [];
  let excludedOld = 0;
  let excludedOther = 0;
  let truncated = 0;

  // 시작 기록은 키·키워드 검사가 다 지난 뒤에 — 그 앞의 exit(1) 은 "돌지 않은 것" 이지 실패한 실행이 아니다.
  // `--only-requests` 실행은 **남기지 않는다** — 운영 현황의 수집 칸은 마지막 성공(`last_ok`)으로 "수집 7일째 없음" 을 가르는데, 요청만 돈 실행이
  // 그 자리를 차지하면 키워드 수집이 몇 주 멈춰도 칸이 초록이다. `script` 에 체크 제약이 있어 다른 라벨을 쓰려면 마이그레이션이 필요하고,
  // 그 실행의 결과는 요청 행(`done_at`·`found`·`to_read`)에 이미 남는다.
  const run = onlyRequests ? NO_RUN : await beginRun(supabase, { script: 'collect', args: { keywords: keywords.length, requests: requests.length } });
  // Ctrl-C 도 실패로 닫는다(130 유지). 닫기를 3초 넘게 기다리지 않는다 — 네트워크가 죽어 있으면 그만큼 사용자가 갇힌다.
  // 끝나면 떼어 낸다 — `pnpm data once` 는 이 뒤에 분석·반영을 같은 프로세스에서 돈다. 남겨 두면 그때의 Ctrl-C 가 끝난 수집 행을 실패로 덮는다.
  const onSigint = async () => {
    await Promise.race([run.end({ status: 'failed', error: RUN_ERROR.sigint }), sleep(3000)]);
    process.exit(130);
  };
  process.once('SIGINT', onSigint);

  try {
    // 진행 로그. 첫 실행은 1년치라 키워드 6 × 최대 10페이지를 돌고, 그 뒤 DB 조회·upsert 가 또 여러 번 나간다 —
    // 예전엔 그 몇 분 동안 **한 줄도 안 찍혀** 도는 중인지 멈춘 건지 사용자가 알 수 없었다(마지막 요약 한 줄이 전부였다).
    // 무엇을 찍고 무엇을 안 찍는지는 `collect/naverBlog.mjs` 의 포맷터 주석이 정본 — **응답 내용은 개수로만** 나간다(05-security).
    console.log(
      `수집 시작: 키워드 ${keywords.length}개 · 최근 ${WINDOW_DAYS}일 · 키워드당 최대 ${MAX_PAGES}페이지(요청 사이 ${REQUEST_DELAY_MS}ms)` +
        (requests.length ? ` · 추가 수집 ${requests.length}건(각 ${REQUEST_DISPLAY}건 한 페이지)` : ''),
    );

    for (const [index, keyword] of keywords.entries()) {
      console.log(`[${index + 1}/${keywords.length}] ${keyword}`);
      const keywordStartedAt = Date.now();
      let kept = 0;
      // 'cap' 은 이제 **닿지 않는 초기값**이다 — 마지막 페이지에서 stopReason 이 반드시 값을 준다(아래). 그래도 남겨 둔다:
      // MAX_START/DISPLAY 가 나중에 안 나눠떨어지게 바뀌면 조용한 undefined 대신 보수적인 라벨로 떨어지게.
      let stop = 'cap';
      for (let start = 1, page = 1; start <= MAX_START; start += DISPLAY, page += 1) {
        // 심장 — 60초에 한 번만 실제로 쓴다. 안 찍으면 10분 넘게 도는 수집이 살아 있어도 운영 현황에 "중단된 듯" 으로 뜬다(runState).
        await run.tick();
        const { items } = await searchBlog(keyword, start);
        const received = items?.length ?? 0;
        const tally = tallyPage(items ?? [], keyword, now);
        collected.push(...tally.rows);
        kept += tally.rows.length;
        excludedOld += tally.old;
        excludedOther += tally.other;
        if (received > 0) console.log(formatPageLine({ page, start, received, tally, total: kept }));

        // 멈출 이유는 순수 함수가 정한다 — 왜 그 판정이 코드 안에 있으면 안 되는지는 stopReason 의 주석(거짓 ⚠️).
        const reason = stopReason({ received, display: DISPLAY, tally, isLastPage: start + DISPLAY > MAX_START });
        if (reason) {
          stop = reason;
          break;
        }
        await sleep(REQUEST_DELAY_MS);
      }
      console.log(`  → ${kept}건 · ${STOP_LABEL[stop]}에서 멈춤 · ${formatElapsed(Date.now() - keywordStartedAt)}`);
      // 상한에서 멈췄다는 건 **최근 1년을 다 못 봤다**는 뜻이다(`start` 상한이 1000 이라 키워드당 1,000건이 천장).
      // 실행을 세우지는 않는다 — 수집은 증분이고 주 1회 도는 일이라, 다음 실행이 새 글부터 다시 담는다. 다만
      // 이 줄이 없으면 "그 키워드의 창이 잘렸다" 는 사실이 **어디에도 안 남는다**(요약의 건수만 보면 많이 담긴 것처럼 보인다).
      if (stop === 'cap') {
        truncated += 1;
        console.log(`  ⚠️ ${MAX_PAGES}페이지를 다 썼는데 ${WINDOW_DAYS}일 경계에 닿지 못했다 — 이 키워드의 창은 거기서 잘렸다(실패는 아니다. 키워드를 좁히면 줄어든다)`);
      }
    }

    // 추가 수집 — 검색어 하나에 한 페이지. 페이지 넘김·창 잘림(⚠️) 판정이 없다: 최신 30건이 전부다.
    // 요청별 행을 따로 쥐고 있다가 upsert 가 끝난 **뒤에** 결과를 적는다 — 그 전에 죽으면 요청은 대기로 남는다.
    // **요청 하나의 실패가 실행을 죽이지 않는다** — 이 루프는 키워드 수집이 끝난 뒤 · upsert 앞이라, 여기서 던지면 메모리에 쥔 키워드 수집분이
    // 통째로 버려지고, 늘 실패하는 요청(이상한 상호명의 4xx)이면 다음 실행도 같은 자리에서 죽는다. 실패한 요청은 대기로 남는다.
    // 429 는 한도라 남은 요청도 같은 꼴이 된다 — 거기서 요청 루프만 멈추고 담은 것은 저장한다.
    // 글의 `keyword` 는 상호명이 아니라 표식(`REQUEST_KEYWORD`)이다 — 추출 프롬프트가 `검색어:` 로 읽어, 상호명을 주면 이름만 스친 글에서 그 가게를 지어내게 유도한다.
    const requestRows = new Map();
    for (const [index, request] of requests.entries()) {
      await run.tick();
      let items;
      try {
        ({ items } = await searchBlog(request.query, 1, REQUEST_DISPLAY));
      } catch (e) {
        console.warn(`⚠️ [추가 ${index + 1}/${requests.length}] ${request.query} 검색 실패 — 대기로 남긴다: ${e.message}`);
        if (e.status === 429) {
          console.warn(`⚠️ 429 — 남은 추가 수집 ${requests.length - index - 1}건도 대기로 남기고, 담은 것은 저장한다`);
          break;
        }
        continue;
      }
      const tally = tallyPage(items ?? [], REQUEST_KEYWORD, now);
      collected.push(...tally.rows);
      excludedOld += tally.old;
      excludedOther += tally.other;
      requestRows.set(request.id, tally.rows);
      console.log(`[추가 ${index + 1}/${requests.length}] ${request.query} → ${tally.rows.length}건(받은 ${items?.length ?? 0})`);
      await sleep(REQUEST_DELAY_MS);
    }

    const beforeDedupe = collected.length;
    collected = dedupeByUrl(collected);
    const overlapped = beforeDedupe - collected.length;
    console.log(`중복 제거: ${beforeDedupe} → ${collected.length}건${overlapped > 0 ? ` (키워드끼리 겹친 ${overlapped}건)` : ''}`);

    // 기존 url 을 미리 세어 신규/기존을 구분한다(upsert 자체는 개수를 안 준다).
    //
    // ⚠️ **개수가 아니라 길이로 자른다**(→ BUG-007). `in()` 은 목록 전체를 쿼리 스트링에 싣기 때문에
    // 500개씩 자르면 URL 이 33KB 가 되어 엣지가 PostgREST 에 닿기도 전에 평문 400 으로 거절한다.
    // 그 실패는 `{ message: 'Bad Request' }` 라는 **스택도 없는 맨 객체**로 와서 원인을 알 수 없다.
    const urls = collected.map((row) => row.url);
    const chunks = chunkForUrlFilter(urls);
    const existingUrls = new Set();
    const analyzedUrls = new Set(); // 추가 수집 결과의 '읽을 글' 을 세는 데만 쓴다(requestOutcome)
    // 덩어리 수를 먼저 찍는다 — 몇 번 더 남았는지 보이고, 길이 기반 분할이 실제로 몇 개를 만들었는지도 같이 드러난다(BUG-007 의 관측).
    if (chunks.length > 0) console.log(`기존 url 조회: ${urls.length}건 → ${chunks.length}덩어리`);
    for (const [i, chunk] of chunks.entries()) {
      const { data, error } = await supabase.from('blog_posts').select('url, analyzed_at').in('url', chunk);
      if (error) throw dbError('blog_posts 기존 url 조회', error, chunk.length);
      for (const row of data) {
        existingUrls.add(row.url);
        if (row.analyzed_at) analyzedUrls.add(row.url);
      }
      console.log(`  ${i + 1}/${chunks.length} 조회 ${chunk.length}건 · 기존 누적 ${existingUrls.size}`);
    }
    const newCount = collected.filter((row) => !existingUrls.has(row.url)).length;

    // ignoreDuplicates: true — 이미 있는 글의 fetched_at·analyzed_at 을 덮어쓰지 않기 위해서다.
    // analyzed_at 은 03(분석) 만 채우는데, upsert 로 덮으면 분석 완료 표시가 매 실행마다 지워진다.
    const upsertChunks = Math.ceil(collected.length / UPSERT_CHUNK);
    if (upsertChunks > 0) console.log(`upsert: ${collected.length}건 → ${upsertChunks}덩어리(${UPSERT_CHUNK}씩)`);
    for (let i = 0; i < collected.length; i += UPSERT_CHUNK) {
      const chunk = collected.slice(i, i + UPSERT_CHUNK);
      const { error } = await supabase.from('blog_posts').upsert(chunk, { onConflict: 'url', ignoreDuplicates: true });
      if (error) throw Object.assign(dbError('blog_posts upsert', error, chunk.length), { runError: RUN_ERROR.dbWrite });
      console.log(`  ${i / UPSERT_CHUNK + 1}/${upsertChunks} upsert ${chunk.length}건`);
    }

    // 추가 수집 결과 — 글은 이미 들어갔으므로 여기서 실패해도 실행을 죽이지 않는다(요청이 대기로 남아 다음에 한 번 더 찾을 뿐이다).
    let requestToRead = 0;
    for (const request of requests) {
      if (!requestRows.has(request.id)) continue; // 검색이 실패한 요청 — 대기로 남는다
      const outcome = requestOutcome(requestRows.get(request.id) ?? [], analyzedUrls);
      requestToRead += outcome.to_read;
      try {
        await markRequestDone(supabase, request.id, outcome, now);
      } catch (e) {
        console.warn(`⚠️ ${e.message} — '${request.query}' 는 대기로 남는다`);
      }
    }

    if (truncated > 0) console.log(`⚠️ 키워드 ${truncated}개가 ${MAX_PAGES}페이지 상한에서 잘렸다 — 위 ⚠️ 줄을 보라`);
    const stats = {
      fetched: collected.length,
      new: newCount,
      existing: collected.length - newCount,
      excludedOld,
      excludedOther,
      durationMs: Date.now() - startedAt,
      naverCalls: readNaverCalls(),
      truncatedKeywords: truncated,
      ...(requestRows.size ? { requests: requestRows.size, requestToRead } : {}),
    };
    // 같은 객체를 찍고 같은 객체를 남긴다 — 화면(/admin/ops)이 stats 로 이 줄을 글자까지 같게 다시 만든다(src/lib/runSummary.ts).
    console.log(formatCollectSummary(stats));
    await run.end({ status: 'ok', stats });
  } catch (e) {
    // 기록에는 분류 문구만(원문엔 장소명·URL 이 섞일 수 있다), 원문은 다시 던져 지금처럼 스택과 exit 1 로 보인다.
    await run.end({ status: 'failed', error: classifyRunError(e) });
    throw e;
  } finally {
    process.off('SIGINT', onSigint);
  }
}

if (isDirectRun(import.meta.url)) process.exitCode = await main();
