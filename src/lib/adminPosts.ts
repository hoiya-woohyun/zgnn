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
};

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

  return { total: total.count ?? 0, unanalyzed: unanalyzed.count ?? 0, excluded: excludedCount };
}
