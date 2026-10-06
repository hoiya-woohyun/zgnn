// `/admin` 의 **추가 수집 요청**(`collect_requests`)을 스크립트 쪽에서 다룬다 — `data:collect` 가 대기 중인 요청을 검색하고 결과를 적고,
// `data:analyze` 가 그 요청이 담은 글을 미분석 줄 맨 앞에 세운다. 화면 쪽은 src/lib/adminCollectRequest.ts, 표는 마이그레이션 20261007120000.
//
// **표가 원격에 없어도 실행을 멈추지 않는다** — 마이그레이션은 사용자가 따로 `db push` 하고, 그 전에도 수집·분석은 지금처럼 돌아야 한다.
// 없으면 경고 한 줄과 함께 "요청 0건" 이다.

/** 표가 원격에 없을 때의 오류인가(PostgREST `PGRST205` · Postgres `42P01`). src/lib/adminBlocks.ts 의 `isBlocksUnavailable` 과 같은 판정. */
export function isTableMissing(error) {
  if (!error) return false;
  return (
    error.code === 'PGRST205' ||
    error.code === '42P01' ||
    /could not find the table|relation .* does not exist|schema cache/i.test(error.message ?? '')
  );
}

/** 끝난 요청이 미분석 줄 맨 앞에 서는 기간. 그 뒤로는 보통 글처럼 최신순에 섞인다. */
export const REQUEST_PRIORITY_DAYS = 30;

/**
 * 요청 하나의 결과 — 검색이 담은 행과, 실행 전에 DB 에 있던 url 집합으로. 순수.
 * `new_posts` 를 따로 적는 이유: upsert 는 `ignoreDuplicates` 라 이미 있던 글은 아무것도 안 바뀐다 — 그것만 찾았으면 "새로 읽을 글이 없다" 고 말해야 한다.
 * @param {{ url: string }[]} rows
 * @param {Set<string>} existingUrls
 */
export function requestOutcome(rows, existingUrls) {
  const urls = [...new Set(rows.map((row) => row.url))];
  return { found: urls.length, new_posts: urls.filter((url) => !existingUrls.has(url)).length, post_urls: urls };
}

/** 대기 중인 요청(먼저 누른 것부터). 표가 없으면 `{ requests: [], missing: true }`. 그 밖의 오류는 던진다. */
export async function fetchQueuedRequests(supabase) {
  const { data, error } = await supabase.from('collect_requests').select('id, query').eq('status', 'queued').order('requested_at', { ascending: true });
  if (isTableMissing(error)) return { requests: [], missing: true };
  if (error) throw new Error(`collect_requests 조회 실패: ${error.message}`);
  return { requests: data ?? [], missing: false };
}

/** 요청 하나를 끝냈다고 적는다. upsert 가 끝난 **뒤에만** 부른다 — 그 전에 죽으면 요청은 대기로 남아 다음 실행이 다시 한다. */
export async function markRequestDone(supabase, id, outcome, now) {
  const { error } = await supabase
    .from('collect_requests')
    .update({ status: 'done', done_at: now, ...outcome })
    .eq('id', id);
  if (error) throw new Error(`collect_requests 갱신 실패: ${error.message}`);
}

/** 최근(`REQUEST_PRIORITY_DAYS`) 끝난 요청들이 담은 글 url. 표가 없거나 읽지 못하면 빈 배열 — 분석의 순서만 바뀔 뿐 막을 일이 아니다. */
export async function recentRequestUrls(supabase, now = new Date()) {
  const since = new Date(now.getTime() - REQUEST_PRIORITY_DAYS * 86_400_000).toISOString();
  const { data, error } = await supabase.from('collect_requests').select('post_urls').eq('status', 'done').gte('done_at', since);
  if (error) {
    if (!isTableMissing(error)) console.warn(`⚠️ 추가 수집 요청을 못 읽었다(순서만 보통대로) — ${error.message}`);
    return [];
  }
  return [...new Set((data ?? []).flatMap((row) => row.post_urls ?? []))];
}
