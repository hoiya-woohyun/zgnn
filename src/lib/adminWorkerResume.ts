/**
 * **서버 워커 이어 돌리기**(todo/20 T10, ADR-028 결정 5) — 깨우기 한 번은 4홉 · 글 최대 20건이다(BUG-016 — Vercel 이 자기 호출 사슬을 4홉에서 끊는다).
 * 그 뒤 남은 일은 요청 글·`queued` 요청으로 남는데, 서버 배지가 사라지면 `/admin` 은 **다 끝난 것처럼** 보였다. 이 파일이 둘을 한다:
 *  - 서버가 쉬는데 일이 남았으면 "남은 N건" 을 말한다(`resumeNotice`).
 *  - 이 화면에서 사람이 한 번 깨운 뒤라면, 서버가 쉬고 · 남은 수가 직전 깨우기 뒤 **줄었을 때만** 다시 깨운다(`resumeDecision`) — 서버 `shouldChain` 의 "줄였고" 와 같은 둑이다.
 *    같은 실패(403 나는 글 하나 · 한도)를 되풀이하지 않게 하고, 페이지당 `RESUME_MAX` 번에서 멈춘다. 탭을 닫으면 멈추고 그 뒤는 다음 버튼이나 PC 워커가 잇는다.
 *
 * 그냥 `/admin` 을 연 것으로는 깨우지 않는다 — 열기만 해도 구독 한도를 쓰면 안 된다. 열었을 때 일이 남아 있으면 줄이 말하고 「서버에서 이어 돌리기」 를 내놓는다.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { TOpsWorker, TPipelineRun } from './adminOps';
import { REMOTE_WORKER_FRESH_MS } from './adminOpsHealth';
import { onlyUnanalyzed } from './adminPosts';
import { REMOTE_WORKER_HOST, type TWakeResult } from './adminWorkerWake';

/**
 * 깨우기 한 번이 읽는 글의 상한 — `scripts/lib/workerRemote.mjs` 의 `MAX_HOPS`(4) × `HOP_ANALYZE_CAP`(5). 앱은 scripts 를 import 하지 않아 값을 한 번 더 적는다.
 * 홉마다 시간 예산(T11)이 글을 더 일찍 끊을 수 있어 "까지" 로만 말한다.
 */
export const WAKE_BATCH_POSTS = 4 * 5;
/** 페이지 하나가 스스로 다시 깨우는 횟수 — 사람이 한 번 깨운 것까지 다섯 번 = 글 100건(`ANALYZE_REQUEST_MAX_LIMIT`, 한 요청이 5시간 창을 다 쓰지 않게 정한 수). */
export const RESUME_MAX = 4;
/**
 * 깨운 뒤 이만큼 서버 행이 아무것도 안 쓰면 "안 받았다" 로 본다 — 콜드 스타트·인증 몇 초에 넉넉히. 그 뒤엔 남은 수로 판단한다(안 줄었으면 멈춘다).
 * 이 시간이 없으면 행이 안 바뀐 채 "깨운 뒤 쉬는 중" 을 영영 기다린다.
 */
export const WAKE_PICKUP_MS = 2 * 60 * 1000;
/** `scripts/lib/runLog.mjs` 의 `RUN_ERROR.claudeLimit` 과 같은 문구 — 실행 행의 `error` 칸은 분류 문구만 담는다. */
export const CLAUDE_LIMIT_ERROR = 'Claude 한도';

/** 서버가 맡을 남은 일. 글 수 둘과 추가 수집 하나 — 요청 **줄 수**가 아니다(「저수지 30건」 은 홉이 돌아도 줄은 1이고 `args.limit` 만 줄어든다). */
export type TServerRemaining = {
  /** 요청 글 — `requested_at` 이 있고 아직 안 읽은 글(서버 `readWorkerState` 의 '요청 글' 과 같은 집합) */
  requestedPosts: number;
  /** 대기·집힌 「저수지 N건」 요청의 남은 N 합(서버 `requestLimit` 과 같은 규칙) */
  backlogAsked: number;
  /** 대기 중인 추가 수집 요청 — 몇 글이 올지는 모른다 */
  collectQueued: number;
};

/** `scripts/lib/workerLoop.mjs` 의 `ANALYZE_REQUEST_DEFAULT_LIMIT`(10) · `ANALYZE_REQUEST_MAX_LIMIT`(100) 과 같은 값. */
const REQUEST_DEFAULT_LIMIT = 10;
const REQUEST_MAX_LIMIT = 100;

/** 순수 — 서버 `requestLimit` 과 같다(정수가 아니거나 0 이하면 기본 10, 상한 100). */
export function requestLimitOf(args: unknown): number {
  const limit = typeof args === 'object' && args !== null ? (args as { limit?: unknown }).limit : undefined;
  return Math.min(Number.isInteger(limit) && (limit as number) > 0 ? (limit as number) : REQUEST_DEFAULT_LIMIT, REQUEST_MAX_LIMIT);
}

/** 읽을 글 수(요청 글 + 저수지 요청). */
export const remainingPosts = (r: TServerRemaining) => r.requestedPosts + r.backlogAsked;
/** 남은 일이 있나 — 추가 수집도 일이다(돌면 요청 글이 생긴다). */
export const hasRemaining = (r: TServerRemaining) => remainingPosts(r) + r.collectQueued > 0;

/**
 * 순수 — 직전 깨우기 뒤에 줄었나. **어느 한 축이라도** 줄면 줄었다: 추가 수집이 돌면 수집 요청은 줄고 요청 글은 **는다**(그 글을 읽을 차례가 온 것) —
 * 합으로 보면 진척이 거꾸로 보인다. 둘 다 그대로면 서버가 한 일이 없다(같은 실패를 되풀이하지 않는다).
 */
export function remainingShrank(before: TServerRemaining, after: TServerRemaining): boolean {
  return remainingPosts(after) < remainingPosts(before) || after.collectQueued < before.collectQueued;
}

const seenMs = (row: TOpsWorker | undefined) => (row ? Date.parse(row.last_seen_at) : Number.NaN);

/**
 * 순수 — 서버가 **쉬는 중**인가(깨워도 겹치지 않나). 사슬은 홉마다 심장을 idle 로 쓴 **뒤에** 다음 홉을 부른다 — idle 이 보이는 순간 깨우면
 * 사슬 중간의 틈에 두 번째 인스턴스가 서서 같은 글을 둘이 읽는다(`candidates` 에 유일 제약이 없다, ADR-028 결정 10). 그래서:
 *  - 행이 일하는 중이고 60초 안에 뛰었으면 일하는 중이다(서버 `remoteWorkerBusy` 와 같은 신선도).
 *  - 그 밖(idle, 또는 일하는 중인데 멎은 행 — 300초에 잘린 홉)은 **마지막으로 쓴 지 60초가 지나야** 쉰다. 사슬의 다음 홉은 그 안에 행을 다시 쓴다.
 *  - 깨운 뒤(`wokeAtMs`) 행이 한 번도 안 쓰였으면 `WAKE_PICKUP_MS` 를 기다린다 — 받았으면 곧 쓴다.
 */
export function serverResting(workers: readonly TOpsWorker[], wokeAtMs: number, nowMs: number): boolean {
  const row = workers.find((worker) => worker.host === REMOTE_WORKER_HOST);
  const seen = seenMs(row);
  if (!Number.isFinite(seen) || seen < wokeAtMs) return nowMs - wokeAtMs >= WAKE_PICKUP_MS;
  return nowMs - seen >= REMOTE_WORKER_FRESH_MS;
}

/** 순수 — PC 워커가 받을 수 있나. 서버 `localWorkerAlive` 와 같은 규칙(60초 · 로그인·한도 기다림은 일 못 함) — 맞으면 서버는 깨워도 `local` 로 비킨다. */
export function localTakesOver(workers: readonly TOpsWorker[], nowMs: number): boolean {
  return workers.some((worker) => {
    if (worker.host === REMOTE_WORKER_HOST || worker.phase === 'login-needed' || worker.phase === 'rate-limited') return false;
    const seen = seenMs(worker);
    return Number.isFinite(seen) && nowMs - seen <= REMOTE_WORKER_FRESH_MS;
  });
}

export type TResumeStop = 'done' | 'local' | 'limit' | 'stuck' | 'cap' | 'unwoken';

/**
 * 이 화면의 이어 돌리기 상태. `off` — 이 화면에서 깨운 적 없다. `armed` — 깨웠고, 서버가 쉬면 남은 수를 직전(`baseline`)과 견준다.
 * `stopped` — 멈췄다(왜인지는 `why`, 줄이 말한다). 사람이 다시 깨우면 다시 `armed`.
 */
export type TResumeState =
  | { kind: 'off' }
  | { kind: 'armed'; baseline: TServerRemaining; wokeAtMs: number; resumes: number }
  | { kind: 'stopped'; why: TResumeStop };

export type TResumeDecision = { action: 'wait' } | { action: 'wake' } | { action: 'stop'; why: TResumeStop };

/**
 * 순수 — 쉬는 서버를 다시 깨울까. 부르는 쪽은 `serverResting` 이 참일 때 남은 수를 **새로 세어** 넣는다(심장 이벤트보다 늦게 오는 집계를 믿지 않는다).
 * 다 맞아야 깨운다: 남은 일이 있고 · PC 워커가 안 받고 · 깨운 뒤 분석이 한도로 끝나지 않았고 · 직전보다 줄었고 · 상한 안.
 */
export function resumeDecision({
  state,
  remaining,
  workers,
  lastAnalyze,
  nowMs,
}: {
  state: TResumeState;
  remaining: TServerRemaining;
  workers: readonly TOpsWorker[];
  /** 마지막 분석 실행(`runsLatest.analyze`) — 한도로 끝났나만 본다 */
  lastAnalyze: TPipelineRun | undefined;
  nowMs: number;
}): TResumeDecision {
  if (state.kind !== 'armed' || !serverResting(workers, state.wokeAtMs, nowMs)) return { action: 'wait' };
  if (!hasRemaining(remaining)) return { action: 'stop', why: 'done' };
  if (localTakesOver(workers, nowMs)) return { action: 'stop', why: 'local' };
  const limited = lastAnalyze?.error === CLAUDE_LIMIT_ERROR && Date.parse(lastAnalyze.started_at) >= state.wokeAtMs;
  if (limited) return { action: 'stop', why: 'limit' };
  if (!remainingShrank(state.baseline, remaining)) return { action: 'stop', why: 'stuck' };
  if (state.resumes >= RESUME_MAX) return { action: 'stop', why: 'cap' };
  return { action: 'wake' };
}

/** 순수 — 깨우기 결과로 다음 상태. 서버가 받았으면(started·busy) 지금 센 수를 새 기준으로, 아니면 멈춘다(`wakeNotice` 가 왜인지 따로 말한다). */
export function afterWake(result: TWakeResult, remaining: TServerRemaining | null, wokeAtMs: number, resumes: number): TResumeState {
  if (result === 'local') return { kind: 'stopped', why: 'local' };
  if ((result !== 'started' && result !== 'busy') || !remaining) return { kind: 'stopped', why: 'unwoken' };
  return { kind: 'armed', baseline: remaining, wokeAtMs, resumes };
}

export type TResumeNotice = {
  text: string;
  /** 경고 색(멈췄다)인가 */
  warn: boolean;
  /** 「서버에서 이어 돌리기」 를 내놓나 */
  canResume: boolean;
};

const STOP_TEXT: Record<Exclude<TResumeStop, 'done' | 'local'>, string> = {
  limit: 'Claude 한도라 이어 깨우기를 멈췄어요(리셋 뒤에 다시) —',
  stuck: '지난 깨우기 뒤 줄지 않아 멈췄어요(실패는 운영 현황에서) —',
  cap: `이 화면에서 ${RESUME_MAX}번 이어 깨웠어요 —`,
  unwoken: '서버 워커를 못 깨워 멈췄어요 —',
};

/**
 * 순수 — 실시간 줄 밑의 한 줄. 서버가 받는 빌드(`remote`)에서 남은 일이 있을 때만 말한다. PC 워커가 받으면 말하지 않는다(실시간 줄이 PC 워커를 말한다).
 * 서버가 쉬지 않으면(일하는 중 · 깨운 직후 · 홉 사이) 20건을 넘을 때만 "한 번에 20건까지" 를 미리 말한다 — 「저수지 30건」 이 한 번에 안 끝난다는 것을 누른 직후에 알게.
 * 「서버에서 이어 돌리기」 는 쉬는 중에만 내놓는다 — 홉 사이의 idle 에 누르면 사슬의 다음 홉과 겹친다(`serverResting`).
 */
export function resumeNotice({
  remote,
  remaining,
  state,
  resting,
  localAlive,
}: {
  remote: boolean;
  remaining: TServerRemaining | null;
  state: TResumeState;
  /** 서버가 쉬는 중(`serverResting` — 무장했으면 깨운 시각부터, 아니면 행만 보고) */
  resting: boolean;
  /** PC 워커가 받는다(`localTakesOver`) */
  localAlive: boolean;
}): TResumeNotice | null {
  if (!remote || !remaining || !hasRemaining(remaining) || localAlive) return null;
  if (state.kind === 'stopped' && (state.why === 'done' || state.why === 'local')) return null;
  const posts = remainingPosts(remaining);
  const left = [posts > 0 ? `남은 글 ${posts.toLocaleString('ko-KR')}건` : null, remaining.collectQueued > 0 ? `추가 수집 ${remaining.collectQueued}건` : null]
    .filter(Boolean)
    .join(' · ');
  const armed = state.kind === 'armed';
  if (!resting) {
    if (posts <= WAKE_BATCH_POSTS) return null;
    const after = armed ? '쉬면 이 화면이 이어서 깨워요' : '나머지는 「서버에서 이어 돌리기」 나 PC 워커가';
    return { text: `${left} — 서버는 한 번 깨우면 ${WAKE_BATCH_POSTS}건까지라 ${after}`, warn: false, canResume: false };
  }
  if (armed) return { text: `서버가 이번에 ${WAKE_BATCH_POSTS}건까지 돌고 쉬어요 — ${left}, 곧 이어서 깨워요`, warn: false, canResume: false };
  if (state.kind === 'stopped') return { text: `${STOP_TEXT[state.why as keyof typeof STOP_TEXT]} ${left}`, warn: true, canResume: true };
  return { text: `서버 워커가 쉬는 중이에요 — ${left}`, warn: false, canResume: true };
}

/**
 * 남은 일을 센다 — 요청 글(head count) · 추가 수집 대기(head count) · 분석 요청 줄(`args` 를 읽어야 해서 행). 마이그레이션 없이 운영자 RLS 안의 읽기 셋.
 * 제외 칸(`excluded_at`)이 없는 DB 면 그 조건 없이 다시 센다(`countPosts` 와 같은 태도 — 제외한 글이 있을 수 없다). 실패는 던진다(부르는 쪽이 조용히 다룬다).
 */
export async function fetchServerRemaining(client: SupabaseClient): Promise<TServerRemaining> {
  const requested = (excludedApplied: boolean) =>
    onlyUnanalyzed(client.from('blog_posts').select('url', { count: 'exact', head: true }), excludedApplied).not('requested_at', 'is', null);
  const [withExcluded, collect, requests] = await Promise.all([
    requested(true),
    client.from('collect_requests').select('id', { count: 'exact', head: true }).eq('status', 'queued'),
    client.from('pipeline_requests').select('kind, args').eq('kind', 'analyze').in('status', ['queued', 'taken']),
  ]);
  const posts = withExcluded.error ? await requested(false) : withExcluded;
  if (posts.error) throw new Error(`남은 요청 글을 세지 못했어요 (${posts.error.message})`);
  if (collect.error) throw new Error(`추가 수집 요청을 세지 못했어요 (${collect.error.message})`);
  if (requests.error) throw new Error(`분석 요청을 읽지 못했어요 (${requests.error.message})`);
  return {
    requestedPosts: posts.count ?? 0,
    backlogAsked: (requests.data ?? []).reduce((sum, row) => sum + requestLimitOf((row as { args?: unknown }).args), 0),
    collectQueued: collect.count ?? 0,
  };
}
