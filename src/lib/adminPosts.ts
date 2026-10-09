/**
 * 수집 완료 칸(`blog_posts`)의 건수 — 3,360행을 내려받지 않고 **세기만** 한다(`head: true`).
 *
 * `excluded_at`(글 단위 분석 제외, 09 T3.2)은 마이그레이션이 원격에 적용돼야 생긴다. 없으면 PostgREST 가 400 을 주는데,
 * 그것을 "제외 0건" 으로 읽지 않고 `excluded: null`(= 미적용)로 돌려준다 — 화면은 그 사실을 **글 단위 제외를 말하는 그 줄에서만** 말한다
 * (2026-10-06 — 탭 라벨 옆 `미적용` 은 무슨 뜻인지 읽히지 않아 뺐다, todo/13 T4.4).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { JEJU_TITLE_SOURCE, LISTY_TITLE_SOURCE, PET_TITLE_SOURCE, TOPIC_TITLE_SOURCE } from '../../scripts/analyze/analyzeCandidates.mjs';
import { chunkForUrlFilter } from '../../scripts/lib/chunkForUrlFilter.mjs';
import type { TCandidateRow } from './adminCandidates';
import { EDITED_NOTE } from './adminApply';
import { fetchPlaceSources } from './adminPlaces';
import { onlyAnalyzed, withPromptVersion, type TPostQuery } from './adminPostVersions';
import { REANALYZE_NOTE, reanalyzeSummary, type TReanalyzePlan } from './adminReanalyze';

export type TPostCounts = {
  total: number;
  /** 아직 `pnpm data analyze` 가 읽지 않은 글. `excluded_at` 이 있으면 분석 제외한 글은 뺀다. */
  unanalyzed: number;
  /** 분석 제외한 글. 칸이 없으면(마이그레이션 미적용) null. */
  excluded: number | null;
  /** 이미 있는 가게를 쓴 글의 수(11 T2.4) — 차이 게이트가 일하는 것이 보이게. 못 셌으면 null(아무 말도 안 한다). */
  existing?: TExistingTally | null;
};

/**
 * 분석이 **이미 게시된 가게**를 만나 후보를 만들지 않은 장소의 수 — 이유별(`blog_posts.analysis.excluded[].reason`, 11 U1).
 * `alreadyHave` 는 차이 게이트 전의 이름이라 `같은 말` 에 합친다(그때는 다른 말을 하는 글도 거기 들어갔다 — 그 사실은 화면 문구가 아니라 문서가 말한다).
 */
export type TExistingTally = {
  total: number;
  same: number;
  stale: number;
  weak: number;
  /**
   * **신규** 가게인데 교차점검이 동반 근거를 못 찾아 후보로 안 만든 수(`noPetEvidence`, ADR-019 v6 임시 단계). `total` 에는 안 넣는다 — 이미 있는
   * 가게 이야기가 아니다. 업체명 재검색(결정 7)이 생기면 다시 볼 줄들이라 "버린 것" 이 아니라 "미룬 것" 으로 보이게 센다.
   */
  noPetEvidence: number;
  /**
   * **옛 규칙**(`alreadyHave`, 차이 게이트 전)으로 버려진 장소가 있는 글 url — 차이 게이트를 한 번도 못 지났다.
   * 수집 완료 칸의 `다시 열기` 가 이 글들을 수집 완료로 되돌린다(11 런북 3단계를 화면으로).
   */
  alreadyHavePosts: string[];
};

/** 순수 — 글마다의 `excluded` 배열을 받아 센다. 모르는 이유는 세지 않는다. */
export function tallyExistingReasons(excludedLists: unknown[], urls: (string | null)[] = []): TExistingTally {
  const out: TExistingTally = { total: 0, same: 0, stale: 0, weak: 0, noPetEvidence: 0, alreadyHavePosts: [] };
  for (const [index, list] of excludedLists.entries()) {
    if (!Array.isArray(list)) continue;
    let old = false;
    for (const entry of list) {
      const reason = (entry as { reason?: unknown } | null)?.reason;
      if (reason === 'alreadyHave') old = true;
      if (reason === 'noPetEvidence') {
        out.noPetEvidence += 1;
        continue;
      }
      if (reason === 'sameAsSite' || reason === 'alreadyHave') out.same += 1;
      else if (reason === 'stale') out.stale += 1;
      else if (reason === 'weak') out.weak += 1;
      else continue;
      out.total += 1;
    }
    const url = urls[index];
    if (old && url) out.alreadyHavePosts.push(url);
  }
  return out;
}

const PAGE = 1000;

/**
 * 분석된 글의 `analysis->excluded` 만 나눠 받아 센다(본문·인용은 이 칸에 없다 — 이름·종류·이유뿐). 3,360건이면 네 번이다.
 * 실패하면 null — 부가 정보라 수집 칸 전체를 실패로 말하지 않는다.
 */
export async function countExistingReasons(client: SupabaseClient): Promise<TExistingTally | null> {
  const lists: unknown[] = [];
  const urls: string[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client
      .from('blog_posts')
      .select('url, excluded:analysis->excluded')
      .not('analyzed_at', 'is', null)
      .order('url')
      .range(from, from + PAGE - 1);
    if (error) return null;
    for (const row of (data ?? []) as { url: string; excluded?: unknown }[]) {
      lists.push(row.excluded);
      urls.push(row.url);
    }
    if (!data || data.length < PAGE) break;
  }
  return tallyExistingReasons(lists, urls);
}

export type TReopenPlan = TReanalyzePlan & {
  /** 사람이 반려한 형제 후보가 있어 **뺀** 글 수 — 다시 읽으면 반려한 가게가 새 후보로 또 선다(블랙리스트에 없으면). */
  skipped: number;
};

type TSibling = Pick<TCandidateRow, 'id' | 'post_url' | 'status' | 'reviewer_note'>;

/**
 * 옛 규칙으로 버려진 글을 다시 열 계획 — 순수(11 런북 3단계 = `supabase/ops/11-reopen/03-reopen-already-have.sql` 과 같은 규칙).
 *  - 사람이 반려한 후보(재분석 머리표가 아닌 `rejected`)가 딸린 글은 **뺀다**.
 *  - 남은 글의 pending 후보는 눕히고(`[admin] 재분석`), 사람이 고친 후보(`[admin] 고침`)는 남긴다 — `reanalyzePlan` 과 같다.
 * 쓰기는 `prepareReanalyze` 가 한다(후보 먼저, 글 나중).
 */
export function reopenPlan(posts: string[], siblings: TSibling[]): TReopenPlan {
  const humanRejected = new Set(
    siblings.filter((row) => row.status === 'rejected' && !row.reviewer_note?.includes(REANALYZE_NOTE)).map((row) => row.post_url),
  );
  const open = posts.filter((url) => !humanRejected.has(url));
  const inOpen = new Set(open);
  const pending = siblings.filter((row) => row.status === 'pending' && row.post_url && inOpen.has(row.post_url));
  const edited = (row: TSibling) => Boolean(row.reviewer_note?.includes(EDITED_NOTE));
  return {
    posts: open,
    lay: pending.filter((row) => !edited(row)) as TCandidateRow[],
    keep: pending.filter(edited) as TCandidateRow[],
    skipped: posts.length - open.length,
  };
}

/** 그 글들에 딸린 후보(상태 무관) — `in.(…)` 길이 예산으로 나눠 읽는다(`chunkForUrlFilter`). */
export async function fetchSiblings(client: SupabaseClient, posts: string[]): Promise<TSibling[]> {
  const out: TSibling[] = [];
  for (const chunk of chunkForUrlFilter(posts) as string[][]) {
    const { data, error } = await client.from('candidates').select('id, post_url, status, reviewer_note').in('post_url', chunk);
    if (error) throw new Error(`글의 후보를 읽지 못했어요 (${error.message})`);
    out.push(...((data ?? []) as TSibling[]));
  }
  return out;
}

/** 확인 문장 — 무엇이 바뀌고 무엇을 빼는지. */
export function reopenSummary(plan: TReopenPlan): string {
  const skipped = plan.skipped ? ` 사람이 제외한 후보가 딸린 글 ${plan.skipped}건은 빼요(다시 읽으면 그 가게가 또 올라와요).` : '';
  const kept = plan.keep.length ? ` 사람이 고친 후보 ${plan.keep.length}건은 그대로예요.` : '';
  return `옛 규칙으로 기존 가게를 건너뛴 글 ${plan.posts.length}건을 수집 완료로 되돌려요. 그 글의 검수 대기 후보 ${plan.lay.length}건은 '재분석' 표시로 내려가요.${kept}${skipped} 다음 분석이 사이트와 대 보며 다시 읽어요.`;
}

const headCount = (client: SupabaseClient) => client.from('blog_posts').select('url', { count: 'exact', head: true });

/**
 * **"미분석" 의 정의 한 곳** — 머리글의 `미분석 N`(`countPosts`), 미분석 필터의 목록과 그 페이지 수(`fetchPosts`), 검색어·달별 집계(`fetchPostBacklog`)가
 * 같은 집합이어야 숫자끼리 맞는다(09 T3.2 수용 기준). 분석 스크립트의 고르기(`scripts/lib/postExclusion.mjs`)와도 같은 꼴이다.
 * 제외 칸이 없으면(마이그레이션 미적용) 제외 조건 없이 — 제외한 글이 있을 수 없다.
 */
export function onlyUnanalyzed<Q extends TPostQuery>(query: Q, excludedApplied: boolean): Q {
  const pending = query.is('analyzed_at', null) as Q;
  return excludedApplied ? (pending.is('excluded_at', null) as Q) : pending;
}

export async function countPosts(client: SupabaseClient): Promise<TPostCounts> {
  const total = await headCount(client);
  if (total.error) throw new Error(`수집한 글을 세지 못했어요 (${total.error.message})`);

  const excluded = await headCount(client).not('excluded_at', 'is', null);
  const excludedCount = excluded.error ? null : (excluded.count ?? 0);

  const unanalyzed = await onlyUnanalyzed(headCount(client), excludedCount !== null);
  if (unanalyzed.error) throw new Error(`수집한 글을 세지 못했어요 (${unanalyzed.error.message})`);

  return { total: total.count ?? 0, unanalyzed: unanalyzed.count ?? 0, excluded: excludedCount, existing: await countExistingReasons(client) };
}

/**
 * 미분석 글이 **어디에 쌓여 있나**(todo/13 T4.4) — 검색어별·달별 건수. 5,953건이 문장 하나("미분석 N건")로만 보이던 자리라,
 * 어느 검색어를 더 모을지·어디서 멈출지(03 「멈출 지점」)를 정할 바탕이 없었다.
 * 둘 다 많은 쪽이 위다(달은 최근 달이 위). 모르는 값은 버리지 않고 한 칸에 모은다 — 합이 미분석 수와 같아야 표를 믿는다.
 */
export type TBacklogCount = { key: string; count: number };
export type TBacklogTally = { total: number; byKeyword: TBacklogCount[]; byMonth: TBacklogCount[] };

export const BACKLOG_NO_KEYWORD = '검색어 없음';
export const BACKLOG_NO_DATE = '날짜 없음';

/** 순수 — `posted_at` 은 `date`(YYYY-MM-DD)라 앞 7자가 달이다. */
export function tallyBacklog(rows: { keyword: string | null; posted_at: string | null }[]): TBacklogTally {
  const keywords = new Map<string, number>();
  const months = new Map<string, number>();
  for (const row of rows) {
    const keyword = row.keyword?.trim() || BACKLOG_NO_KEYWORD;
    const month = row.posted_at && /^\d{4}-\d{2}/.test(row.posted_at) ? row.posted_at.slice(0, 7) : BACKLOG_NO_DATE;
    keywords.set(keyword, (keywords.get(keyword) ?? 0) + 1);
    months.set(month, (months.get(month) ?? 0) + 1);
  }
  const entries = (map: Map<string, number>) => [...map].map(([key, count]) => ({ key, count }));
  return {
    total: rows.length,
    byKeyword: entries(keywords).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key, 'ko')),
    // 'YYYY-MM' 은 문자열 내림차순이 곧 최근 순이다. 날짜 없음은 맨 끝.
    byMonth: entries(months).sort((a, b) => (a.key === BACKLOG_NO_DATE ? 1 : b.key === BACKLOG_NO_DATE ? -1 : b.key.localeCompare(a.key))),
  };
}

/** 다음에 읽힐 글 한 줄. */
export type TNextPost = { url: string; title: string | null; keyword: string | null; posted_at: string | null };

export type TPostBacklog = { tally: TBacklogTally; next: TNextPost[] };

/** "다음에 읽을 글" 의 수 — 터미널 안내(`pnpm data analyze --limit 30`)와 같은 수. */
export const NEXT_POSTS = 30;

/**
 * 미분석 글의 집계와 다음 30건. 수집 완료 탭을 **처음 열 때** 한 번 읽는다(6천 행 — 로그인 직후 자동으로 읽을 일이 아니다).
 *
 * 집계는 `keyword, posted_at` 두 칸만 1,000행씩 끝까지 받는다(PostgREST 기본 상한). `url` 로 정렬을 고정해야 페이지가 겹치거나 빠지지 않는다.
 * 분석 제외 칸이 있으면(`excludedApplied`) 제외한 글은 뺀다 — 머리글의 "미분석 N" 과 같은 집합이라야 합이 맞는다.
 *
 * 다음 30건은 **분석 스크립트와 같은 조건**이다(`analyze-candidates.mjs` 의 집중 글 쿼리 — 같은 정규식 문자열을 import 한다):
 * 미분석(분석 제외 아님) · 제목에 반려동물 말과 제주 지명 · 목록·주제 글 아님 · 최신순.
 * 블로그당 상한(`maxPerBlog`)·한 가게 블로그 후순위는 재현하지 않는다 — 화면이 "대략" 이라고 말한다.
 */
export async function fetchPostBacklog(client: SupabaseClient, excludedApplied: boolean): Promise<TPostBacklog> {
  const rows: { keyword: string | null; posted_at: string | null }[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await onlyUnanalyzed(client.from('blog_posts').select('keyword, posted_at'), excludedApplied)
      .order('url')
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`미분석 글을 읽지 못했어요 (${error.message})`);
    rows.push(...((data ?? []) as typeof rows));
    if (!data || data.length < PAGE) break;
  }

  const { data: next, error } = await onlyUnanalyzed(client.from('blog_posts').select('url, title, keyword, posted_at'), excludedApplied)
    .filter('title', 'imatch', PET_TITLE_SOURCE)
    .filter('title', 'match', JEJU_TITLE_SOURCE)
    .not('title', 'imatch', LISTY_TITLE_SOURCE)
    .not('title', 'imatch', TOPIC_TITLE_SOURCE)
    .order('posted_at', { ascending: false })
    .limit(NEXT_POSTS);
  if (error) throw new Error(`다음에 읽을 글을 고르지 못했어요 (${error.message})`);

  return { tally: tallyBacklog(rows), next: (next ?? []) as TNextPost[] };
}

/* ── 글 목록(수집 완료 칸, 09 T3.2) ───────────────────────────────────────────────────────────── */

export type TPostFilter = 'unanalyzed' | 'analyzed' | 'excluded';

/** 한 페이지 줄 수 — 3,360건을 한 번에 그리지 않는다. */
export const POSTS_PAGE = 50;

export type TPostRow = {
  url: string;
  title: string | null;
  keyword: string | null;
  posted_at: string | null;
  analyzed_at: string | null;
  /** 제외 칸이 없으면(미적용) 늘 undefined — select 에서 뺀다(넣으면 400). */
  excluded_at?: string | null;
  exclude_note?: string | null;
  /** `analysis->>promptVersion` — 분석된 글만. */
  promptVersion: string | null;
};

export type TPostPage = { rows: TPostRow[]; total: number };

/**
 * 줄의 상태 칩. **제외를 먼저 본다** — 분석된 뒤 제외한 글은 `제외` 칸에만 있고(분석됨 필터가 빼므로), 칩도 그 칸과 같은 말을 해야 한다.
 * 분석된 글은 프롬프트 버전 앞 8자(어느 판으로 읽혔나 — T3.3 의 분포와 같은 값), 버전이 없던 옛 분석은 `분석됨`.
 */
export function postStatus(row: Pick<TPostRow, 'analyzed_at' | 'excluded_at' | 'promptVersion'>): string {
  if (row.excluded_at) return '제외';
  if (!row.analyzed_at) return '미분석';
  return row.promptVersion ? row.promptVersion.slice(0, 8) : '분석됨';
}

/** 페이지 수 — 0건이어도 1(빈 페이지 하나를 `1 / 1` 로 말한다). */
export function postPageCount(total: number): number {
  return Math.max(1, Math.ceil(total / POSTS_PAGE));
}

/** `posted_at`(date, YYYY-MM-DD) → `25.10.07`. 모양이 아니면 그대로, 없으면 `날짜 없음`. */
export function postDateLabel(postedAt: string | null): string {
  if (!postedAt) return '날짜 없음';
  const match = /^\d{2}(\d{2})-(\d{2})-(\d{2})/.exec(postedAt);
  return match ? `${match[1]}.${match[2]}.${match[3]}` : postedAt;
}

/**
 * 한 페이지. 정렬은 글 날짜 최신순 + **`url` 둘째 키** — `posted_at` 은 날짜뿐이라 같은 날 글이 많고, 둘째 키가 없으면 50건 페이지가 겹치거나 빠진다.
 * 분석됨 필터는 제외한 글을 뺀다(제외 칩과 겹치지 않게 — 세 칩이 전체를 나눈다). 제외 칸이 없으면(`excludedApplied` false) 그 두 칸을 select 에서 빼고,
 * `excluded` 필터는 부를 수 없다(화면이 칩을 안 그린다).
 * `promptVersion` 은 분석됨 필터 안에서 판 하나로 좁힌다(09 T3.3 — undefined 면 전부, null 이면 판이 안 적힌 글). 다른 필터에선 무시한다.
 */
export async function fetchPosts(
  client: SupabaseClient,
  {
    filter,
    page,
    excludedApplied,
    promptVersion,
  }: { filter: TPostFilter; page: number; excludedApplied: boolean; promptVersion?: string | null },
): Promise<TPostPage> {
  if (filter === 'excluded' && !excludedApplied) throw new Error('글 단위 분석 제외는 DB 마이그레이션이 적용된 뒤에 쓸 수 있어요.');
  const columns: string = excludedApplied
    ? 'url, title, keyword, posted_at, analyzed_at, excluded_at, exclude_note, promptVersion:analysis->>promptVersion'
    : 'url, title, keyword, posted_at, analyzed_at, promptVersion:analysis->>promptVersion';
  let query = client.from('blog_posts').select(columns, { count: 'exact' });
  if (filter === 'unanalyzed') query = onlyUnanalyzed(query, excludedApplied);
  else if (filter === 'analyzed') query = withPromptVersion(onlyAnalyzed(query, excludedApplied), promptVersion);
  else query = query.not('excluded_at', 'is', null);
  const from = page * POSTS_PAGE;
  const { data, error, count } = await query
    .order('posted_at', { ascending: false, nullsFirst: false })
    .order('url')
    .range(from, from + POSTS_PAGE - 1);
  if (error) throw new Error(`수집한 글을 읽지 못했어요 (${error.message})`);
  return { rows: (data ?? []) as unknown as TPostRow[], total: count ?? 0 };
}

/** `in.(…)` 을 길이 예산으로 나눠 같은 patch 를 쓴다. 바뀐 행 수를 돌려준다. */
async function patchPosts(client: SupabaseClient, urls: string[], patch: Record<string, string | null>, what: string): Promise<number> {
  let changed = 0;
  for (const chunk of chunkForUrlFilter(urls) as string[][]) {
    const { error, count } = await client.from('blog_posts').update(patch, { count: 'exact' }).in('url', chunk);
    if (error) throw new Error(`${what} (${error.message})`);
    changed += count ?? 0;
  }
  return changed;
}

/**
 * 분석 제외 — 다음 `pnpm data analyze` 부터 그 글을 안 고른다. 이미 분석된 글을 제외해도 그 글의 후보는 그대로다(눕히려면 검수 대기에서).
 * 빈 사유는 null(공백 한 칸을 사유로 남기지 않는다).
 */
export function excludePosts(client: SupabaseClient, urls: string[], note: string): Promise<number> {
  return patchPosts(client, urls, { excluded_at: new Date().toISOString(), exclude_note: note.trim() || null }, '분석 제외를 적지 못했어요');
}

/** 제외 해제 — 사유도 같이 지운다. 미분석이던 글은 다시 분석 차례에 선다. */
export function unexcludePosts(client: SupabaseClient, urls: string[]): Promise<number> {
  return patchPosts(client, urls, { excluded_at: null, exclude_note: null }, '제외를 풀지 못했어요');
}

/**
 * 글 쪽 `다시 읽기` 의 계획(읽기만) — 후보 쪽 재분석과 **같은 규칙**이다(`adminReanalyze` 머리 주석의 규칙 1·4: 형제 후보까지 눕히고, 후보 먼저 글 나중).
 * 계획은 `reopenPlan`(사람이 반려한 후보가 딸린 글은 빼고, 사람이 고친 후보는 남긴다), 쓰기는 `prepareReanalyze` 그대로.
 * 분석된 글만 받는다 — 미분석 글은 다시 읽을 것이 없고, 제외한 글은 먼저 풀어야 한다(되돌려도 분석이 안 고른다).
 */
export async function planReread(client: SupabaseClient, rows: Pick<TPostRow, 'url' | 'analyzed_at' | 'excluded_at'>[]): Promise<TReopenPlan> {
  const urls = rows.filter((row) => row.analyzed_at && !row.excluded_at).map((row) => row.url);
  return reopenPlan(urls, await fetchSiblings(client, urls));
}

/** `다시 읽기` 확인 문장 — 후보 쪽 재분석 문장(`reanalyzeSummary`)에 뺀 글의 수만 덧붙인다(`reopenSummary` 는 "옛 규칙" 글의 말이라 여기 맞지 않는다). */
export function rereadSummary(plan: TReopenPlan): string {
  const skipped = plan.skipped ? ` 사람이 제외한 후보가 딸린 글 ${plan.skipped}건은 빼요(다시 읽으면 그 가게가 또 올라와요).` : '';
  return `${reanalyzeSummary(plan)}${skipped}`;
}

export type TPlaceRereadPlan = {
  /** 글 쪽 `다시 읽기` 와 같은 계획 — 쓰기는 `prepareReanalyze` 그대로(장소 `status` 는 건드리지 않는다). */
  plan: TReopenPlan;
  /** 출처 글 총수(중복 제거). 0 이면 Notion 시드처럼 다시 읽을 글이 없다. */
  sourceCount: number;
  /** 출처 글인데 미분석·분석 제외라 계획에서 빠진 수 — 되돌릴 것이 없다. */
  unreadable: number;
};

/** 장소들의 출처 글 url 합집합(순서 유지·중복 제거). 순수. */
export function unionSourceUrls(sources: Map<string, string[]>, placeIds: string[]): string[] {
  return [...new Set(placeIds.flatMap((id) => sources.get(id) ?? []))];
}

/**
 * 등록한 장소의 `다시 분석` 계획(읽기만) — 출처 글 합집합을 글 쪽 `planReread` 에 넘긴다.
 * 출처 글이 0이면 글을 읽지 않는다. 글 상태(`analyzed_at`·`excluded_at`)는 chunk 로 읽는다.
 */
export async function planPlaceReread(client: SupabaseClient, placeIds: string[]): Promise<TPlaceRereadPlan> {
  const urls = unionSourceUrls(await fetchPlaceSources(client, placeIds), placeIds);
  const rows: Pick<TPostRow, 'url' | 'analyzed_at' | 'excluded_at'>[] = [];
  for (const chunk of chunkForUrlFilter(urls) as string[][]) {
    const { data, error } = await client.from('blog_posts').select('url, analyzed_at, excluded_at').in('url', chunk);
    if (error) throw new Error(`출처 글을 읽지 못했어요 (${error.message})`);
    rows.push(...((data ?? []) as typeof rows));
  }
  const plan = await planReread(client, rows);
  // 읽은 글 중 계획에 못 든 것 = 미분석·제외(planReread 거름) + 사람이 반려한 형제가 있어 뺀 것(plan.skipped, 따로 말한다).
  const eligible = rows.filter((row) => row.analyzed_at && !row.excluded_at).length;
  return { plan, sourceCount: urls.length, unreadable: urls.length - eligible };
}

/** 확인 문장 — 사이트의 장소는 그대로이고 검수 대기에 갱신 제안으로 올라온다는 것. 글 쪽 문장(`rereadSummary`)에서 눕힐 후보·고친 후보·뺀 글을 이어 쓴다. */
export function placeRereadSummary({ plan, unreadable }: TPlaceRereadPlan): string {
  const lay = plan.lay.length ? ` 그 글의 검수 대기 후보 ${plan.lay.length}건은 '재분석' 표시로 내려가요.` : '';
  const kept = plan.keep.length ? ` 사람이 고친 후보 ${plan.keep.length}건은 그대로예요.` : '';
  const skipped = plan.skipped ? ` 사람이 제외한 후보가 딸린 글 ${plan.skipped}건은 빼요(다시 읽으면 그 가게가 또 올라와요).` : '';
  const unread = unreadable ? ` 아직 분석 전이거나 분석에서 뺀 글 ${unreadable}건은 되돌릴 것이 없어요.` : '';
  return `출처 글 ${plan.posts.length}건을 수집 완료로 되돌려요. 사이트의 장소는 그대로이고, 다음 분석 뒤 검수 대기에 갱신 제안으로 올라와요.${lay}${kept}${skipped}${unread}`;
}

export const NO_REREAD_SOURCES = '다시 읽을 글이 없어요';
