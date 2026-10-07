/**
 * 운영 현황(`/admin/ops`)의 **Realtime 구독** — `workers` · `pipeline_runs` 의 `postgres_changes` 를 받아 화면 상태만 고친다
 * (todo/17 T5.2 · ADR-024 결정 6). `ops_overview` 를 다시 부르지 않는다 — 워커가 15초마다 심장을, 5초마다 진행률을 쓰는데
 * 그때마다 집계 rpc 를 부르면 화면 하나가 DB 를 두드린다. 60초 폴링(`adminOpsPage`)은 끊김·놓친 이벤트의 안전망으로 남는다.
 *
 * 합치는 함수는 전부 순수다. 구독 자체(`subscribeOps`)만 클라이언트를 만진다 — 운영자 세션 클라이언트(`createAdminClient`)라야
 * RLS 를 지나 행이 온다(publishable 키로는 0건이 조용히 온다 — 그 파일 주석).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { RUN_COLUMNS, type TOpsOverview, type TOpsWorker, type TPipelineRun, type TRunScript } from './adminOps';
import { runState } from './adminOpsHealth';

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

const RUN_KEYS = RUN_COLUMNS.split(',');

/**
 * 이벤트의 `new` 를 실행 행으로 — `RUN_COLUMNS` 의 칸만 옮긴다(`operator` 는 화면이 읽지 않는 칸이라 버린다, `adminOps.ts`).
 * id·script·status·started_at 이 없으면 null(DELETE 의 빈 `new` · 모양이 어긋난 행).
 */
export function runFromRow(row: unknown): TPipelineRun | null {
  if (!isRecord(row)) return null;
  if (typeof row.id !== 'string' || typeof row.script !== 'string' || typeof row.status !== 'string' || typeof row.started_at !== 'string') return null;
  return Object.fromEntries(RUN_KEYS.map((key) => [key, row[key] ?? null])) as TPipelineRun;
}

export function workerFromRow(row: unknown): TOpsWorker | null {
  if (!isRecord(row) || typeof row.host !== 'string' || typeof row.last_seen_at !== 'string' || typeof row.phase !== 'string') return null;
  return {
    host: row.host,
    last_seen_at: row.last_seen_at,
    phase: row.phase as TOpsWorker['phase'],
    run_id: typeof row.run_id === 'string' ? row.run_id : null,
    started_at: typeof row.started_at === 'string' ? row.started_at : null,
    version: typeof row.version === 'string' ? row.version : null,
  };
}

/** 기기당 한 행 — host 로 바꿔 끼운다(없으면 더한다). 최근에 뛴 순은 `workerHealth` 가 다시 맞춘다. */
export function upsertWorker(workers: readonly TOpsWorker[], worker: TOpsWorker): TOpsWorker[] {
  return [worker, ...workers.filter((row) => row.host !== worker.host)];
}

export type TOpsRealtimeFilter = { scripts?: readonly TRunScript[] | null; failedOnly: boolean };

/** 지금 걸러 보기에 맞는 행인가 — `fetchRuns` 가 서버에서 거르는 것과 같은 규칙(실패만 = failed·partial·중단된 듯). */
export function runMatchesFilter(run: TPipelineRun, filter: TOpsRealtimeFilter, nowMs: number): boolean {
  if (filter.scripts && filter.scripts.length > 0 && !filter.scripts.includes(run.script)) return false;
  if (!filter.failedOnly) return true;
  const state = runState(run, nowMs);
  return state === 'failed' || state === 'partial' || state === 'stalled';
}

const startedMs = (run: Pick<TPipelineRun, 'started_at'>) => {
  const at = Date.parse(run.started_at);
  return Number.isNaN(at) ? -Infinity : at;
};

/**
 * 실행 기록 목록에 한 행. 걸러 보기에 맞으면 같은 id 를 바꾸거나 더하고, **맞지 않으면 뺀다** — `실패만` 에서 멎었던 행이 다시 뛰면
 * 그 행은 더 이상 실패가 아니다(`mergeRuns` 가 옛 행을 버리는 것과 같은 이유). 최신순을 다시 맞춘다.
 */
export function upsertRun(runs: readonly TPipelineRun[], run: TPipelineRun, accept: boolean): TPipelineRun[] {
  const rest = runs.filter((row) => row.id !== run.id);
  if (!accept) return rest;
  return [...rest, run].sort((a, b) => startedMs(b) - startedMs(a));
}

/**
 * 다섯 칸이 읽는 `runsLatest`·`runsLastOk` 도 같이 — 안 고치면 진행 막대는 움직이는데 분석 칸은 60초 동안 옛 상태를 말한다.
 * 같은 id 거나 더 늦게 시작한 행이면 바꾼다. ok·partial 만 마지막 성공이 된다.
 */
export function applyRunToOverview(overview: TOpsOverview, run: TPipelineRun): TOpsOverview {
  const newer = (current: TPipelineRun | undefined) => !current || current.id === run.id || startedMs(run) >= startedMs(current);
  const latest = overview.runsLatest[run.script];
  const lastOk = overview.runsLastOk[run.script];
  const okNow = run.status === 'ok' || run.status === 'partial';
  return {
    ...overview,
    runsLatest: newer(latest) ? { ...overview.runsLatest, [run.script]: run } : overview.runsLatest,
    runsLastOk: okNow && newer(lastOk) ? { ...overview.runsLastOk, [run.script]: run } : overview.runsLastOk,
  };
}

/** `subscribe` 의 상태 — `SUBSCRIBED` 가 아니면 화면이 "실시간 꺼짐" 을 말한다. */
export type TOpsRealtimeStatus = 'SUBSCRIBED' | 'TIMED_OUT' | 'CLOSED' | 'CHANNEL_ERROR';

/**
 * 구독 하나(채널 `ops`)에 두 표. 돌려준 함수가 채널을 뗀다(언마운트·다시 로그인할 때).
 * `postgres_changes_options.wait` — 이것 없이는 표가 publication 에 없어도 `SUBSCRIBED` 가 떠 "실시간 켜짐" 이 거짓말이 된다.
 * DELETE 는 오지 않는다(두 표 모두 delete GRANT 가 없다) — 와도 `new` 가 비어 버려진다.
 */
export function subscribeOps(
  client: SupabaseClient,
  on: { worker: (worker: TOpsWorker) => void; run: (run: TPipelineRun) => void; status: (status: TOpsRealtimeStatus) => void },
): () => void {
  const channel = client
    .channel('ops', { config: { postgres_changes_options: { wait: true } } })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'workers' }, (payload) => {
      const worker = workerFromRow(payload.new);
      if (worker) on.worker(worker);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'pipeline_runs' }, (payload) => {
      const run = runFromRow(payload.new);
      if (run) on.run(run);
    })
    .subscribe((status) => on.status(status));
  return () => {
    void client.removeChannel(channel);
  };
}
