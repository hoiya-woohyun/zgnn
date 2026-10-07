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
import { REANALYZE_NOTE, type TReanalyzePlan } from './adminReanalyze';

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
  return `옛 규칙으로 기존 가게를 건너뛴 글 ${plan.posts.length}건을 수집 완료로 되돌려요. 그 글의 검수 대기 후보 ${plan.lay.length}건은 '재분석' 표시로 내려가요.${kept}${skipped} 다음 pnpm data analyze 가 사이트와 대 보며 다시 읽어요.`;
}

const headCount = (client: SupabaseClient) => client.from('blog_posts').select('url', { count: 'exact', head: true });

export async function countPosts(client: SupabaseClient): Promise<TPostCounts> {
  const total = await headCount(client);
  if (total.error) throw new Error(`수집한 글을 세지 못했어요 (${total.error.message})`);

  const excluded = await headCount(client).not('excluded_at', 'is', null);
  const excludedCount = excluded.error ? null : (excluded.count ?? 0);

  let pending = headCount(client).is('analyzed_at', null);
  if (excludedCount !== null) pending = pending.is('excluded_at', null);
  const unanalyzed = await pending;
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
 * 미분석 · 제목에 반려동물 말과 제주 지명 · 목록·주제 글 아님 · 최신순. 스크립트는 제외 칸을 거르지 않으므로 여기서도 안 거른다.
 * 블로그당 상한(`maxPerBlog`)·한 가게 블로그 후순위는 재현하지 않는다 — 화면이 "대략" 이라고 말한다.
 */
export async function fetchPostBacklog(client: SupabaseClient, excludedApplied: boolean): Promise<TPostBacklog> {
  const rows: { keyword: string | null; posted_at: string | null }[] = [];
  for (let from = 0; ; from += PAGE) {
    let query = client.from('blog_posts').select('keyword, posted_at').is('analyzed_at', null);
    if (excludedApplied) query = query.is('excluded_at', null);
    const { data, error } = await query.order('url').range(from, from + PAGE - 1);
    if (error) throw new Error(`미분석 글을 읽지 못했어요 (${error.message})`);
    rows.push(...((data ?? []) as typeof rows));
    if (!data || data.length < PAGE) break;
  }

  const { data: next, error } = await client
    .from('blog_posts')
    .select('url, title, keyword, posted_at')
    .is('analyzed_at', null)
    .filter('title', 'imatch', PET_TITLE_SOURCE)
    .filter('title', 'match', JEJU_TITLE_SOURCE)
    .not('title', 'imatch', LISTY_TITLE_SOURCE)
    .not('title', 'imatch', TOPIC_TITLE_SOURCE)
    .order('posted_at', { ascending: false })
    .limit(NEXT_POSTS);
  if (error) throw new Error(`다음에 읽을 글을 고르지 못했어요 (${error.message})`);

  return { tally: tallyBacklog(rows), next: (next ?? []) as TNextPost[] };
}
