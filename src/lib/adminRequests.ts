/**
 * **「저수지 N건 분석」** — 검수 대기에서 미분석 글(저수지) N건을 지금 읽게 로컬 워커에 요청한다(ADR-024 결정 2·4, todo/17 T6).
 *
 * 워커의 자동 분석은 요청 글(`requested_at`)만 읽고 저수지는 안 읽는다(결정 4) — 저수지를 읽는 길은 이 요청 하나다.
 * 버튼은 `pipeline_requests` 에 `kind: 'analyze', args: {limit}` 한 줄만 남기고, 워커가 그 줄을 집어 `analyze --limit N` 을 돈다.
 *
 * insert 만 하고 `.select()` 를 붙이지 않는다(선례 `placeReportSend.ts` — RETURNING 을 달라고 하면 select 권한 쪽에서 42501 이 날 수 있다).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { isBlocksUnavailable } from './adminBlocks';
import type { TWorkerHealth } from './adminOpsHealth';
import { WORKER_WAKE_URL } from './adminWorkerWake';

/** 고를 수 있는 건수. 화면은 앞의 둘만 내놓고, 100 은 워커의 상한(`ANALYZE_REQUEST_MAX_LIMIT`)과 같은 수다. */
export const ANALYZE_LIMITS = [10, 30, 100] as const;
export type TAnalyzeLimit = (typeof ANALYZE_LIMITS)[number];
/** 화면의 선택지 — 한 번에 100건은 구독 한도(5시간 창)를 한 요청이 다 쓸 수 있어 버튼으로는 열지 않는다. */
export const ANALYZE_LIMIT_CHOICES: readonly TAnalyzeLimit[] = [10, 30];

/** 순수 — 정해 둔 건수만 통과한다. 화면 밖에서 들어온 수(예: 문자열 키)를 그대로 싣지 않게. */
export function isAnalyzeLimit(value: unknown): value is TAnalyzeLimit {
  return ANALYZE_LIMITS.includes(value as TAnalyzeLimit);
}

export type TAnalyzeRequestResult = 'queued' | 'alreadyQueued';

export const PIPELINE_REQUESTS_UNAVAILABLE_TEXT = '요청 표가 아직 적용되지 않았어요';

/**
 * 같은 kind 의 `queued` 가 이미 있으면 넣지 않는다(멱등). 세기와 넣기 사이는 원자적이지 않지만, 두 줄이 겹쳐 들어가도
 * 워커가 **가장 오래된 하나씩** 집어 돈다(`scripts/lib/workerLoop.mjs` 의 `requestLimit`, 17 리뷰 13) — 두 번 도는 것이 전부라 해가 없다.
 *
 * 세기는 `head: true` 라 표가 없을 때도 오류 code 가 비어 온다(todo/17 T3.1) — 미적용은 insert 쪽 오류가 말하게 두고, 세기 실패는 그대로 던진다.
 */
export async function requestAnalyze(client: SupabaseClient, input: { limit: TAnalyzeLimit }): Promise<TAnalyzeRequestResult> {
  if (!isAnalyzeLimit(input.limit)) throw new Error(`분석 요청: 건수는 ${ANALYZE_LIMITS.join('·')} 중 하나여야 해요`);
  const { count, error: countError } = await client
    .from('pipeline_requests')
    .select('id', { count: 'exact', head: true })
    .eq('kind', 'analyze')
    .eq('status', 'queued');
  if (countError) throw new Error(`분석 요청: 대기 중인 요청을 세지 못했어요${countError.message ? ` — ${countError.message}` : ''}`);
  if ((count ?? 0) > 0) return 'alreadyQueued';
  const { error } = await client.from('pipeline_requests').insert({ kind: 'analyze', args: { limit: input.limit } });
  if (error) throw new Error(isBlocksUnavailable(error) ? PIPELINE_REQUESTS_UNAVAILABLE_TEXT : `분석 요청: ${error.message}`);
  return 'queued';
}

export type TAnalyzeRequestView = { label: string; disabled: boolean; hint: string | null };

/**
 * 순수 — 버튼 한 칸. `backlog` 는 미분석 글 수(`ops_overview.backlog.count`), 못 읽었으면 `undefined`.
 *
 * - 로컬 워커가 없거나 멎었으면 끈다 — 요청이 쌓이기만 하고 아무도 집지 않는다. **단 서버 워커를 깨울 수 있으면(`remote`) 켠다** — 요청을 넣으면 서버가 돈다(ADR-028).
 * - 한도 휴식·로그인 기다림이면 켠다 — 요청은 남고 깨어나면 돈다. 한도 휴식이면 "끊기면 다시" 를 붙인다: 분석이 한도로 중간에 끊겨도
 *   그 요청은 `done` 이라(실패해도 done 규칙, todo/17 T3.4) 남은 건수를 워커가 다시 세워 주지 않는다.
 * - 워커를 모르면(`null` — 집계를 못 읽었거나 마이그레이션 전) 켜 둔다. 모르는 것을 "워커 없음" 으로 말하지 않는 머리글 규칙과 같다.
 * - 저수지가 0 이면 끈다. 라벨의 N 은 저수지보다 클 수 없다.
 */
export function analyzeRequestView(
  worker: TWorkerHealth | null,
  backlog: number | undefined,
  limit: TAnalyzeLimit,
  remote: boolean = WORKER_WAKE_URL !== '',
): TAnalyzeRequestView {
  const n = backlog === undefined ? limit : Math.min(backlog, limit);
  const label = backlog === undefined ? `저수지 ${n}건 분석` : `미분석 ${backlog}건 중 ${n}건 분석`;
  if (backlog === 0) return { label: '저수지 분석', disabled: true, hint: '미분석 글이 없어요' };
  if (worker?.state === 'none' || worker?.state === 'stale') {
    if (remote) return { label, disabled: false, hint: 'PC 워커가 꺼져 있어 서버 워커가 돌려요' };
    return { label, disabled: true, hint: `워커를 켜 주세요(터미널에서 pnpm data)${worker.state === 'stale' ? ' — 지금 워커는 멎은 듯해요' : ''}` };
  }
  if (worker?.state === 'rate-limited') return { label, disabled: false, hint: '한도 휴식 중 — 요청은 넣을 수 있고 깨어나면 돌아요. 한도로 끊긴 요청은 대기로 돌아가 다시 집혀요' };
  if (worker?.state === 'login-needed') return { label, disabled: false, hint: '워커가 로그인을 기다려요 — 요청은 넣을 수 있고 로그인 뒤 돌아요' };
  return { label, disabled: false, hint: null };
}
