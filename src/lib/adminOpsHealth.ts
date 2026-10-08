/**
 * 운영 현황의 **건강 판정** — 다섯 칸(수집 → 분석 → 검수 → 반영 → 재빌드)의 초록·노랑·빨강·회색을 정하는 한 곳
 * (features/ops-dashboard.md ① · ADR-023 결정 3). 판정은 저장하지 않고 화면에서 계산한다 — rpc `ops_overview` 는 수만 센다.
 *
 * 전부 순수 함수다(시각은 인자로). `/admin` 의 경고 띠(todo/15 T4.2)도 `worstStage` 를 그대로 쓴다.
 *
 * ⚠️ 함정 둘(features 「조용히 깨지는 것들」):
 *  - **`running` 만 보면 죽은 프로세스가 영원히 "돌고 있음" 이다.** 심장(`heartbeat_at`)이 멎었으면 중단된 듯 — `runState`.
 *    교차점검 `verify` 의 `null` 과 같은 함정이다(CLAUDE.md).
 *  - **재빌드 429 는 실패가 아니라 한도다**(BUG-011). features 표의 "4xx·5xx → 실패" 를 글자대로 옮기면 `rebuildHeadline` 이
 *    일부러 가른 것을 다시 합쳐 운영자가 멀쩡한 훅을 회전한다. 429 는 주의, 그 밖의 4xx·5xx 만 실패다.
 */

import { agoLabel, latestRebuildCall, QUEUE_STALL_MS, RESPONSE_WAIT_LIMIT_MS } from './adminRebuild';
import { REMOTE_WORKER_HOST } from './adminWorkerWake';
import type { TOpsOverview, TOpsWorker, TPipelineRun, TRunScript, TWorkerPhase } from './adminOps';

/*
 * 임계값(todo/15 🙋 — 권장안 그대로). "며칠이면 늦은 건가" 는 운영자의 수집 리듬이라 바뀔 수 있다 — 바꾸면 여기 한 곳.
 * 나중에 pg_cron 다이제스트(T7)가 생기면 같은 값이 SQL 에도 필요해진다 — 그때는 `ops_overview` 로 받는다(T7.1).
 */
/** 마지막 성공한 수집이 이보다 오래되면 주의. 주 1회 수집 기준 */
export const COLLECT_STALE_DAYS = 7;
/** 가장 오래된 미분석 글이 이보다 오래되면 주의 */
export const BACKLOG_STALE_DAYS = 2;
/** 가장 오래된 검수 대기가 이보다 오래되면 주의 */
export const PENDING_STALE_DAYS = 7;
/**
 * `running` 인데 심장이 이보다 오래 멎었으면 중단된 듯. `runLog.tick()` 이 60초에 한 번 찍으므로 열 번을 놓친 것이다.
 * 글 하나 분석이 이보다 길게 걸리는 일은 없다(Claude 호출 하나가 수십 초).
 */
export const HEARTBEAT_STALE_MS = 10 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;

export type THealth = 'ok' | 'warn' | 'fail' | 'none';
export type TStageKey = 'collect' | 'analyze' | 'review' | 'apply' | 'rebuild';

export type TStageHealth = {
  key: TStageKey;
  label: string;
  state: THealth;
  /** 첫째 수 — 마지막에 무엇이 있었나 */
  first: string;
  /** 둘째 수 — 무엇이 쌓였나. 없으면 빈 문자열 */
  second: string;
  /** 주의·실패일 때만 — 왜 노랗고 빨간가. 그대로 경고 띠의 문장이 된다 */
  reason: string | null;
  /** 운영자가 터미널에서 할 일 한 줄(반영 칸의 `pnpm data apply` 등). 화면은 기록을 고치지 않고 명령만 적어 준다 */
  hint?: string;
};

/** 화면이 보는 실행 상태 — 저장된 `status` 에 `stalled`(중단된 듯)를 더한 것. */
export type TRunState = 'ok' | 'partial' | 'failed' | 'running' | 'stalled';

/** 심장 — 찍힌 적이 없으면(옛 행·손으로 넣은 행) 시작 시각을 본다. null 을 "멎지 않았다" 로 읽으면 함정 그대로다. */
const heartbeatOf = (run: Pick<TPipelineRun, 'heartbeat_at' | 'started_at'>): string => run.heartbeat_at ?? run.started_at;

export function runState(run: Pick<TPipelineRun, 'status' | 'heartbeat_at' | 'started_at'>, nowMs: number): TRunState {
  if (run.status !== 'running') return run.status;
  const beat = Date.parse(heartbeatOf(run));
  return Number.isNaN(beat) || nowMs - beat > HEARTBEAT_STALE_MS ? 'stalled' : 'running';
}

/** "실패만" 걸러 보기의 중단된 듯 기준 시각(`fetchRuns` 의 `failedOnly.stalledBefore`). `runState` 와 같은 임계값이다. */
export const stalledBefore = (nowMs: number): string => new Date(nowMs - HEARTBEAT_STALE_MS).toISOString();

/** 정수 일수(내림). 시각을 못 읽으면 null. */
const daysSince = (iso: string | null | undefined, nowMs: number): number | null => {
  if (!iso) return null;
  const at = Date.parse(iso);
  return Number.isNaN(at) ? null : Math.floor((nowMs - at) / DAY_MS);
};

/** stats 의 수 칸 — 손으로 고친 행(`"3"`)은 수가 아니다(마이그레이션이 `jsonb_typeof = 'number'` 로 거르는 것과 같은 태도). */
const numberIn = (stats: TPipelineRun['stats'], key: string): number | null => {
  const value = stats?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
};

/** 끝난 실행의 시각 — 끝난 때가 "마지막" 이다. 안 적혔으면(죽었다) 시작 시각. */
const finishedAt = (run: TPipelineRun): string => run.ended_at ?? run.started_at;

const RUNNING_FIRST = (run: TPipelineRun, nowMs: number): string => `돌고 있음(심장 ${agoLabel(heartbeatOf(run), nowMs)})`;

/**
 * 스크립트 칸(수집·분석·반영) 공통 — 마지막 실행이 지금 돌고 있거나 중단됐거나 실패했으면 그것이 먼저다.
 * 그 밖이면 undefined 를 돌려주고 칸마다의 규칙으로 넘어간다.
 */
function runningOrFailed(
  base: Pick<TStageHealth, 'key' | 'label' | 'second'>,
  latest: TPipelineRun,
  nowMs: number,
): TStageHealth | undefined {
  const state = runState(latest, nowMs);
  if (state === 'stalled') {
    return {
      ...base,
      state: 'fail',
      first: `중단된 듯(심장 ${agoLabel(heartbeatOf(latest), nowMs)})`,
      reason: `${base.label}이 중단된 듯해요 — 프로세스가 죽었으면 그냥 다시 돌리면 돼요`,
    };
  }
  if (state === 'running') return { ...base, state: 'ok', first: RUNNING_FIRST(latest, nowMs), reason: null };
  if (state === 'failed') {
    return {
      ...base,
      state: 'fail',
      first: `실패 · ${agoLabel(finishedAt(latest), nowMs)}`,
      reason: `마지막 ${base.label}이 실패했어요${latest.error ? `(${latest.error})` : ''}`,
    };
  }
  return undefined;
}

function collectStage(overview: TOpsOverview, nowMs: number): TStageHealth {
  const latest = overview.runsLatest.collect;
  const lastOk = overview.runsLastOk.collect;
  const fresh = numberIn(lastOk?.stats ?? null, 'new');
  const base = { key: 'collect' as const, label: '수집', second: fresh === null ? '' : `신규 ${fresh}` };
  if (!latest) return { ...base, state: 'none', first: '기록 없음', reason: null };
  const early = runningOrFailed(base, latest, nowMs);
  if (early) return early;
  // 마지막 **성공**을 본다(`runsLastOk`) — 마지막 실행이 아니라. 지금은 실패가 위에서 먼저 걸리지만, 갈래가 늘면 이 차이가 드러난다.
  const days = daysSince(lastOk ? finishedAt(lastOk) : null, nowMs);
  const first = lastOk ? agoLabel(finishedAt(lastOk), nowMs) : '성공 없음';
  if (days === null || days >= COLLECT_STALE_DAYS) {
    return {
      ...base,
      state: 'warn',
      first,
      reason: days === null ? '수집이 한 번도 끝까지 돈 적이 없어요' : `수집이 ${days}일째 없어요`,
      hint: 'pnpm data collect',
    };
  }
  return { ...base, state: 'ok', first, reason: null };
}

function analyzeStage(overview: TOpsOverview, nowMs: number): TStageHealth {
  const latest = overview.runsLatest.analyze;
  const lastOk = overview.runsLastOk.analyze;
  const { count, oldestFetchedAt } = overview.backlog;
  const base = { key: 'analyze' as const, label: '분석', second: `${count}건 미분석` };
  if (!latest) return { ...base, state: 'none', first: '기록 없음', reason: null };
  const early = runningOrFailed(base, latest, nowMs);
  if (early) return early;
  const first = lastOk ? agoLabel(finishedAt(lastOk), nowMs) : '성공 없음';
  const days = count > 0 ? daysSince(oldestFetchedAt, nowMs) : null;
  if (days !== null && days >= BACKLOG_STALE_DAYS) {
    return { ...base, state: 'warn', first, reason: `분석 backlog ${count}건(${days}일째)`, hint: 'pnpm data analyze' };
  }
  return { ...base, state: 'ok', first, reason: null };
}

/** 검수는 사람 몫이라 실패가 없다. 비었으면 정상("비었어요"), 오래 묵었을 때만 주의. */
function reviewStage(overview: TOpsOverview, nowMs: number): TStageHealth {
  const { count, oldestCreatedAt } = overview.pending;
  const base = { key: 'review' as const, label: '검수', first: `대기 ${count}` };
  if (count === 0) return { ...base, state: 'ok', second: '비었어요', reason: null };
  const days = daysSince(oldestCreatedAt, nowMs);
  const second = days === null ? '' : `오래된 ${days}일`;
  if (days !== null && days >= PENDING_STALE_DAYS) {
    return { ...base, state: 'warn', second, reason: `검수 ${days}일째 대기` };
  }
  return { ...base, state: 'ok', second, reason: null };
}

/**
 * 반영 — `/admin` 에서 승인하면 반영이 곧바로 일어나므로(ADR-018) `apply` 기록이 없는 것이 정상이다. 그래서 회색(기록 없음)이 없다.
 * 실패는 마지막 `apply` 가 `failed` 이거나 실패 건수가 있을 때 — status 만 보면 stats 가 null 인 크래시(`failed`)는 잡혀도
 * `partial` + 실패 건수는 놓치고, 실패 건수만 보면 크래시를 놓친다. 둘 다 본다.
 */
function applyStage(overview: TOpsOverview, nowMs: number): TStageHealth {
  const latest = overview.runsLatest.apply;
  const lastOk = overview.runsLastOk.apply;
  const stranded = overview.stranded;
  const base = { key: 'apply' as const, label: '반영', second: `끊긴 ${stranded}` };
  if (latest) {
    const early = runningOrFailed(base, latest, nowMs);
    if (early) return { ...early, hint: early.state === 'fail' ? 'pnpm data apply' : undefined };
    const failed = numberIn(latest.stats, 'failed');
    if (failed !== null && failed > 0) {
      return {
        ...base,
        state: 'fail',
        first: agoLabel(finishedAt(latest), nowMs),
        reason: `마지막 반영에서 ${failed}건이 실패했어요`,
        hint: 'pnpm data apply',
      };
    }
  }
  const first = lastOk ? agoLabel(finishedAt(lastOk), nowMs) : '터미널 반영 없음';
  if (stranded > 0) {
    return { ...base, state: 'warn', first, reason: `반영 안 된 승인 ${stranded}건`, hint: 'pnpm data apply' };
  }
  return { ...base, state: 'ok', first, reason: null };
}

/**
 * 재빌드 — `rebuildHeadline` 의 문장을 파싱하지 않고 같은 행을 직접 본다(features ①). 건너뛰기 규칙(`latestRebuildCall`)과
 * 응답 대기 한도(`RESPONSE_WAIT_LIMIT_MS`)는 그쪽 것을 그대로 쓴다 — 머리글 한 줄과 이 칸이 서로 다른 말을 하지 않게.
 */
function rebuildStage(overview: TOpsOverview, nowMs: number): TStageHealth {
  const base = { key: 'rebuild' as const, label: '재빌드', second: `${overview.days}일 ${overview.funnel.rebuilds}회` };
  const entries = overview.rebuildRecent;
  if (entries.length === 0) return { ...base, state: 'none', first: '기록 없음', reason: null };
  const latest = latestRebuildCall(entries);
  // 최근 변경이 전부 게시 집합 밖이라 부르지 않았다 — 고장이 아니라 할 일이 없었던 것이다.
  if (!latest) return { ...base, state: 'ok', first: `안 부름 · ${agoLabel(entries[0].requested_at, nowMs)}`, reason: null };

  const ago = agoLabel(latest.requested_at, nowMs);
  // 줄을 섰다 — 아래 "응답 null" 갈래로 흘리면 3분에 "응답 없음" 이 떠 머리글(5분에 cron 경고)과 다른 말을 한다.
  if (latest.hook === 'queued') {
    return nowMs - Date.parse(latest.requested_at) > QUEUE_STALL_MS
      ? { ...base, state: 'warn', first: `${ago} · 대기`, reason: '재빌드 예약이 안 돌고 있어요 — cron.job 의 flush-vercel-rebuild 와 cron.job_run_details 의 실패를 확인해 주세요' }
      : { ...base, state: 'ok', first: `${ago} · 대기`, reason: null };
  }
  if (latest.hook === 'missing') {
    return { ...base, state: 'warn', first: ago, reason: '재빌드를 부를 주소가 없어요(Vault 의 vercel_deploy_hook)' };
  }
  if (latest.hook === 'error') return { ...base, state: 'warn', first: ago, reason: '재빌드를 부르다 실패했어요' };

  const status = latest.response_status;
  if (status === null) {
    const stale = nowMs - Date.parse(latest.requested_at) > RESPONSE_WAIT_LIMIT_MS;
    return stale
      ? { ...base, state: 'warn', first: `${ago} · 응답 없음`, reason: '재빌드 응답을 못 받았어요 — Vercel 배포 목록을 확인해 주세요' }
      : { ...base, state: 'ok', first: `${ago} · 응답 기다림`, reason: null };
  }
  const first = `${ago} · ${status}`;
  if (status >= 200 && status < 300) return { ...base, state: 'ok', first, reason: null };
  if (status === 429) return { ...base, state: 'warn', first, reason: '재빌드가 한도(시간당 60번)에 걸렸어요 — 훅은 그대로예요' };
  // 5xx 는 Vercel 쪽 오류다 — "폐기" 라고 말하면 운영자가 멀쩡한 훅을 회전한다(429 와 같은 종류의 오독, BUG-011). 상태는 실패 그대로.
  if (status >= 500) return { ...base, state: 'fail', first, reason: `Vercel 쪽 오류예요(${status}) — 잠시 뒤 다시 확인해 주세요` };
  if (status >= 400) return { ...base, state: 'fail', first, reason: `Deploy Hook 이 폐기된 듯해요(${status})` };
  return { ...base, state: 'warn', first, reason: `재빌드 응답이 예상과 달라요(${status})` };
}

/**
 * 다섯 칸 — 장치가 도는 순서. **7일 집계로 부른다**: 재빌드 칸의 둘째 수가 `funnel.rebuilds`(기간 집계)라
 * 흐름의 30일 토글을 그대로 받으면 그 칸이 말없이 30일 수가 된다(그래서 둘째 수에 `days` 를 같이 적는다).
 */
export function stageHealth(overview: TOpsOverview, nowMs: number): TStageHealth[] {
  return [
    collectStage(overview, nowMs),
    analyzeStage(overview, nowMs),
    reviewStage(overview, nowMs),
    applyStage(overview, nowMs),
    rebuildStage(overview, nowMs),
  ];
}

/**
 * 주의 띠에 올릴 **가장 심한 하나**(features: "띠는 가장 심한 하나만"). 실패가 주의보다 먼저, 같은 무게면 장치 순서상 앞의 것 —
 * 앞 단계가 막히면 뒤 단계의 노랑은 그 결과일 때가 많다. 회색(기록 없음)은 띠에 오르지 않는다 — 첫날은 경고가 아니다.
 */
export function worstStage(stages: readonly TStageHealth[]): TStageHealth | null {
  return stages.find((stage) => stage.state === 'fail') ?? stages.find((stage) => stage.state === 'warn') ?? null;
}

/** 칸을 눌렀을 때 실행 기록을 걸러 볼 스크립트. 재빌드는 `pipeline_runs` 가 아니라 `rebuild_log` 라 걸러 볼 것이 없다. */
export const STAGE_SCRIPTS: Record<TStageKey, readonly TRunScript[] | null> = {
  collect: ['collect'],
  analyze: ['analyze'],
  review: ['approve', 'reject'],
  apply: ['apply'],
  rebuild: null,
};

/**
 * 워커 심장(`workers.last_seen_at`)이 이보다 오래 멎었으면 멎은 듯. 심장은 15초에 한 번(`workerHeartbeat.mjs`)이라 스무 번을 놓친 것이다.
 * `kill -9` 처럼 닫지 못하고 죽은 워커는 행이 그대로 남으니, 행이 있다는 것만으로 "켜져 있다" 고 말하면 안 된다.
 */
export const WORKER_STALE_MS = 5 * 60 * 1000;

export type TWorkerState = 'none' | 'alive' | 'stale' | 'login-needed' | 'rate-limited';

export type TWorkerHealth = {
  state: TWorkerState;
  /** 배지 색 — 다섯 칸과 같은 축 */
  tone: THealth;
  /** 배지 글자(짧게) */
  label: string;
  /** 가장 최근에 뛴 행 하나. `none` 이면 없다 */
  host?: string;
  phase?: TWorkerPhase;
  /** 그 행의 `run_id` — 진행 막대가 찾을 실행 행 */
  runId?: string | null;
  /** 마지막 심장 뒤로 지난 초 */
  ageSec?: number;
  /** 그 밖의 행 수(다른 기기). 기기당 한 행이라 보통 0 */
  others: number;
  /** 운영자가 할 일 한 줄 — 살아 있으면 null */
  hint: string | null;
};

/** `phase` 의 화면 낱말 */
export const WORKER_PHASE_LABEL: Record<TWorkerPhase, string> = {
  idle: '쉬는 중',
  collect: '수집 중',
  analyze: '분석 중',
  apply: '반영 중',
  'login-needed': '로그인 기다림',
  'rate-limited': '한도 휴식',
};

/**
 * 로컬 워커 판정(todo/17 T5.1) — 여러 행이면 가장 최근에 뛴 하나만 보고 나머지는 수로 센다.
 *
 * ⚠️ **로그인 기다림·한도 휴식은 멎은 듯보다 먼저다.** 로그인을 기다리는 워커는 세션이 끝난 뒤라 심장 쓰기도 실패해
 * `last_seen_at` 이 그 자리에 멈춘다 — 5분 규칙을 먼저 보면 이 배지가 보여 주려던 바로 그 상태가 "멎은 듯" 으로 바뀐다.
 * 한도 휴식은 리셋까지 몇 시간을 자기도 해 그 사이 세션이 끝날 수 있다. 대신 심장이 멎었으면 문구에 그 나이를 붙인다
 * (그 상태로 죽은 워커일 수도 있다). 판정은 `phase` 만 믿고, 시각을 못 읽으면 멎은 것으로 친다.
 */
export function workerHealth(allWorkers: readonly TOpsWorker[], nowMs: number): TWorkerHealth {
  // 서버 워커(vercel) 행은 세지 않는다 — 홉 사이엔 늘 멎은 모양이라 섞으면 로컬이 꺼진 적 없는데도 "워커 멎음" 이 뜬다(ADR-028 결정 7). 서버는 `remoteWorkerView` 가 따로 말한다.
  const workers = allWorkers.filter((worker) => worker.host !== REMOTE_WORKER_HOST);
  const seenAt = (worker: TOpsWorker) => {
    const at = Date.parse(worker.last_seen_at);
    return Number.isNaN(at) ? -Infinity : at;
  };
  const [latest, ...rest] = [...workers].sort((a, b) => seenAt(b) - seenAt(a));
  if (!latest) {
    return { state: 'none', tone: 'warn', label: '워커 없음', others: 0, hint: '터미널에서 pnpm data 를 켜 주세요' };
  }
  const at = seenAt(latest);
  const ageMs = at === -Infinity ? Infinity : Math.max(0, nowMs - at);
  const base = {
    host: latest.host,
    phase: latest.phase,
    runId: latest.run_id,
    ageSec: Number.isFinite(ageMs) ? Math.round(ageMs / 1000) : undefined,
    others: rest.length,
  };
  const stale = ageMs > WORKER_STALE_MS;
  const silent = stale ? ` (심장 ${at === -Infinity ? '모름' : agoLabel(latest.last_seen_at, nowMs)} — 워커가 꺼졌을 수도 있어요)` : '';
  if (latest.phase === 'login-needed') {
    return { ...base, state: 'login-needed', tone: 'warn', label: '로그인 필요', hint: `워커가 로그인을 기다려요 — 터미널에서 비밀번호를 넣어 주세요${silent}` };
  }
  if (latest.phase === 'rate-limited') {
    return { ...base, state: 'rate-limited', tone: 'warn', label: '한도 휴식', hint: `Claude 한도라 분석을 쉬어요 — 리셋 뒤 저절로 이어 가요${silent}` };
  }
  if (stale) return { ...base, state: 'stale', tone: 'fail', label: '워커 멎음', hint: '워커가 멎은 듯 — 터미널을 확인해 주세요' };
  return { ...base, state: 'alive', tone: 'ok', label: '워커 켜짐', hint: null };
}

/** 서버 행이 이 안에 뛰었으면 지금 도는 것이다. 홉 사이(재호출 사이)는 수 초라 넉넉히 잡는다. */
export const REMOTE_WORKER_FRESH_MS = 60 * 1000;

/**
 * 서버 워커 한 줄(ADR-028 결정 7) — 60초 안에 뛰었고 `idle` 이 아닐 때만. 아니면 null(배지를 그리지 않는다).
 * 로컬 배지(`workerHealth`)와 따로 둔다: 서버는 요청이 있을 때만 잠깐 도는 일꾼이라 "없음·멎음" 이 고장이 아니다.
 */
export function remoteWorkerView(
  workers: readonly TOpsWorker[],
  nowMs: number,
): { label: string; phase: TWorkerPhase; runId: string | null } | null {
  const row = workers.find((worker) => worker.host === REMOTE_WORKER_HOST);
  if (!row || row.phase === 'idle') return null;
  const at = Date.parse(row.last_seen_at);
  if (Number.isNaN(at) || nowMs - at > REMOTE_WORKER_FRESH_MS) return null;
  return { label: `서버 · ${WORKER_PHASE_LABEL[row.phase]}`, phase: row.phase, runId: row.run_id };
}

/**
 * `/admin` 의 경고 띠에 더할 한 줄(todo/15 T4.2) — `worstStage` 와 같되 **`/admin` 이 이미 말하는 칸은 뺀다.**
 * 재빌드 경고는 같은 띠의 첫 줄(`rebuildHeadline`)이 먼저 말하고, 끊긴 반영(반영 칸의 주의)은 머리글의 "반영이 끊긴 후보 N건" 줄이 말한다 —
 * 같은 사실을 두 줄로 말하면 띠가 두 배로 시끄러워지고 둘 중 무엇을 고쳐야 하는지 흐려진다. 뺀 뒤 남은 것 중 가장 심한 하나.
 */
export function adminBandStage(
  stages: readonly TStageHealth[],
  shown: { rebuildWarn: boolean; strandedShown: boolean },
): TStageHealth | null {
  return worstStage(
    stages.filter(
      (stage) =>
        !(stage.key === 'rebuild' && shown.rebuildWarn) && !(stage.key === 'apply' && stage.state === 'warn' && shown.strandedShown),
    ),
  );
}
