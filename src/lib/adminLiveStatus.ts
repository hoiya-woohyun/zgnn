/**
 * `/admin` 머리글의 **실시간 한 줄** — "무슨 일이 어디까지 왔고, 멈췄다면 어디서 왜" 를 한 문장과 진행 막대로.
 *
 * 전에는 로컬 배지 · 서버 배지 · 요청 수 · 경고 띠(워커 없음) · 깨우기 실패 줄이 **열 때 한 번** 읽혀 따로 섰다. 서버 워커가 돌아도 화면은
 * 새로 고치기 전까지 "워커 없음" 이었고, 무엇이 언제 끝났는지는 운영 현황(`/admin/ops`)에 가야 보였다. 이 함수가 그 신호들을 한 줄로 고르고,
 * 화면(`adminLiveStatusLine.tsx`)은 Realtime(`subscribeOps`)으로 받은 행을 넣어 다시 부른다. 시각만으로 바뀌는 판정(멎은 듯·60초·요청 나이)이 있어
 * 부르는 쪽이 15초마다 `nowMs` 를 바꿔 다시 부른다 — 이벤트만 기다리면 끝난 서버 워커가 영영 "도는 중" 이다.
 *
 * **말의 축은 일이다, 일꾼이 아니다**(2026-10-28). 같은 수집·분석이 PC 에서도 서버에서도 돌기 때문에 "PC 워커 · 서버 워커 · 홉" 으로 말하면
 * 운영자는 마지막 수집이 실패했는지조차 읽지 못했다. 그래서 머리말은 늘 일(수집·분석·반영)이고, 어디서 도는지는 흐린 꼬리말 한 마디다.
 * 끝난 일의 문장은 `runOutcome` 이 정한다(사람이 멈춤 · 한도 · 끊김 · 기록만 안 닫힘 · 실패를 가른다).
 *
 * 고르는 순서: 도는 중(서버 → PC) > 사람 손이 필요한 PC(로그인·한도) > **오래 안 받힌 요청** > 막 들어온 요청 > (PC 빌드) 워커 꺼짐 > 마지막 일.
 * 요청 나이를 보지 않으면 20일 묵은 요청에도 "곧 받아요" 라고 말한다 — 같은 화면 운영 현황 칸은 2시간 넘으면 주의라 둘이 반대로 말했다.
 */

import type { TOpsOverview, TOpsWorker, TPipelineRun, TRunScript } from './adminOps';
import { type THealth, REQUEST_STALE_HOURS, remoteWorkerView, WORKER_PHASE_LABEL, workerHealth } from './adminOpsHealth';
import { agoLabel } from './adminRebuild';
import { runOutcome, SCRIPT_WORD } from './runOutcome';

export type TLiveStatus = {
  tone: THealth;
  /** 점 옆 굵은 말 — "분석 중" · "수집 · 12/52에서 사람이 멈춤" */
  headline: string;
  /** 그 뒤 흐린 말 — 어디서 · 언제 · 할 일. 없으면 null */
  detail: string | null;
  /** 도는 실행의 진행(`progress.done/total`). 모르면 null */
  progress: { done: number; total: number } | null;
  /** 지금 읽는 글·검색어 한 줄(`progress.current`) */
  current: string | null;
};

export type TLiveInput = {
  workers: readonly TOpsWorker[];
  /** 스크립트별 마지막 실행(`ops_overview.runsLatest` 를 Realtime 으로 고친 것) */
  runsLatest: Partial<Record<TRunScript, TPipelineRun>>;
  requestsQueued: number | undefined;
  /**
   * 가장 오래된 안 읽힌 분석 요청 시각(`ops_overview.oldestRequestAt`). 이게 `REQUEST_STALE_HOURS` 를 넘으면 "곧 받아요" 대신 "N일째 그대로" 라고 말한다.
   * `undefined` 는 그 칸이 없는 옛 원격이라 모른다 — 그때는 나이를 보지 않는다(예전 동작).
   */
  oldestRequestAt?: string | null;
  /** 이 빌드가 서버 워커를 깨우나(`HAS_SERVER_WORKER`) */
  remote: boolean;
  /**
   * 밑의 이어 돌리기 줄(`resumeNotice`)이 서버의 남은 일을 말하고 있나. 그러면 요청 대기 줄에 "서버에서 곧 받아요" 를 붙이지 않는다 —
   * 사슬이 4홉 상한에서 쉬었거나 아무도 안 깨웠으면 그 말은 거짓이다(todo/20 T10).
   */
  resumeShown?: boolean;
  nowMs: number;
};

const HOUR_MS = 60 * 60 * 1000;

/** 워커가 붙든 실행 행 — `run_id` 로 찾는다. 없거나 끝났으면 null. */
function runOf(runsLatest: TLiveInput['runsLatest'], runId: string | null | undefined): TPipelineRun | null {
  if (!runId) return null;
  return Object.values(runsLatest).find((run) => run?.id === runId && run.status === 'running') ?? null;
}

function progressOf(run: TPipelineRun | null): Pick<TLiveStatus, 'progress' | 'current'> {
  const progress = run?.progress;
  const total = typeof progress?.total === 'number' && progress.total > 0 ? progress.total : null;
  const done = typeof progress?.done === 'number' ? Math.min(progress.done, total ?? progress.done) : 0;
  return { progress: total === null ? null : { done, total }, current: progress?.current || null };
}

/**
 * 가장 최근에 끝난(멎은) 수집·분석·반영 한 줄 — "분석 · 5/5 다 하고 끝 기록만 못 남김" + "18일 전".
 * 승인·반려는 이 화면이 한 일이라 빼고 센다. 끝 기록이 없는 실행은 마지막 심장을 끝으로 친다(`runOutcome.at`).
 */
export function lastRunText(runsLatest: TLiveInput['runsLatest'], nowMs: number): { text: string; ago: string; tone: THealth } | null {
  const ended = (['collect', 'analyze', 'apply'] as const)
    .map((script) => runsLatest[script])
    .filter((run): run is TPipelineRun => Boolean(run))
    .map((run) => ({ run, outcome: runOutcome(run, nowMs) }))
    .filter(({ outcome }) => outcome.kind !== 'running')
    .sort((a, b) => Date.parse(b.outcome.at) - Date.parse(a.outcome.at));
  const [last] = ended;
  if (!last) return null;
  return { text: `${SCRIPT_WORD[last.run.script]} ${last.outcome.text}`, ago: agoLabel(last.outcome.at, nowMs), tone: last.outcome.tone };
}

/** 안 받힌 요청이 오래됐으면 그 나이("20일 전"), 아니면 null. 시각을 모르면(옛 원격·없음) null. */
function staleRequestAgo(oldestRequestAt: string | null | undefined, nowMs: number): string | null {
  if (!oldestRequestAt) return null;
  const at = Date.parse(oldestRequestAt);
  if (Number.isNaN(at) || nowMs - at < REQUEST_STALE_HOURS * HOUR_MS) return null;
  return agoLabel(oldestRequestAt, nowMs);
}

/** 순수 — 위 순서대로 한 줄. */
export function liveStatus({ workers, runsLatest, requestsQueued, oldestRequestAt, remote, resumeShown = false, nowMs }: TLiveInput): TLiveStatus {
  const queued = requestsQueued ? `요청 ${requestsQueued}건 대기` : null;
  const join = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(' · ') || null;
  const none = { progress: null, current: null };

  const server = remoteWorkerView(workers, nowMs);
  if (server) {
    return { tone: 'ok', headline: WORKER_PHASE_LABEL[server.phase], detail: join('서버에서', queued), ...progressOf(runOf(runsLatest, server.runId)) };
  }

  const local = workerHealth(workers, nowMs);
  if (local.state === 'alive' && local.phase && local.phase !== 'idle') {
    return { tone: 'ok', headline: WORKER_PHASE_LABEL[local.phase], detail: join('PC에서', queued), ...progressOf(runOf(runsLatest, local.runId)) };
  }
  if (local.state === 'login-needed' || local.state === 'rate-limited') {
    return { tone: 'warn', headline: `PC에서 ${local.label}`, detail: join(local.hint, queued), ...none };
  }

  const last = lastRunText(runsLatest, nowMs);
  const staleAgo = staleRequestAgo(oldestRequestAt, nowMs);
  if (staleAgo) {
    // 요청이 오래 그대로다 — 아무도 안 가져간 것이다. 서버 빌드면 이어 돌리기 줄이 버튼을 갖고 있을 때가 많다(그땐 그 줄이 말한다).
    const ask = remote ? (resumeShown ? null : '분석을 다시 요청하면 서버가 받아요') : '터미널에서 pnpm data 를 켜 주세요';
    return { tone: 'warn', headline: `분석 요청이 ${staleAgo}부터 그대로예요`, detail: join('아무도 안 가져갔어요', ask), ...none };
  }
  if (queued) {
    // 막 들어온 요청 — 서버가 받는 빌드면 깨우는 사이(수 초)이거나 못 깨운 것(깨우기 실패 줄이 따로 말한다), 또는 사슬이 쉰 것(이어 돌리기 줄이 말한다).
    const who = remote ? (resumeShown ? null : '서버에서 곧 받아요') : local.state === 'alive' ? 'PC에서 곧 받아요' : '터미널에서 pnpm data 를 켜 주세요';
    return { tone: remote || local.state === 'alive' ? 'none' : 'warn', headline: queued, detail: who, ...none };
  }
  if (!remote && (local.state === 'none' || local.state === 'stale')) {
    return {
      tone: local.tone,
      headline: local.state === 'none' ? 'PC 워커 꺼짐' : 'PC 워커 멎음',
      detail: join(local.hint, last ? `마지막: ${last.text}(${last.ago})` : null),
      ...none,
    };
  }
  if (!last) return { tone: 'none', headline: '쉬는 중', detail: null, ...none };
  // 도는 일이 없다 — 마지막 일이 어떻게 끝났는지가 머리말이다. 실패·끊김은 노랗게(머리글은 빨강을 쓰지 않는다 — 사유는 운영 현황 칸이 말한다).
  return { tone: last.tone === 'fail' ? 'warn' : last.tone, headline: last.text, detail: `${last.ago} · 지금 도는 일 없음`, ...none };
}

/**
 * 운영 현황(`/admin/ops`)이 그리는 지금 상태 — `/admin` 머리글과 같은 `liveStatus` 에 **같은 `remote`** 를 넘긴다.
 * 이 인자를 빼먹으면 서버 빌드의 운영 현황만 PC 워커 꺼짐을 노랗게 말해 두 화면이 반대로 말한다. 요청 나이(`oldestRequestAt`)도 같이 넘긴다.
 * `workers` 키가 없으면(마이그레이션 전 응답) null — 모르는 것을 "워커 없음" 으로 말하지 않는다.
 */
export function opsLiveStatus(
  overview: Pick<TOpsOverview, 'workers' | 'runsLatest' | 'requestsQueued' | 'oldestRequestAt'>,
  { remote, nowMs }: Pick<TLiveInput, 'remote' | 'nowMs'>,
): TLiveStatus | null {
  if (!overview.workers) return null;
  return liveStatus({
    workers: overview.workers,
    runsLatest: overview.runsLatest,
    requestsQueued: overview.requestsQueued,
    oldestRequestAt: overview.oldestRequestAt,
    remote,
    nowMs,
  });
}
