// 글 단위 분석 제외(`blog_posts.excluded_at`, docs/todo/09 T3.2) — 분석 스크립트와 상주 워커가 같은 조건을 쓰게 한 곳에 둔다.
// 칸은 마이그레이션(`20261007160000_blog_posts_exclude.sql`)이 원격에 적용돼야 생긴다. **미적용이어도 분석은 멈추지 않는다** —
// 칸이 없으면 경고 한 줄을 찍고 조건 없이 예전처럼 고른다(제외한 글이 있을 수 없으니 잃는 것이 없다).
import { isSchemaMissing } from './workerQueue.mjs';

export const EXCLUDE_MIGRATION = 'supabase/migrations/20261007160000_blog_posts_exclude.sql';

/**
 * 칸이 있나. **행을 받는 질의**(`limit(1)`)로 본다 — `head: true` 는 본문이 없어 오류의 code 가 비어 와 "칸 없음" 을 가릴 수 없다.
 * 칸 없음 말고 다른 실패(세션·네트워크)는 던진다 — 그것을 "미적용" 으로 삼키면 제외한 글을 조용히 다시 읽는다.
 * @returns {Promise<boolean>}
 */
export async function probeExcludedAt(client, warn = (line) => console.warn(line)) {
  const { error } = await client.from('blog_posts').select('excluded_at').limit(1);
  if (!error) return true;
  if (isSchemaMissing(error)) {
    warn(`⚠️ blog_posts.excluded_at 없음 — 글 단위 제외를 적용 못 한다, ${EXCLUDE_MIGRATION}`);
    return false;
  }
  throw new Error(`blog_posts.excluded_at 확인 실패: ${error.message}`);
}

/** 미분석 글을 고르는 질의에 "제외 안 함" 을 붙인다. 칸이 없으면(`applied` false) 그대로 돌려준다. */
export function notExcluded(query, applied) {
  return applied ? query.is('excluded_at', null) : query;
}
