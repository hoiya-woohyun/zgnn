// 네이버 검색 오픈 API 로 제주 반려동반 관련 블로그 글 목록을 모아 blog_posts 에 upsert 한다(`pnpm data:collect`).
// HTML 을 통째로 긁지 않는 이유 — 네이버 약관(HTML 크롤링 금지)과 저작권(ADR-002 와 같은 기준). 검색 API 는
// 공식 · 하루 25,000회 무료이고 title·link·description·postdate 만 준다. **본문은 여기서도, DB 에도 저장하지 않는다** —
// 03(분석) 이 링크를 열어 그 순간에만 읽고 버린다. docs/todo/02-collect-naver-blog.md 가 정본.
import { createClient } from '@supabase/supabase-js';
import { readFile } from 'node:fs/promises';
import { WINDOW_DAYS, dedupeByUrl, isWithinDays, parsePostdate, toBlogPostRow } from './collect/naverBlog.mjs';

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NAVER_CLIENT_ID, NAVER_CLIENT_SECRET } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !NAVER_CLIENT_ID || !NAVER_CLIENT_SECRET) {
  console.error('SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY · NAVER_CLIENT_ID · NAVER_CLIENT_SECRET 이 모두 필요합니다. `pnpm secrets ls` 로 키체인을 확인하세요.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const ROOT = new URL('./', import.meta.url);
const keywords = JSON.parse(await readFile(new URL('collect/keywords.json', ROOT), 'utf8'));

const DISPLAY = 100;
const MAX_START = 1000;
const REQUEST_DELAY_MS = 200;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 응답 본문·헤더는 절대 로그에 남기지 않는다 — status 와 요청 URL 의 query 만 남긴다(docs/todo/05-security.md).
async function searchBlog(query, start) {
  const url = new URL('https://openapi.naver.com/v1/search/blog.json');
  url.searchParams.set('query', query);
  url.searchParams.set('display', String(DISPLAY));
  url.searchParams.set('start', String(start));
  url.searchParams.set('sort', 'date');

  const res = await fetch(url, {
    headers: { 'X-Naver-Client-Id': NAVER_CLIENT_ID, 'X-Naver-Client-Secret': NAVER_CLIENT_SECRET },
  });
  if (!res.ok) throw new Error(`네이버 검색 API 실패: status=${res.status} query=${url.searchParams.get('query')}`);
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
