/**
 * `/admin` 머리글의 **실시간 한 줄** — "지금 무엇이 돌고 있나" 를 한 문장과 진행 막대로.
 *
 * 전에는 로컬 배지 · 서버 배지 · 요청 수 · 경고 띠(워커 없음) · 깨우기 실패 줄이 **열 때 한 번** 읽혀 따로 섰다. 서버 워커가 돌아도 화면은
 * 새로 고치기 전까지 "워커 없음" 이었고, 무엇이 언제 끝났는지는 운영 현황(`/admin/ops`)에 가야 보였다. 이 함수가 그 신호들을 한 줄로 고르고,
 * 화면(`adminPageLiveStatus.tsx`)은 Realtime(`subscribeOps`)으로 받은 행을 넣어 다시 부른다. 시각만으로 바뀌는 판정(멎은 듯·60초)이 있어
 * 부르는 쪽이 15초마다 `nowMs` 를 바꿔 다시 부른다 — 이벤트만 기다리면 끝난 서버 워커가 영영 "도는 중" 이다.
 *
 * 고르는 순서: 도는 중(서버 → 로컬) > 사람 손이 필요한 로컬(로그인·한도) > 대기 중인 요청 > 쉬는 중.
 * 서버 워커는 요청이 있을 때만 잠깐 도는 일꾼이라 "없음" 이 고장이 아니다 — 서버가 받는 빌드에서는 PC 워커가 꺼져 있어도 주의를 띄우지 않는다.
 */

import type { TOpsWorker, TPipelineRun, TRunScript } from './adminOps';
import { type THealth, remoteWorkerView, runState, WORKER_PHASE_LABEL, workerHealth } from './adminOpsHealth';
import { agoLabel } from './adminRebuild';

export type TLiveStatus = {
  tone: THealth;
  /** 점 옆 굵은 말 — "서버 워커 · 분석 중" */
  headline: string;
  /** 그 뒤 흐린 말 — 요청 대기·마지막 실행·할 일. 없으면 null */
  detail: string | null;
  /** 도는 실행의 진행(`progress.done/total`). 모르면 null */
  progress: { done: number; total: number } | null;
  /** 지금 읽는 글 한 줄(`progress.current`) */
  current: string | null;
};

export type TLiveInput = {
  workers: readonly TOpsWorker[];
  /** 스크립트별 마지막 실행(`ops_overview.runsLatest` 를 Realtime 으로 고친 것) */
  runsLatest: Partial<Record<TRunScript, TPipelineRun>>;
  requestsQueued: number | undefined;
  /** 이 빌드가 서버 워커를 깨우나(`HAS_SERVER_WORKER`) */
  remote: boolean;
  nowMs: number;
};

const SCRIPT_WORD: Record<TRunScript, string> = { collect: '수집', analyze: '분석', apply: '반영', approve: '승인', reject: '반려' };

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

/** 가장 최근에 끝난 수집·분석·반영 한 마디 — "분석 3분 전 끝". 실패면 그렇게 말한다. 승인·반려는 이 화면이 한 일이라 빼고 센다. */
export function lastRunText(runsLatest: TLiveInput['runsLatest'], nowMs: number): { text: string; failed: boolean } | null {
  const ended = (['collect', 'analyze', 'apply'] as const)
    .map((script) => runsLatest[script])
    .filter((run): run is TPipelineRun => Boolean(run) && runState(run as TPipelineRun, nowMs) !== 'running')
    .sort((a, b) => Date.parse(b.ended_at ?? b.started_at) - Date.parse(a.ended_at ?? a.started_at));
  const [last] = ended;
  if (!last) return null;
  const state = runState(last, nowMs);
  const when = agoLabel(last.ended_at ?? last.started_at, nowMs);
  const word = SCRIPT_WORD[last.script];
  if (state === 'failed') return { text: `${word} ${when} 실패${last.error ? ` — ${last.error}` : ''}`, failed: true };
  if (state === 'stalled') return { text: `${word} ${when} 멈춘 듯`, failed: true };
  return { text: `${word} ${when} 끝${state === 'partial' ? '(일부 실패)' : ''}`, failed: false };
}

/** 순수 — 위 순서대로 한 줄. */
export function liveStatus({ workers, runsLatest, requestsQueued, remote, nowMs }: TLiveInput): TLiveStatus {
  const queued = requestsQueued ? `요청 ${requestsQueued}건 대기` : null;
  const last = lastRunText(runsLatest, nowMs);
  const join = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(' · ') || null;

  const server = remoteWorkerView(workers, nowMs);
  if (server) {
    return { tone: 'ok', headline: `서버 워커 · ${WORKER_PHASE_LABEL[server.phase]}`, detail: queued, ...progressOf(runOf(runsLatest, server.runId)) };
  }

  const local = workerHealth(workers, nowMs);
  if (local.state === 'alive' && local.phase && local.phase !== 'idle') {
    return { tone: 'ok', headline: `PC 워커 · ${WORKER_PHASE_LABEL[local.phase]}`, detail: queued, ...progressOf(runOf(runsLatest, local.runId)) };
  }
  const none = { progress: null, current: null };
  if (local.state === 'login-needed' || local.state === 'rate-limited') {
    return { tone: 'warn', headline: `PC 워커 · ${local.label}`, detail: join(local.hint, queued), ...none };
  }
  if (queued) {
    // 요청이 있는데 아무도 안 돈다 — 서버가 받는 빌드면 깨우는 사이(수 초)이거나 못 깨운 것(깨우기 실패 줄이 따로 말한다).
    const who = remote ? '서버 워커가 곧 받아요' : local.state === 'alive' ? 'PC 워커가 곧 받아요' : '워커를 켜 주세요(터미널에서 pnpm data)';
    return { tone: remote || local.state === 'alive' ? 'none' : 'warn', headline: queued, detail: who, ...none };
  }
  if (!remote && (local.state === 'none' || local.state === 'stale')) {
    return { tone: local.tone, headline: local.state === 'none' ? 'PC 워커 꺼짐' : 'PC 워커 멎음', detail: join(local.hint, last?.text), ...none };
  }
  return { tone: last?.failed ? 'warn' : 'none', headline: '쉬는 중', detail: last?.text ?? null, ...none };
}
