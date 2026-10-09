/**
 * **추가 수집** — 검수 대기의 후보 하나를 그 상호명으로 블로그에서 한 번 더 찾게 한다(docs/features/admin-review.md 「추가 수집」).
 *
 * 버튼은 `collect_requests` 에 한 줄만 남긴다. 검색은 다음 `pnpm data collect`(사용자 터미널 — 네이버 키가 거기만 있다)가 하고,
 * 담은 글은 다음 `pnpm data analyze` 가 미분석 줄 맨 앞에 세워 읽는다. 새 글에서 나온 같은 가게 후보는 원래 줄과 같은 이름 키라
 * 같은 묶음에 근거로 붙는다(`groupCandidates`) — 따로 합치는 코드가 없다.
 *
 * 표가 원격에 없을 수 있다(마이그레이션은 사용자가 `db push`) — 그때는 버튼을 끄고 "미적용" 으로 말한다. 검수는 막지 않는다.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeName } from '../../scripts/analyze/matchPlace.mjs';
import { isBlocksUnavailable } from './adminBlocks';
import { nextStepText } from './adminNextStep';

export type TCollectRequest = {
  id: string;
  query: string;
  name_key: string;
  status: 'queued' | 'done';
  requested_at: string;
  done_at: string | null;
  found: number | null;
  /** 수집 **때** 아직 분석 안 된 글 수(스냅숏). 카드는 지금 수(`unread`)를 먼저 쓴다. */
  to_read: number | null;
  post_urls: string[];
  /** 불러올 때 다시 센 **지금** 미분석 글 수. 못 셌으면 없다 — 그때만 `to_read` 를 수집 시점의 말로 쓴다. */
  unread?: number;
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

const requestRank = (row: TCollectRequest) => (row.status === 'queued' ? Number.POSITIVE_INFINITY : new Date(row.done_at ?? row.requested_at).getTime());

/** 순수 — 이름 키마다 대기 중인 요청이 이기고, 없으면 가장 늦게 끝난 요청. */
export function latestRequestByName(rows: readonly TCollectRequest[]): TCollectRequestsByName {
  const byName: TCollectRequestsByName = {};
  for (const row of rows) {
    const prev = byName[row.name_key];
    if (!prev || requestRank(row) > requestRank(prev)) byName[row.name_key] = row;
  }
  return byName;
}

/**
 * 카드에 서는 한 줄. 요청이 없으면 `null`. 끝난 요청은 **지금** 미분석인 글 수(`unread`)를 말한다 — 수집 때 센 수(`to_read`)를 그대로 쓰면
 * 분석이 그 글들을 다 읽은 뒤에도 "N건을 먼저 읽어요" 가 30일 동안 남는다. 못 셌을 때만 수집 시점의 말로 적는다.
 */
export function collectRequestLine(request: TCollectRequest | undefined): string | null {
  if (!request) return null;
  if (request.status === 'queued') return `'${request.query}' 로 찾을 차례예요 — ${nextStepText('collectQueued')}`;
  const when = request.done_at ? `${new Date(request.done_at).getMonth() + 1}월 ${new Date(request.done_at).getDate()}일 ` : '';
  const found = request.found ?? 0;
  const toRead = request.to_read ?? 0;
  if (found === 0) return `${when}추가 수집 · 찾은 글이 없어요`;
  if (toRead === 0) return `${when}추가 수집 · 글 ${found}건 모두 이미 분석이 끝난 글이었어요 — 더 붙을 근거가 없어요`;
  if (request.unread === undefined) return `${when}추가 수집 · 글 ${found}건 중 수집 때 미분석 ${toRead}건 — 다음 분석이 먼저 읽어요`;
  if (request.unread === 0) return `${when}추가 수집 · 글 ${found}건을 다 읽었어요 — 붙은 근거는 이 카드의 글 목록에 있어요`;
  return `${when}추가 수집 · 글 ${found}건 중 ${request.unread}건이 아직 분석 전이에요 — 다음 분석이 먼저 읽어요`;
}

const REQUEST_COLUMNS = 'id, query, name_key, status, requested_at, done_at, found, to_read, post_urls';

/** `in('url', …)` 한 번에 싣는 url 수 — 블로그 url 은 개당 50자 안팎이라 100개가 6KB 쯤이다(scripts/lib/chunkForUrlFilter.mjs 의 예산). */
const URL_CHUNK = 100;

/** 순수 — 요청이 담은 글 중 `unanalyzed` 에 든 수를 `unread` 로 얹는다. */
export function withUnread(rows: readonly TCollectRequest[], unanalyzed: ReadonlySet<string>): TCollectRequest[] {
  return rows.map((row) => (row.status === 'done' ? { ...row, unread: row.post_urls.filter((url) => unanalyzed.has(url)).length } : row));
}

/**
 * 대기 중 전부 + 최근 30일 안에 끝난 것(오래된 결과는 카드에 말할 이유가 없다). 끝난 것은 담은 글 중 **지금** 미분석인 수를 다시 센다.
 * 세는 조회가 실패하면 `unread` 없이 돌려준다 — 카드가 수집 시점의 말로 물러난다. 버튼까지 끌 일은 아니다.
 */
export async function fetchCollectRequests(client: SupabaseClient, now: Date = new Date()): Promise<TCollectRequestsLoad> {
  const since = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  const { data, error } = await client.from('collect_requests').select(REQUEST_COLUMNS).or(`status.eq.queued,done_at.gte."${since}"`);
  if (error) return isBlocksUnavailable(error) ? { kind: 'unavailable' } : { kind: 'error', message: error.message };
  const rows = (data ?? []) as TCollectRequest[];
  const urls = [...new Set(rows.filter((row) => row.status === 'done').flatMap((row) => row.post_urls))];
  const unanalyzed = new Set<string>();
  for (let i = 0; i < urls.length; i += URL_CHUNK) {
    const { data: posts, error: postsError } = await client
      .from('blog_posts')
      .select('url')
      .in('url', urls.slice(i, i + URL_CHUNK))
      .is('analyzed_at', null);
    if (postsError) return { kind: 'ok', byName: latestRequestByName(rows) };
    for (const post of posts ?? []) unanalyzed.add(post.url as string);
  }
  return { kind: 'ok', byName: latestRequestByName(withUnread(rows, unanalyzed)) };
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
    .select(REQUEST_COLUMNS)
    .single();
  if (error?.code === '23505') return 'alreadyQueued';
  if (error) throw new Error(isBlocksUnavailable(error) ? COLLECT_REQUESTS_UNAVAILABLE_TEXT : `추가 수집 요청: ${error.message}`);
  return data as TCollectRequest;
}

export const COLLECT_REQUESTS_UNAVAILABLE_TEXT = '추가 수집 표가 아직 적용되지 않았어요';

type TExtractedName = { name: string; nameKey?: string };

/**
 * 카드의 추가 수집 칸 — 요청 목록을 못 읽었으면(`undefined`·오류) 버튼을 안 그린다. 표가 없으면 버튼은 서되 꺼진다(왜인지 `title` 이 말한다). 순수.
 *
 * 요청은 **묶음의 모든 행의 이름 키**로 찾는다. 대표(`lead`)는 confidence 가 가장 높은 행이라, 추가 수집이 다른 이름 표기의 후보를 더 높은
 * 점수로 데려오면 대표가 바뀐다 — 대표 키로만 찾으면 바로 그 순간 요청 줄이 사라지고 버튼이 다시 켜져, 다른 키로 같은 가게를 또 찾게 된다.
 * 검색어는 대표 이름으로 만든다(새로 누를 때 쓰는 이름).
 */
export function collectView(
  load: TCollectRequestsLoad | undefined,
  lead: TExtractedName,
  rows: readonly TExtractedName[] = [lead],
): { query: string; line: string | null; queued: boolean; unavailable: boolean } | undefined {
  if (!load || load.kind === 'error') return undefined;
  const query = collectRequestQuery(lead.name);
  if (load.kind === 'unavailable') return { query, line: null, queued: false, unavailable: true };
  const keys = new Set([lead, ...rows].map((row) => collectRequestKey(row.name, row.nameKey)));
  let request: TCollectRequest | undefined;
  for (const key of keys) {
    const hit = load.byName[key];
    if (hit && (!request || requestRank(hit) > requestRank(request))) request = hit;
  }
  return { query, line: collectRequestLine(request), queued: request?.status === 'queued', unavailable: false };
}
