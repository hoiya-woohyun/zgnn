/**
 * 운영 현황 화면(`/admin/ops`)이 DB 에서 읽는 것 — 집계 rpc 하나와 실행 기록(`pipeline_runs`) 조회(docs/todo/15 T3.2 · ADR-023 결정 4).
 *
 * 화면은 **읽기만** 한다. 실행 기록을 고치는 함수(중단된 행을 닫기 등)는 일부러 없다 — 기록을 화면이 고치기 시작하면 정본이 둘이 된다
 * (features/ops-dashboard.md ③). 건강 판정(초록·노랑·빨강)도 여기 없다 — `adminOpsHealth.ts` 한 곳이 가진다.
 *
 * 타입은 마이그레이션 `20261006120000_pipeline_runs.sql` 의 `ops_overview`(최신 정의는 `20261007140000_local_worker.sql`)가 만드는 json 을 **키 이름 그대로** 옮겨 적은 것이다.
 * 생성된 DB 타입이 없어 손으로 적는다 — 저쪽 키를 바꾸면 여기도 바꾼다(화면이 `undefined` 를 0 으로 읽고 조용히 틀린 수를 말하게 된다).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { TRebuildEntry } from './adminRebuild';
import {
  formatAnalyzeSummary,
  formatApplySummary,
  formatCollectSummary,
  formatReviewSummary,
  formatUsageSummary,
  type TAnalyzeStats,
  type TApplyStats,
  type TCollectStats,
  type TReviewStats,
  type TUsageTotals,
} from './runSummary';

export type TRunScript = 'collect' | 'analyze' | 'apply' | 'approve' | 'reject';

/** 저장된 상태. 화면이 보는 상태(`중단된 듯` 포함)는 `adminOpsHealth.runState` 가 이것과 `heartbeat_at` 으로 계산한다. */
export type TRunStatus = 'running' | 'ok' | 'partial' | 'failed';

/** Slack 트리거(T5)가 남기는 칸. T5 전까지는 언제나 null 이다. */
export type TRunAlert = {
  state: 'sent' | 'missing' | 'error';
  requestId?: number;
  responseStatus?: number | null;
  respondedAt?: string | null;
  responseError?: string | null;
  note?: string;
};

/** `pipeline_runs` 한 행 — `operator` 는 화면에 쓸 데가 없어 읽지 않는다(`RUN_COLUMNS`, rpc 도 `- 'operator'` 로 뺀다). */
export type TPipelineRun = {
  id: string;
  script: TRunScript;
  status: TRunStatus;
  started_at: string;
  ended_at: string | null;
  heartbeat_at: string | null;
  /** 플래그 목록·개수만(값 없음). 스크립트마다 모양이 다르다 */
  args: unknown;
  /** 콘솔 요약 줄이 읽는 수 전부(`runSummary.ts` 의 입력 그대로). 손으로 고친 행일 수 있어 모양을 믿지 않는다 */
  stats: Record<string, unknown> | null;
  /** 분류 문구 한 줄("Claude 인증 실패" 등) */
  error: string | null;
  alert: TRunAlert | null;
  /**
   * 진행률(로컬 워커, ADR-024) — 마이그레이션 `20261007140000` 의 칸이라 그 전 응답엔 없다. `RUN_COLUMNS` 에는 아직 넣지 않는다
   * (적용 전에 넣으면 PostgREST 가 없는 칸으로 42703 을 내 실행 기록 목록이 통째로 깨진다). rpc 의 `runsLatest` 에는 `to_jsonb` 라 저절로 실린다.
   */
  progress?: { done?: number; total?: number; current?: string } | null;
};

export const RUN_COLUMNS = 'id,script,status,started_at,ended_at,heartbeat_at,args,stats,error,alert';

/** `rebuild_status(5)` 와 같은 행 + `responded_at`(재빌드 칸의 "응답 null 이 3분 넘음" 판정에 쓴다). */
export type TOpsRebuildEntry = TRebuildEntry & { responded_at: string | null };

export type TOpsFunnel = {
  newPosts: number;
  analyzed: number;
  candidates: number;
  /** `reviewed_at` 이 기간 안이고 approved·merged(반영되면 merged 로 바뀌므로 둘 다) */
  approved: number;
  rejected: number;
  applied: number;
  /** 2xx 를 받은 재빌드 */
  rebuilds: number;
  /** 기간 무관 — 지금 pending 수 */
  pendingNow: number;
};

export type TOpsOverview = {
  days: number;
  /** 스크립트별 마지막 실행. 한 번도 안 돈 스크립트는 키가 없다 */
  runsLatest: Partial<Record<TRunScript, TPipelineRun>>;
  /** 스크립트별 마지막 ok·partial 실행 — 마지막 실행이 failed 일 때 "마지막 성공" 을 답하려고 따로 받는다 */
  runsLastOk: Partial<Record<TRunScript, TPipelineRun>>;
  funnel: TOpsFunnel;
  backlog: { count: number; oldestFetchedAt: string | null };
  pending: { count: number; oldestCreatedAt: string | null };
  /** approved 인데 merged 아님(= `countStrandedCandidates`) */
  stranded: number;
  usage30d: {
    claudeCalls: number;
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    naverCalls: number;
    rebuilds2xx: number;
  };
  rebuildRecent: TOpsRebuildEntry[];
  /** Vault 에 `slack_webhook_url` **이름**이 있는가. URL 은 오지 않는다 */
  slackConfigured: boolean;
  /** 로컬 워커 심장(최근에 본 순). 마이그레이션 `20261007140000` 전의 응답엔 키가 없다 */
  workers?: TOpsWorker[];
  /** `pipeline_requests` 의 queued 수. 위와 같이 적용 전엔 없다 */
  requestsQueued?: number;
};

export type TWorkerPhase = 'idle' | 'collect' | 'analyze' | 'apply' | 'login-needed' | 'rate-limited';

/** `workers` 한 행(기기당 하나). 살아 있나 판정(5분)은 `adminOpsHealth` 가 `last_seen_at` 으로 한다 */
export type TOpsWorker = {
  host: string;
  last_seen_at: string;
  phase: TWorkerPhase;
  run_id: string | null;
  started_at: string | null;
  /** git sha 짧게 */
  version: string | null;
};

export async function fetchOpsOverview(client: SupabaseClient, days: number): Promise<TOpsOverview> {
  const { data, error } = await client.rpc('ops_overview', { days });
  if (error) throw new Error(`운영 현황: ${error.message}`);
  // definer 함수가 운영자가 아니면 42501 로 던지므로 null 은 함수가 없거나 모양이 바뀐 것이다 — 빈 화면을 "기록 없음" 으로 그리지 않는다.
  if (!data || typeof data !== 'object') throw new Error('운영 현황: 집계가 비어 왔어요 — ops_overview 마이그레이션을 확인해 주세요.');
  return data as TOpsOverview;
}

/** 한 번에 읽는 실행 기록 수. 하루 몇 번 도는 표라 30이면 한 주가 넘는다. */
export const RUNS_PAGE_SIZE = 30;

export type TRunsQuery = {
  /** 이 스크립트들만. 비우면 전부 — `승인` 칩은 approve·reject 둘을 함께 준다(둘 다 `data:review` 다) */
  scripts?: readonly TRunScript[];
  /**
   * 일이 잘못된 행만 — `failed`·`partial`, 그리고 `heartbeat_at` 이 `stalledBefore` 보다 오래된 `running`(중단된 듯).
   * 중단된 듯은 저장된 상태가 아니라 계산한 상태라 기준 시각을 부르는 쪽이 준다(임계값은 `adminOpsHealth` 가 가진다).
   */
  failedOnly?: { stalledBefore: string };
  /** 이 `started_at` 보다 앞선 행부터(무한 스크롤의 다음 장). 최신순이라 마지막 행의 `started_at` 을 넘긴다 */
  before?: string;
  limit?: number;
};

/**
 * 실행 기록 한 장(최신순). 비운영자에게 RLS 는 에러가 아니라 0행을 주지만, 이 화면은 그 전에 `is_operator` 로 갈라 둔다.
 */
export async function fetchRuns(client: SupabaseClient, query: TRunsQuery = {}): Promise<TPipelineRun[]> {
  let request = client.from('pipeline_runs').select(RUN_COLUMNS);
  if (query.scripts && query.scripts.length > 0) request = request.in('script', [...query.scripts]);
  if (query.failedOnly) {
    request = request.or(
      // 심장이 null 인 running(옛 행·손으로 넣은 행)은 `runState` 가 시작 시각으로 판정한다 — SQL 의 `null < x` 는 거짓이라 같은 갈래를 따로 둔다.
      `status.in.(failed,partial),and(status.eq.running,or(heartbeat_at.lt.${query.failedOnly.stalledBefore},and(heartbeat_at.is.null,started_at.lt.${query.failedOnly.stalledBefore})))`,
    );
  }
  if (query.before) request = request.lt('started_at', query.before);
  const { data, error } = await request.order('started_at', { ascending: false }).limit(query.limit ?? RUNS_PAGE_SIZE);
  if (error) throw new Error(`실행 기록: ${error.message}`);
  return (data ?? []) as TPipelineRun[];
}

/**
 * 새로 읽은 첫 장을 이미 든 목록에 **id 로 합친다** — 화면이 60초마다 갈아 끼우면 더 불러온 장·펼친 줄·스크롤이 날아간다.
 * 같은 id 는 새 행이 이긴다(돌던 행이 끝났을 수 있다). 최신순을 다시 맞춘다. 순수.
 *
 * 다만 첫 장이 덮는 구간(첫 장의 마지막 행보다 새것 — 첫 장이 덜 찼으면 걸러 본 결과 전부)에서 **첫 장에 없는 옛 행은 버린다.**
 * 걸러 보기(`실패만`)에서 멎었던 심장이 다시 뛰거나 실행이 끝나면 그 행은 더 이상 맞지 않는데, 더하기만 하면 옛 "중단된 듯" 이 남는다.
 */
export function mergeRuns(
  current: readonly TPipelineRun[],
  fresh: readonly TPipelineRun[],
  pageSize: number = RUNS_PAGE_SIZE,
): TPipelineRun[] {
  const freshIds = new Set(fresh.map((run) => run.id));
  const floor = fresh.length >= pageSize ? fresh.at(-1)?.started_at : undefined;
  const covered = (run: TPipelineRun) => floor === undefined || run.started_at >= floor;
  const byId = new Map(current.filter((run) => freshIds.has(run.id) || !covered(run)).map((run) => [run.id, run]));
  for (const run of fresh) byId.set(run.id, run);
  return [...byId.values()].sort((a, b) => (a.started_at < b.started_at ? 1 : a.started_at > b.started_at ? -1 : 0));
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 행 하나 — Slack 링크의 `?run=<id>` 로 들어왔을 때. **주소에서 온 값이라 uuid 모양부터 본다** — 아니면 PostgREST 가
 * 22P02(잘못된 uuid)로 던지고 그 문장이 화면에 뜬다. 모양이 아니거나 행이 없으면 null(조용히 첫 장만 보여 준다).
 */
export async function fetchRun(client: SupabaseClient, id: string): Promise<TPipelineRun | null> {
  if (!UUID.test(id)) return null;
  const { data, error } = await client.from('pipeline_runs').select(RUN_COLUMNS).eq('id', id).maybeSingle();
  if (error) throw new Error(`실행 기록: ${error.message}`);
  return (data ?? null) as TPipelineRun | null;
}

const NO_USAGE: TUsageTotals = { calls: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

/**
 * 실행 기록의 요약 열 — **터미널에 찍힌 줄과 글자까지 같은 문장**(features/ops-dashboard.md ③). 새 문장을 만들지 않고 스크립트가 찍을 때
 * 부른 `runSummary.ts` 의 함수를 같은 인자로 다시 부른다. analyze 의 계량기 한 줄도 스크립트와 같이 `formatUsageSummary('추출', meters.extract)`
 * 다(`analyze-candidates.mjs` 의 마지막 줄). 그 밑의 교차점검·제안 계량기 줄은 콘솔에서도 따로 찍히는 줄이라 여기 싣지 않는다 — 펼친 줄의 stats 에 있다.
 *
 * 만들 수 없으면 null — stats 가 없거나(돌다 죽었다) 모양이 어긋난 행(손으로 고친 행 · 옛 행)이다. **틀린 문장보다 빈 칸이 낫다**:
 * 요약 함수는 옛 행을 위해 일부 칸만 `?? 0` 으로 받으므로, 빠진 칸이 있으면 던지지 않고 `NaN`·`undefined` 를 문장에 넣는다. 그 글자가 보이면 버린다.
 */
export function runSummaryLine(run: Pick<TPipelineRun, 'script' | 'stats'>): string | null {
  const stats = run.stats;
  if (!stats || typeof stats !== 'object' || Array.isArray(stats) || !numericLeaves(stats)) return null;
  let line: string;
  try {
    switch (run.script) {
      case 'collect':
        line = formatCollectSummary(stats as TCollectStats);
        break;
      case 'analyze': {
        const analyze = stats as TAnalyzeStats;
        line = formatAnalyzeSummary(analyze, formatUsageSummary('추출', analyze.meters?.extract ?? NO_USAGE));
        break;
      }
      case 'apply':
        line = formatApplySummary(stats as TApplyStats);
        break;
      case 'approve':
      case 'reject':
        line = formatReviewSummary(run.script, stats as TReviewStats);
        break;
      default:
        return null;
    }
  } catch {
    return null;
  }
  return /NaN|undefined/.test(line) ? null : line;
}

/**
 * stats 의 잎이 전부 유한한 수인가 — `apply` 의 `draftWaiting`(못 셌으면 null)만 null 을 허락한다. 요약 함수는 칸을 믿고 더하므로
 * `null` 은 "null건" 으로, 문자열 `"3"` 은 덧셈이 이어붙이기가 되어 **그럴듯한 틀린 수**(`제외 300000000`)로 나온다 — 글자로는 못 걸러 모양을 먼저 본다.
 * `adminOpsHealth` 가 문자열 수를 수로 치지 않는 것과 같은 태도다.
 */
function numericLeaves(value: unknown, key = ''): boolean {
  if (typeof value === 'number') return Number.isFinite(value);
  if (value === null) return key === 'draftWaiting';
  if (typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.entries(value as Record<string, unknown>).every(([inner, child]) => numericLeaves(child, inner));
}

/**
 * 소요 열 — 끝났으면 `ended_at − started_at`, 아직 안 끝났으면 "N분째"(지금까지). 분석은 보통 수십 분이라 초는 1분 안쪽에서만 쓴다.
 * 콘솔의 `formatElapsed`(12.4초 · 2분 3초)와 다르다 — 그쪽은 한 번 찍고 끝나는 줄이고, 여기는 열을 세로로 훑는 칸이다.
 */
export function runDurationLabel(run: Pick<TPipelineRun, 'started_at' | 'ended_at'>, nowMs: number): string {
  const start = Date.parse(run.started_at);
  const end = run.ended_at ? Date.parse(run.ended_at) : nowMs;
  if (Number.isNaN(start) || Number.isNaN(end)) return '';
  const seconds = Math.max(0, Math.round((end - start) / 1000));
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  // 하루를 넘는 것은 거의 언제나 중단된 행이다 — "72시간 0분째" 보다 "3일째" 가 그 뜻을 바로 말한다.
  const text =
    seconds < 60
      ? `${seconds}초`
      : minutes < 60
        ? `${minutes}분`
        : hours < 24
          ? `${hours}시간 ${minutes % 60}분`
          : `${Math.floor(hours / 24)}일 ${hours % 24}시간`;
  return run.ended_at ? text : `${text}째`;
}

/**
 * 펼친 줄의 stats 키-값 — 중첩(`verify.checked`·`meters.extract.input`)을 점으로 편다. 배열·문자열도 그대로 보여 준다
 * (손으로 고친 행을 숨기지 않는다 — 요약 열이 빈 이유가 여기서 보여야 한다). 순수.
 */
export function flattenStats(value: unknown, prefix = ''): [string, string][] {
  if (value === null || value === undefined) return prefix ? [[prefix, '—']] : [];
  if (typeof value !== 'object' || Array.isArray(value)) {
    return [[prefix, typeof value === 'number' ? value.toLocaleString('ko-KR') : JSON.stringify(value) ?? String(value)]];
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) return prefix ? [[prefix, '{}']] : [];
  return entries.flatMap(([key, inner]) => flattenStats(inner, prefix ? `${prefix}.${key}` : key));
}

/**
 * 알림 열 — `—` · `Slack` · `Slack 실패`(features ③). Slack 트리거(T5) 전에는 언제나 `—` 다.
 * `missing`(웹훅 없음)은 실패가 아니라 꺼 둔 것이라 `—` 로 둔다(펼친 줄에 이유가 있다).
 */
export function runAlertLabel(alert: TRunAlert | null): '—' | 'Slack' | 'Slack 실패' {
  if (!alert || alert.state === 'missing') return '—';
  if (alert.state === 'error') return 'Slack 실패';
  const status = alert.responseStatus;
  return typeof status === 'number' && (status < 200 || status >= 300) ? 'Slack 실패' : 'Slack';
}
