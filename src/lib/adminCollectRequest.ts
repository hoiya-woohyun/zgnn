/**
 * **추가 수집** — 검수 대기의 후보 하나를 그 상호명으로 블로그에서 한 번 더 찾게 한다(docs/features/admin-review.md 「추가 수집」).
 *
 * 버튼은 `collect_requests` 에 한 줄만 남긴다. 검색은 다음 `pnpm data:collect`(사용자 터미널 — 네이버 키가 거기만 있다)가 하고,
 * 담은 글은 다음 `pnpm data:analyze` 가 미분석 줄 맨 앞에 세워 읽는다. 새 글에서 나온 같은 가게 후보는 원래 줄과 같은 이름 키라
 * 같은 묶음에 근거로 붙는다(`groupCandidates`) — 따로 합치는 코드가 없다.
 *
 * 표가 원격에 없을 수 있다(마이그레이션은 사용자가 `db push`) — 그때는 버튼을 끄고 "미적용" 으로 말한다. 검수는 막지 않는다.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeName } from '../../scripts/analyze/matchPlace.mjs';
import { isBlocksUnavailable } from './adminBlocks';

export type TCollectRequest = {
  id: string;
  query: string;
  name_key: string;
  status: 'queued' | 'done';
  requested_at: string;
  done_at: string | null;
  found: number | null;
  new_posts: number | null;
};

/** 이름 키 → 그 가게의 가장 최근 요청. 화면은 하나만 말한다(대기 중이면 대기, 아니면 마지막 결과). */
export type TCollectRequestsByName = Record<string, TCollectRequest>;

export type TCollectRequestsLoad = { kind: 'ok'; byName: TCollectRequestsByName } | { kind: 'unavailable' } | { kind: 'error'; message: string };

/**
 * 상호명 → 네이버 블로그 검색어.
 *
 * `애견동반` 을 붙이지 않는다 — 검색어에 들어간 말은 요약문에 그대로 걸려 나와 근거처럼 보인다(ADR-019 v5). 동반 여부는 본문 분석이 정한다.
 * `제주` 를 붙이는 이유는 수집이 제목·요약에 "제주" 가 없는 글을 버리기 때문이다(`mentionsJeju`) — 붙이면 그런 글이 더 많이 걸린다.
 */
export function collectRequestQuery(name: string): string {
  const trimmed = name.replace(/\s+/g, ' ').trim();
  return `제주 ${trimmed}`;
}

/** 같은 가게인지 가르는 키 — `place_blocks` 와 같은 함수(`normalizeName`)라 두 표가 같은 가게를 같은 키로 부른다. */
export function collectRequestKey(name: string, nameKey?: string): string {
  return nameKey ?? normalizeName(name);
}

/** 순수 — 이름 키마다 대기 중인 요청이 이기고, 없으면 가장 늦게 끝난 요청. */
export function latestRequestByName(rows: readonly TCollectRequest[]): TCollectRequestsByName {
  const rank = (row: TCollectRequest) => (row.status === 'queued' ? Number.POSITIVE_INFINITY : new Date(row.done_at ?? row.requested_at).getTime());
  const byName: TCollectRequestsByName = {};
  for (const row of rows) {
    const prev = byName[row.name_key];
    if (!prev || rank(row) > rank(prev)) byName[row.name_key] = row;
  }
  return byName;
}

/**
 * 카드에 서는 한 줄. 요청이 없으면 `null`. 끝난 요청은 **새 글 수**를 말한다 — 이미 있던 글만 찾았으면 다음 분석이 읽을 것이 없고,
 * "추가 수집했어요" 만 적으면 운영자는 근거가 곧 붙을 줄 안다.
 */
export function collectRequestLine(request: TCollectRequest | undefined): string | null {
  if (!request) return null;
  if (request.status === 'queued') return `'${request.query}' 로 찾을 차례예요 — 터미널에서 pnpm data:collect`;
  const when = request.done_at ? `${new Date(request.done_at).getMonth() + 1}월 ${new Date(request.done_at).getDate()}일 ` : '';
  const found = request.found ?? 0;
  const fresh = request.new_posts ?? 0;
  if (found === 0) return `${when}추가 수집 · 찾은 글이 없어요`;
  if (fresh === 0) return `${when}추가 수집 · 글 ${found}건 모두 이미 있던 글이에요`;
  return `${when}추가 수집 · 새 글 ${fresh}건 — 다음 pnpm data:analyze 가 먼저 읽어요`;
}

/** 대기 중 전부 + 최근 30일 안에 끝난 것. 오래된 결과는 카드에 말할 이유가 없다. */
export async function fetchCollectRequests(client: SupabaseClient, now: Date = new Date()): Promise<TCollectRequestsLoad> {
  const since = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  const { data, error } = await client
    .from('collect_requests')
    .select('id, query, name_key, status, requested_at, done_at, found, new_posts')
    .or(`status.eq.queued,done_at.gte."${since}"`);
  if (error) return isBlocksUnavailable(error) ? { kind: 'unavailable' } : { kind: 'error', message: error.message };
  return { kind: 'ok', byName: latestRequestByName((data ?? []) as TCollectRequest[]) };
}

/**
 * 요청 한 줄. 이미 대기 중이면(유일 인덱스 23505) 실패가 아니다 — 같은 가게는 한 번만 찾으면 된다.
 * 넣은 행은 `.select()` 로 돌려받는다(운영자는 select 권한이 있다) — 화면이 곧바로 "찾을 차례예요" 를 그리는 바탕이다.
 */
export async function requestCollect(
  client: SupabaseClient,
  input: { name: string; nameKey?: string; candidateId: string },
): Promise<TCollectRequest | 'alreadyQueued'> {
  const row = {
    query: collectRequestQuery(input.name),
    name: input.name,
    name_key: collectRequestKey(input.name, input.nameKey),
    candidate_id: input.candidateId,
  };
  const { data, error } = await client
    .from('collect_requests')
    .insert(row)
    .select('id, query, name_key, status, requested_at, done_at, found, new_posts')
    .single();
  if (error?.code === '23505') return 'alreadyQueued';
  if (error) throw new Error(isBlocksUnavailable(error) ? COLLECT_REQUESTS_UNAVAILABLE_TEXT : `추가 수집 요청: ${error.message}`);
  return data as TCollectRequest;
}

export const COLLECT_REQUESTS_UNAVAILABLE_TEXT = '추가 수집 표가 아직 적용되지 않았어요';

/** 카드의 추가 수집 칸 — 요청 목록을 못 읽었으면(`undefined`·오류) 버튼을 안 그린다. 표가 없으면 버튼은 서되 꺼진다(왜인지 `title` 이 말한다). 순수. */
export function collectView(
  load: TCollectRequestsLoad | undefined,
  extracted: { name: string; nameKey?: string },
): { query: string; line: string | null; queued: boolean; unavailable: boolean } | undefined {
  if (!load || load.kind === 'error') return undefined;
  const query = collectRequestQuery(extracted.name);
  if (load.kind === 'unavailable') return { query, line: null, queued: false, unavailable: true };
  const request = load.byName[collectRequestKey(extracted.name, extracted.nameKey)];
  return { query, line: collectRequestLine(request), queued: request?.status === 'queued', unavailable: false };
}
