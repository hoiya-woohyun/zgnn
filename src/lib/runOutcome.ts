/**
 * 실행 한 줄(`pipeline_runs`)이 **어떻게 끝났나** — 무슨 일을 · 어디까지 · 왜 멈췄나. `/admin` 머리글(`adminLiveStatus`) · 운영 현황 다섯 칸
 * (`adminOpsHealth`) · 실행 표(`adminOpsPageRunsTable`)가 이 하나만 읽는다.
 *
 * 저장된 `status` 는 넷(running·ok·partial·failed)뿐이라 그대로 그리면 사람이 Ctrl+C 로 멈춘 것도, Claude 한도도, 함수가 끝 기록 전에 죽은 것도
 * 전부 "실패" 다 — 화면만 보고는 마지막 수집이 정말 실패했는지 알 수 없었다(2026-10-07 의 `중단(SIGINT)` 이 20일 동안 "수집 실패" 로 섰다).
 * 가르는 근거는 `error` 의 분류 문구(`RUN_ERROR` — 던지는 자리가 붙인 고정 값이라 메시지 패턴 매칭이 아니다)와 `progress` 둘이다.
 *
 * 어디서 돌았나(PC·서버)는 여기서 묻지 않는다 — 같은 일이 어느 쪽에서든 돌고, 운영자가 알아야 하는 것은 일의 끝이다.
 */

import { RUN_ERROR } from '../../scripts/lib/runErrors.mjs';
import type { THealth } from './adminOpsHealth';
import type { TPipelineRun, TRunScript } from './adminOps';

/**
 * `running` 인데 심장이 이보다 오래 멎었으면 중단된 듯. `runLog.tick()` 이 60초에 한 번 찍으므로 열 번을 놓친 것이다.
 * 글 하나 분석이 이보다 길게 걸리는 일은 없다(Claude 호출 하나가 수십 초). 기록을 실제로 닫는 쪽(`runLog.closeLostRuns`)은 30분으로 더 넉넉하다.
 */
export const HEARTBEAT_STALE_MS = 10 * 60 * 1000;

/** 화면이 보는 실행 상태 — 저장된 `status` 에 `stalled`(중단된 듯)를 더한 것. */
export type TRunState = 'ok' | 'partial' | 'failed' | 'running' | 'stalled';

/** 심장 — 찍힌 적이 없으면(옛 행·손으로 넣은 행) 시작 시각을 본다. null 을 "멎지 않았다" 로 읽으면 함정 그대로다. */
export const heartbeatOf = (run: Pick<TPipelineRun, 'heartbeat_at' | 'started_at'>): string => run.heartbeat_at ?? run.started_at;

export function runState(run: Pick<TPipelineRun, 'status' | 'heartbeat_at' | 'started_at'>, nowMs: number): TRunState {
  if (run.status !== 'running') return run.status;
  const beat = Date.parse(heartbeatOf(run));
  return Number.isNaN(beat) || nowMs - beat > HEARTBEAT_STALE_MS ? 'stalled' : 'running';
}

/**
 * - `running` 도는 중
 * - `ok` 끝
 * - `partial` 끝났는데 일부는 다음 실행 몫(분석의 건너뛴 글은 `analyzed_at` 이 비어 다음 실행이 다시 읽는다)
 * - `stopped` 사람이 멈춤(Ctrl+C) 또는 종료 신호(SIGTERM — `kill`·OS 종료) — 실패가 아니다
 * - `limit` Claude 한도로 멈춤 — 리셋 뒤 다시 돌리면 남은 것부터
 * - `failed` 정말 실패(인증·DB 쓰기·429·모름)
 * - `lost` 끝 기록 없이 중간에 끊김(심장이 멎었다). 아직 `running` 으로 남은 행(10~30분)은 추측이라 "중단된 듯" 이라고만 한다(`settled` false)
 * - `unclosed` 진행은 끝까지 찼는데 끝 기록 없이 멈춤(서버 함수가 `end` 직전에 잘렸다). 진행 뒤에 마무리 쓰기가 남는 스크립트가 있어
 *   "다 했다" 고 단정하지 않는다 — 분석은 안 읽힌 글을 다음 실행이 다시 읽고, 수집은 저장을 한 칸으로 세어 저장 전이면 n/n 이 안 된다.
 */
export type TRunOutcomeKind = 'running' | 'ok' | 'partial' | 'stopped' | 'limit' | 'failed' | 'lost' | 'unclosed';

export type TRunOutcome = {
  kind: TRunOutcomeKind;
  tone: THealth;
  /** 짧은 말 — 실행 표의 상태 칸 */
  label: string;
  /** 어디까지 왔나 + 왜 끝났나 한 마디 — "12/40에서 사람이 멈춤" */
  text: string;
  /** 진행 위치 "12/40" — 진행을 안 적은 실행(옛 행·반영)은 null */
  where: string | null;
  /** 끝이 기록됐나 — false 면 아직 `running` 인 행을 심장으로 추측한 것이다(도는 중이거나 멎은 듯) */
  settled: boolean;
  /** 끝난(멎은) 시각 — 끝 기록이 없으면 마지막 심장 */
  at: string;
};

export const SCRIPT_WORD: Record<TRunScript, string> = { collect: '수집', analyze: '분석', apply: '반영', approve: '승인', reject: '반려' };

const LABEL: Record<TRunOutcomeKind, string> = {
  running: '도는 중',
  ok: '끝',
  partial: '끝(일부는 다음에)',
  stopped: '사람이 멈춤',
  limit: '한도로 멈춤',
  failed: '실패',
  lost: '중간에 끊김',
  unclosed: '끝 무렵 멈춤',
};

const TONE: Record<TRunOutcomeKind, THealth> = {
  running: 'ok',
  ok: 'none',
  partial: 'none',
  stopped: 'none',
  limit: 'warn',
  failed: 'fail',
  lost: 'fail',
  unclosed: 'none',
};

/** `progress` 의 done/total — total 이 없거나 0 이면 모른다(null). 손으로 고친 행일 수 있어 모양을 믿지 않는다. */
function stepOf(run: Pick<TPipelineRun, 'progress'>): { done: number; total: number } | null {
  const progress = run.progress;
  const total = typeof progress?.total === 'number' && progress.total > 0 ? progress.total : null;
  if (total === null) return null;
  const done = typeof progress?.done === 'number' ? Math.max(0, Math.min(progress.done, total)) : 0;
  return { done, total };
}

const countIn = (stats: TPipelineRun['stats'], key: string): number | null => {
  const value = stats?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
};

function kindOf(run: TPipelineRun, nowMs: number): TRunOutcomeKind {
  const state = runState(run, nowMs);
  if (state === 'running') return 'running';
  if (state === 'ok') return 'ok';
  if (state === 'partial') return 'partial';
  if (state === 'stalled' || run.error === RUN_ERROR.lost) {
    const step = stepOf(run);
    return step && step.done >= step.total ? 'unclosed' : 'lost';
  }
  if (run.error === RUN_ERROR.sigint || run.error === RUN_ERROR.sigterm) return 'stopped';
  if (run.error === RUN_ERROR.claudeLimit) return 'limit';
  return 'failed';
}

/** partial 의 한 마디 — 분석은 건너뛴 글(다음 실행이 다시 읽는다), 반영은 실패 건. 모양을 모르면 라벨 그대로. */
function partialText(run: TPipelineRun): string {
  const skipped = countIn(run.stats, 'skipped');
  if (run.script === 'analyze' && skipped) return `끝 · ${skipped}건은 다음 실행에 다시`;
  const failed = countIn(run.stats, 'failed');
  if (failed) return `끝 · ${failed}건 실패`;
  return LABEL.partial;
}

export function runOutcome(run: TPipelineRun, nowMs: number): TRunOutcome {
  const kind = kindOf(run, nowMs);
  const step = stepOf(run);
  const where = step ? `${step.done.toLocaleString('ko-KR')}/${step.total.toLocaleString('ko-KR')}` : null;
  const at = kind === 'lost' || kind === 'unclosed' || !run.ended_at ? heartbeatOf(run) : run.ended_at;
  const settled = run.status !== 'running';
  const byTerm = run.error === RUN_ERROR.sigterm;
  const text: Record<TRunOutcomeKind, () => string> = {
    running: () => (where ? `${where} 하는 중` : '도는 중'),
    ok: () => '끝',
    partial: () => partialText(run),
    stopped: () => `${where ? `${where}에서 ` : ''}${byTerm ? '종료 신호로 멈춤' : '사람이 멈춤'}`,
    limit: () => `${where ? `${where}에서 ` : ''}Claude 한도로 멈춤 — 리셋 뒤 다시 돌리면 남은 것부터`,
    failed: () => `${where ? `${where}에서 ` : ''}실패 — ${run.error && run.error !== RUN_ERROR.unknown ? run.error : '원인은 터미널·함수 로그에'}`,
    lost: () => `${where ? `${where}에서 ` : '중간에 '}${settled ? '끊김' : '멎은 듯'}`,
    // 진행이 끝까지 찬 옛 행 — 지금 스크립트는 마무리(분석)·저장(수집)을 마지막 칸으로 세어 끝 기록 전에는 n/n 이 안 된다.
    unclosed: () => `${where ? `${where}까지 하고 ` : ''}끝 기록 없이 멈춤 — 마무리 중이었을 수 있어요`,
  };
  const label = kind === 'lost' && !settled ? '중단된 듯' : kind === 'stopped' && byTerm ? '멈춤(종료 신호)' : LABEL[kind];
  return { kind, tone: TONE[kind], label, text: text[kind](), where, at, settled };
}
