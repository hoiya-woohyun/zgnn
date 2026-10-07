// 상주 워커가 "할 일" 을 세는 얇은 DB 호출(docs/todo/17 T3.1). 판단은 `workerLoop.mjs`, 여기는 질의뿐이다.
// 큐는 대부분 기존 표의 상태 칸이다(ADR-024 결정 2) — 새 표는 `pipeline_requests` 하나. 수만 세는 질의는 `head: true` 로 행을 받지 않는다.
import { settledApprovedFilter } from '../analyze/applyApproved.mjs';
import { isTableMissing } from './collectRequests.mjs';

/** 표나 칸이 원격에 없나(마이그레이션 미적용). 칸 없음은 Postgres 42703 · PostgREST 가 schema cache 를 말하는 꼴. */
export function isSchemaMissing(error) {
  return isTableMissing(error) || error?.code === '42703' || /column .* does not exist/i.test(error?.message ?? '');
}

const MIGRATION_HINT = '마이그레이션 미적용 — supabase/migrations/20261007140000_local_worker.sql 을 db push 한 뒤 다시';

/**
 * 워커가 기대는 표·칸이 원격에 있나. **행을 받는 질의**(`limit(1)`)로 본다 — `head: true` 는 본문이 없어 오류의 code 가 비어 오기 때문이다.
 * @returns {Promise<string|null>} 문제가 있으면 사람에게 보일 한 줄
 */
export async function checkWorkerSchema(client) {
  const probes = [
    ['workers', 'host'],
    ['pipeline_requests', 'id'],
    ['blog_posts', 'requested_at'],
  ];
  for (const [table, column] of probes) {
    const { error } = await client.from(table).select(column).limit(1);
    if (!error) continue;
    if (isSchemaMissing(error)) return `${table}.${column} 이 없다 — ${MIGRATION_HINT}`;
    return `${table} 조회 실패: ${error.message}`;
  }
  return null;
}

async function count(query, what) {
  const { count: n, error } = await query;
  if (error) throw new Error(`${what} 세기 실패: ${error.message || '(본문 없음)'}`);
  return n ?? 0;
}

/**
 * 한 바퀴의 판단 재료 — `planCycle` 이 읽는 이름 그대로. `requestRows` 는 `pickRequests` 가 고르도록 queued·taken 전부.
 * @returns {Promise<{ collectQueued: number, requestedPosts: number, approved: number, requestRows: object[] }>}
 */
export async function readWorkerState(client) {
  const head = { count: 'exact', head: true };
  const [collectQueued, requestedPosts, approved, requests] = await Promise.all([
    count(client.from('collect_requests').select('id', head).eq('status', 'queued'), '추가 수집 요청'),
    count(client.from('blog_posts').select('url', head).is('analyzed_at', null).not('requested_at', 'is', null), '요청 글'),
    // 반영이 고르는 것과 같은 식(막 승인된 행은 묵힌다) — 다르면 반영이 건너뛴 행이 수에 남아 재시도 간격(30분)에 걸린다.
    count(client.from('candidates').select('id', head).eq('status', 'approved').or(settledApprovedFilter(Date.now())), '승인 후보'),
    client.from('pipeline_requests').select('id, kind, args, status, taken_at').in('status', ['queued', 'taken']).order('requested_at', { ascending: true }),
  ]);
  if (requests.error) throw new Error(`pipeline_requests 조회 실패: ${requests.error.message}`);
  return { collectQueued, requestedPosts, approved, requestRows: requests.data ?? [] };
}

/**
 * 요청 행의 상태를 바꾼다(queued → taken → done). **실패해도 단계는 돈다** — 못 적은 taken 은 10분 뒤 다시 집히고, 못 적은 done 은
 * 다음 바퀴가 같은 요청을 한 번 더 할 뿐이다(세 단계 모두 멱등). 그래서 던지지 않고 경고 한 줄.
 */
export async function markRequests(client, ids, patch, warn = (line) => console.warn(line)) {
  if (ids.length === 0) return;
  const { error } = await client.from('pipeline_requests').update(patch).in('id', ids);
  if (error) warn(`⚠️ 요청 ${ids.length}건을 ${patch.status} 로 못 적음 — ${error.message}`);
}

/**
 * 요청 행을 **행마다** 닫는다(`requestClose` 가 정한 patch — 되돌릴 때 `args.attempts` 가 행마다 달라 한 번에 못 쓴다). `markRequests` 와 같은 태도로 fail-soft.
 * @param {{ id: string, args?: object|null }[]} rows
 * @param {(row: object) => { patch: object, gaveUp: boolean }} decide
 */
export async function closeRequests(client, rows, decide, warn = (line) => console.warn(line)) {
  for (const row of rows) {
    const { patch, gaveUp } = decide(row);
    if (gaveUp) warn(`⚠️ 요청 ${row.id} 가 ${patch.args?.attempts}번 돌지 못해 done 으로 닫는다 — 터미널의 앞선 줄(잠금·키·세션)을 보고 /admin 에서 다시 넣는다`);
    const { error } = await client.from('pipeline_requests').update(patch).eq('id', row.id);
    if (error) warn(`⚠️ 요청 ${row.id} 를 ${patch.status} 로 못 적음 — ${error.message}`);
  }
}
