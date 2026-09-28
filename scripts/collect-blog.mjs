// 네이버 검색 오픈 API 로 제주 반려동반 관련 블로그 글 목록을 모아 blog_posts 에 upsert 한다(`pnpm data:collect`).
// **사용자 터미널에서 돌린다** — 스케줄·CI 없이, 운영자가 `pnpm data:login` 한 세션으로만(ADR-016 v5). blog_posts 는 사용자가 돌릴 때만 찬다.
// HTML 을 통째로 긁지 않는 이유 — 네이버 약관(HTML 크롤링 금지)과 저작권(ADR-002 와 같은 기준). 검색 API 는
// 공식 · 하루 25,000회 무료이고 title·link·description·postdate 만 준다. **본문은 여기서도, DB 에도 저장하지 않는다** —
// 03(분석) 이 링크를 열어 그 순간에만 읽고 버린다. docs/todo/02-collect-naver-blog.md 가 정본.
import { readFile } from 'node:fs/promises';
import { describeKeyShape, naverErrorTail } from './lib/naverApiError.mjs';
import { NAVER_BLOG_SEARCH_URL, naverAuthHeaders } from './lib/naverSearchApi.mjs';
import { readHidden } from './lib/readHidden.mjs';
import { createSupabase } from './lib/supabaseClient.mjs';
import { WINDOW_DAYS, dedupeByUrl, isWithinDays, parsePostdate, toBlogPostRow } from './collect/naverBlog.mjs';

// 세션 검사가 키 입력보다 먼저다 — 키 두 개를 치고 나서 "pnpm data:login" 으로 멈추면 헛수고라서.
const supabase = createSupabase();

// 네이버 검색 키(client id·secret)는 사용자가 로컬에서 직접 관리한다(ADR-016 v5) — 레포·키체인·파일 어디에도 없다.
// env 로 받고, 없으면 터미널에서 숨김 입력으로 받는다. 받은 값은 이 프로세스 메모리에만 있고 로그·파일·키체인 어디에도 남기지 않는다 —
// 저장하면 그 자리가 곧 유출 경로가 되고, 매번 치는 비용은 수집이 사용자가 돌릴 때만 도는 일이라 감수한다.
// env 가 둘 다 있으면 그대로 쓴다(사용자가 셸에서 넘긴 것) — 에이전트 세션이라도 막지 않는다. 입력을 받는 경우에만 CLAUDECODE 를 거부한다(대화 기록에 실릴 수 있다).
// 앞뒤 공백을 턴다. **숨김 입력이라 붙여넣기가 끌고 온 공백을 사용자가 볼 방법이 없다** — 화면에 아무것도 안 찍히니
// 눈으로 잡을 수 없고, 결과는 네이버의 401 하나뿐이라 원인이 값인지 설정인지도 안 갈린다(2026-09-28 실제로 여기서 막혔다).
// `readHidden` 안에서 털지 않는 이유: `data:login` 의 비밀번호와 공유하는데 비밀번호는 앞뒤 공백이 값일 수 있다.
// 네이버 키는 그럴 수 없으므로 **소유자 쪽인 여기서** 턴다. env 로 받은 값도 같이 턴다(셸에서 따옴표로 감싸며 붙기 쉽다).
const trimKey = (v) => (typeof v === 'string' ? v.trim() : v);

let { NAVER_CLIENT_ID: naverClientId, NAVER_CLIENT_SECRET: naverClientSecret } = process.env;
naverClientId = trimKey(naverClientId);
naverClientSecret = trimKey(naverClientSecret);
if (!naverClientId || !naverClientSecret) {
  if (process.env.CLAUDECODE) {
    console.error('네이버 키는 에이전트 세션에서 입력하지 않는다 — 수집은 사용자 터미널에서 `pnpm data:collect`.');
    process.exit(1);
  }
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.error('NAVER_CLIENT_ID · NAVER_CLIENT_SECRET 을 env 로 넘기거나 터미널에서 실행(숨김 입력).');
    process.exit(1);
  }
  // 예외로 빠져나가도 터미널이 raw 모드에 남지 않게(login.mjs 와 같다).
  process.on('exit', () => { try { process.stdin.setRawMode(false); } catch { /* TTY 아님 */ } });
  // 둘 중 하나만 env 에 있으면 없는 쪽만 묻는다.
  try {
    if (!naverClientId) naverClientId = trimKey(await readHidden('NAVER_CLIENT_ID(숨김 입력): '));
    if (naverClientId && !naverClientSecret) naverClientSecret = trimKey(await readHidden('NAVER_CLIENT_SECRET(숨김 입력): ')); // id 를 비웠으면 secret 은 묻지 않는다
  } catch {
    process.exit(130); // Ctrl-C/Ctrl-D — readHidden 이 reject 한다
  }
  // 비어 있는 **이름**을 말한다(값은 절대 아니다) — 한 문장으로 두면 세 상황(id 를 빈 채 엔터 · secret 만 비움 · env 로 한쪽만 줌)을
  // 똑같이 가리킨다. 특히 id 를 비운 사용자는 secret 프롬프트를 본 적이 없어 무엇을 다시 쳐야 하는지 알 수 없다. 이 파일엔 테스트가 없어 문구가 유일한 진단이다.
  if (!naverClientId || !naverClientSecret) {
    const empty = [!naverClientId && 'NAVER_CLIENT_ID', !naverClientSecret && 'NAVER_CLIENT_SECRET'].filter(Boolean);
    console.error(`네이버 키가 비었다: ${empty.join(' · ')} — env 로 넘기거나 터미널에서 다시 실행(숨김 입력).`);
    process.exit(1);
  }
}

const ROOT = new URL('./', import.meta.url);
const keywords = JSON.parse(await readFile(new URL('collect/keywords.json', ROOT), 'utf8'));

const DISPLAY = 100;
const MAX_START = 1000;
const REQUEST_DELAY_MS = 200;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 응답 본문·헤더는 절대 로그에 남기지 않는다 — status 와 요청 URL 의 query 만 남긴다(docs/todo/05-security.md).
async function searchBlog(query, start) {
  const url = new URL(NAVER_BLOG_SEARCH_URL);
  url.searchParams.set('query', query);
  url.searchParams.set('display', String(DISPLAY));
  url.searchParams.set('start', String(start));
  url.searchParams.set('sort', 'date');

  const res = await fetch(url, {
    headers: naverAuthHeaders(naverClientId, naverClientSecret),
  });
  // 본문은 검색 **결과**라 남기지 않는다(05-security) — 실패 응답에서만, 그것도 우리가 쓴 라벨과 errorCode 만 꺼낸다.
  // status 만으로는 401 의 원인이 갈리지 않아서다(`lib/naverApiError.mjs` 의 주석이 정본).
  if (!res.ok) {
    // 401 일 때만 **보낸 값의 모양**(길이·글자 종류, 값은 아님)을 함께 찍는다 — 숨김 입력이라 사용자가
    // 무엇을 넣었는지 볼 방법이 이것뿐이고, 흔한 실수(뒤바꿔 입력)가 여기서 한눈에 드러난다.
    if (res.status === 401) console.error(describeKeyShape(naverClientId, naverClientSecret));
    throw new Error(`네이버 검색 API 실패: status=${res.status}${await naverErrorTail(res)} query=${url.searchParams.get('query')}`);
  }
  return res.json();
}

const now = new Date().toISOString();
let collected = [];
let excludedOld = 0;
let excludedOther = 0;

for (const keyword of keywords) {
  for (let start = 1; start <= MAX_START; start += DISPLAY) {
    const { items } = await searchBlog(keyword, start);
    if (!items || items.length === 0) break;

    let allOld = true;
    for (const item of items) {
      const row = toBlogPostRow(item, keyword, now);
      if (row) {
        collected.push(row);
        allOld = false;
        continue;
      }
      // toBlogPostRow 가 null 을 주는 이유는 셋 중 하나 — 1년 밖 / 비네이버·정규화 실패 / 제주 아님.
      // "1년 밖" 만 페이지 중단 판단에 쓰므로 postdate 만 다시 파싱해서 구분한다(sort=date 라 이후는 더 오래된다).
      const postedAt = parsePostdate(item.postdate);
      const isOld = postedAt !== null && !isWithinDays(postedAt, WINDOW_DAYS, now);
      if (isOld) excludedOld += 1;
      else {
        excludedOther += 1;
        allOld = false;
      }
    }

    if (allOld) break;
    await sleep(REQUEST_DELAY_MS);
  }
}

collected = dedupeByUrl(collected);

// 기존 url 을 미리 세어 신규/기존을 구분한다(upsert 자체는 개수를 안 준다).
const urls = collected.map((row) => row.url);
let existingUrls = new Set();
for (let i = 0; i < urls.length; i += 500) {
  const chunk = urls.slice(i, i + 500);
  if (chunk.length === 0) continue;
  const { data, error } = await supabase.from('blog_posts').select('url').in('url', chunk);
  if (error) throw error;
  for (const row of data) existingUrls.add(row.url);
}
const newCount = collected.filter((row) => !existingUrls.has(row.url)).length;

// ignoreDuplicates: true — 이미 있는 글의 fetched_at·analyzed_at 을 덮어쓰지 않기 위해서다.
// analyzed_at 은 03(분석) 만 채우는데, upsert 로 덮으면 분석 완료 표시가 매 실행마다 지워진다.
for (let i = 0; i < collected.length; i += 500) {
  const chunk = collected.slice(i, i + 500);
  if (chunk.length === 0) continue;
  const { error } = await supabase.from('blog_posts').upsert(chunk, { onConflict: 'url', ignoreDuplicates: true });
  if (error) throw error;
}

console.log(
  `수집 ${collected.length}건 (신규 ${newCount} · 기존 ${collected.length - newCount} · 1년 밖 제외 ${excludedOld} · 비네이버/비제주 제외 ${excludedOther})`,
);
