/**
 * 수집 완료 칸(`blog_posts`)의 건수 — 3,360행을 내려받지 않고 **세기만** 한다(`head: true`).
 *
 * `excluded_at`(글 단위 분석 제외, 09 T3.2)은 마이그레이션이 원격에 적용돼야 생긴다. 없으면 PostgREST 가 400 을 주는데,
 * 그것을 "제외 0건" 으로 읽지 않고 `excluded: null`(= 미적용)로 돌려준다 — 화면이 탭 라벨 옆에 `미적용` 을 단다(09 「실행 규약」).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { chunkForUrlFilter } from '../../scripts/lib/chunkForUrlFilter.mjs';
import type { TCandidateRow } from './adminCandidates';
import { EDITED_NOTE } from './adminApply';
import { REANALYZE_NOTE, type TReanalyzePlan } from './adminReanalyze';

export type TPostCounts = {
  total: number;
  /** 아직 `data:analyze` 가 읽지 않은 글. `excluded_at` 이 있으면 분석 제외한 글은 뺀다. */
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
   * **옛 규칙**(`alreadyHave`, 차이 게이트 전)으로 버려진 장소가 있는 글 url — 차이 게이트를 한 번도 못 지났다.
   * 수집 완료 칸의 `다시 열기` 가 이 글들을 수집 완료로 되돌린다(11 런북 3단계를 화면으로).
   */
  alreadyHavePosts: string[];
};

/** 순수 — 글마다의 `excluded` 배열을 받아 센다. 모르는 이유는 세지 않는다. */
export function tallyExistingReasons(excludedLists: unknown[], urls: (string | null)[] = []): TExistingTally {
  const out: TExistingTally = { total: 0, same: 0, stale: 0, weak: 0, alreadyHavePosts: [] };
  for (const [index, list] of excludedLists.entries()) {
    if (!Array.isArray(list)) continue;
    let old = false;
    for (const entry of list) {
      const reason = (entry as { reason?: unknown } | null)?.reason;
      if (reason === 'alreadyHave') old = true;
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
  return `옛 규칙으로 기존 가게를 건너뛴 글 ${plan.posts.length}건을 수집 완료로 되돌려요. 그 글의 검수 대기 후보 ${plan.lay.length}건은 '재분석' 표시로 내려가요.${kept}${skipped} 다음 pnpm data:analyze 가 사이트와 대 보며 다시 읽어요.`;
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
