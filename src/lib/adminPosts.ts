/**
 * 수집 완료 칸(`blog_posts`)의 건수 — 3,360행을 내려받지 않고 **세기만** 한다(`head: true`).
 *
 * `excluded_at`(글 단위 분석 제외, 09 T3.2)은 마이그레이션이 원격에 적용돼야 생긴다. 없으면 PostgREST 가 400 을 주는데,
 * 그것을 "제외 0건" 으로 읽지 않고 `excluded: null`(= 미적용)로 돌려준다 — 화면이 탭 라벨 옆에 `미적용` 을 단다(09 「실행 규약」).
 */

import type { SupabaseClient } from '@supabase/supabase-js';

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
export type TExistingTally = { total: number; same: number; stale: number; weak: number };

/** 순수 — 글마다의 `excluded` 배열을 받아 센다. 모르는 이유는 세지 않는다. */
export function tallyExistingReasons(excludedLists: unknown[]): TExistingTally {
  const out: TExistingTally = { total: 0, same: 0, stale: 0, weak: 0 };
  for (const list of excludedLists) {
    if (!Array.isArray(list)) continue;
    for (const entry of list) {
      const reason = (entry as { reason?: unknown } | null)?.reason;
      if (reason === 'sameAsSite' || reason === 'alreadyHave') out.same += 1;
      else if (reason === 'stale') out.stale += 1;
      else if (reason === 'weak') out.weak += 1;
      else continue;
      out.total += 1;
    }
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
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client
      .from('blog_posts')
      .select('excluded:analysis->excluded')
      .not('analyzed_at', 'is', null)
      .order('url')
      .range(from, from + PAGE - 1);
    if (error) return null;
    for (const row of (data ?? []) as { excluded?: unknown }[]) lists.push(row.excluded);
    if (!data || data.length < PAGE) break;
  }
  return tallyExistingReasons(lists);
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
