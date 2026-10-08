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
 * `excludedApplied` — `blog_posts.excluded_at` 이 있나(`postExclusion.probeExcludedAt`, 워커 시작 때 한 번). 있으면 제외한 글을 "요청 글" 에서 뺀다:
 * 분석(`--requested-only`)이 그 글을 안 고르는데 수에 남으면 바퀴마다 빈 분석이 깨어난다(세기와 고르기는 같은 식 — 아래 승인 후보와 같은 이유).
 * @returns {Promise<{ collectQueued: number, requestedPosts: number, approved: number, requestRows: object[] }>}
 */
export async function readWorkerState(client, { excludedApplied = false } = {}) {
  const head = { count: 'exact', head: true };
  let requested = client.from('blog_posts').select('url', head).is('analyzed_at', null).not('requested_at', 'is', null);
  if (excludedApplied) requested = requested.is('excluded_at', null);
  const [collectQueued, requestedPosts, approved, requests] = await Promise.all([
    count(client.from('collect_requests').select('id', head).eq('status', 'queued'), '추가 수집 요청'),
    count(requested, '요청 글'),
    // 반영이 고르는 것과 같은 식(막 승인된 행은 묵힌다) — 다르면 반영이 건너뛴 행이 수에 남아 재시도 간격(30분)에 걸린다.
    count(client.from('candidates').select('id', head).eq('status', 'approved').or(settledApprovedFilter(Date.now())), '승인 후보'),
    client.from('pipeline_requests').select('id, kind, args, status, taken_at').in('status', ['queued', 'taken']).order('requested_at', { ascending: true }),
  ]);
  if (requests.error) throw new Error(`pipeline_requests 조회 실패: ${requests.error.message}`);
  return { collectQueued, requestedPosts, approved, requestRows: requests.data ?? [] };
}

/**
 * 요청 행을 **원자적으로** 집는다(queued → taken). 두 워커(PC · Vercel)가 같은 줄을 동시에 집을 수 있어, 행마다 **관찰한 상태가 그대로일 때만** 바꾸고
 * (`update … where id = ? and status = ?`) 돌아온 행 수로 이겼는지 안다 — 1행이면 내 것, 0행이면 남이 먼저 집었다.
 * 10분 넘은 `taken`(집은 워커가 죽었다)을 다시 집을 때는 `taken_at` 도 같아야 한다 — 둘이 동시에 되집으면 `taken_at` 이 먼저 바뀐 쪽만 이긴다.
 * **실패해도 단계는 돈다는 태도는 그대로다**(경고 한 줄, 그 행은 못 집은 것으로 친다) — 못 집은 줄은 queued 로 남아 다음 바퀴가 다시 집는다.
 * @param {{ id: string, status: string, taken_at?: string|null }[]} rows  `pickRequests` 가 고른 행(관찰한 상태)
 * @returns {Promise<object[]>} 집힌 행들(받은 객체 그대로)
 */
export async function takeRequests(client, rows, nowIso, warn = (line) => console.warn(line)) {
  const taken = [];
  for (const row of rows) {
    let query = client.from('pipeline_requests').update({ status: 'taken', taken_at: nowIso }).eq('id', row.id).eq('status', row.status);
    if (row.status === 'taken') query = row.taken_at ? query.eq('taken_at', row.taken_at) : query.is('taken_at', null);
    const { data, error } = await query.select('id');
    if (error) warn(`⚠️ 요청 ${row.id} 를 taken 으로 못 적음 — ${error.message}`);
    else if ((data ?? []).length > 0) taken.push(row);
  }
  return taken;
}

/**
 * 요청 행을 **행마다** 닫는다(`requestClose` 가 정한 patch — 되돌릴 때 `args.attempts` 가 행마다 달라 한 번에 못 쓴다). `takeRequests` 와 같은 태도로 fail-soft.
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

// ── 두 워커의 비킴(ADR-028 결정 10) ─────────────────────────────────────
// 서버 워커(Vercel)는 `workers` 에 `host = 'vercel'` 한 행을 쓴다. 로컬은 그 행이 일하는 중이면 이번 바퀴를 넘기고(같은 글을 둘이 분석하면 후보가 둘 생긴다 —
// `candidates` 에 유일 제약이 없다), 서버는 로컬이 살아서 일할 수 있으면 비킨다. 둘 다 **심장(last_seen_at)이 최근일 때만** 믿는다.
export const REMOTE_WORKER_HOST = 'vercel';
/** 심장이 이 안에 뛰었으면 살아 있다 — 심장 주기(15초)의 네 배. */
export const PEER_FRESH_MS = 60_000;

const fresh = (row, now) => {
  const seen = Date.parse(row?.last_seen_at);
  return Number.isFinite(seen) && now - seen <= PEER_FRESH_MS;
};

/** 서버 워커가 지금 일하나 — vercel 행이 60초 안에 뛰었고 phase 가 idle 이 아니다. 시각을 못 읽으면 false(워커를 멈출 근거가 아니다). */
export function remoteWorkerBusy(rows, now) {
  const row = (rows ?? []).find((r) => r.host === REMOTE_WORKER_HOST);
  return Boolean(row) && fresh(row, now) && row.phase !== 'idle';
}

/**
 * 로컬 워커가 **일할 수 있는 채로** 살아 있나(서버가 비킬지 정한다). vercel 이 아닌 행 중 60초 안에 뛴 것이 있어야 하고,
 * `login-needed`·`rate-limited` 인 로컬은 지금 일을 못 하므로 **살아 있다고 치지 않는다** — PC 워커가 로그인을 기다리는 동안 서버가 대신 돌아야 큐가 안 막힌다.
 */
export function localWorkerAlive(rows, now) {
  return (rows ?? []).some((r) => r.host !== REMOTE_WORKER_HOST && fresh(r, now) && r.phase !== 'login-needed' && r.phase !== 'rate-limited');
}

/** `workers` 의 비킴 판단 재료. 오류는 던진다 — 부르는 쪽이 fail-open 으로 다룬다(로컬 워커를 멈출 일이 아니다). */
export async function readWorkerPeers(client) {
  const { data, error } = await client.from('workers').select('host, phase, last_seen_at');
  if (error) throw new Error(`workers 조회 실패: ${error.message}`);
  return data ?? [];
}
