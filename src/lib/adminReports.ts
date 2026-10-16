/**
 * 운영자 쪽 **사용자 제보** 처리(ADR-021 · docs/todo/10 T1.4 · T2.2 · T3.3). 보내는 쪽은 `placeReport.ts`·`placeReportSend.ts`.
 *
 * 처리는 상태 한 칸 `open → handled | dismissed`(+ `handled_note`·`handled_at`)이고 **삭제는 없다**(R3 — `dismissed` 가 삭제다).
 * 폐업 제보의 `등록 해제` 는 여기서 하지 않는다 — 기존 해제 폼을 연다(R4). 두 번째 내리기 버튼이 생기면 한쪽만 `place_blocks` 를 쓴다.
 *
 * **표가 원격에 없을 수 있다**(마이그레이션 `20261001130000` 미적용). 그때는 `unavailable` 로 말하고 다른 칸을 막지 않는다.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { isBlocksUnavailable } from './adminBlocks';
import type { TPlaceRow } from './adminCandidates';
import { COLLECT_REQUESTS_UNAVAILABLE_TEXT, collectRequestKey, collectRequestQuery } from './adminCollectRequest';
import type { TReportKind } from './placeReport';

export type TReportStatus = 'open' | 'handled' | 'dismissed';

export type TReportRow = {
  id: string;
  place_id: string | null;
  kind: TReportKind;
  note: string | null;
  app_build: string | null;
  status: TReportStatus;
  handled_note: string | null;
  handled_at: string | null;
  created_at: string;
};

export type TReportsLoad = { kind: 'ok'; rows: TReportRow[] } | { kind: 'unavailable' } | { kind: 'error'; message: string };

/**
 * 열린 제보 전부 + 최근 60일의 `visited_ok`(닫혔든 아니든 — 30일 2건 규칙이 처리 뒤에도 셀 수 있게).
 * 지금 규모(0건에서 시작)는 기본 1000행 한도에 한참 못 미친다.
 */
export async function fetchReports(client: SupabaseClient, now: Date = new Date()): Promise<TReportsLoad> {
  const since = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await client
    .from('place_reports')
    .select('*')
    .or(`status.eq.open,and(kind.eq.visited_ok,created_at.gte.${since})`)
    .order('created_at', { ascending: false });
  if (error) return isBlocksUnavailable(error) ? { kind: 'unavailable' } : { kind: 'error', message: error.message };
  return { kind: 'ok', rows: (data ?? []) as TReportRow[] };
}

/** 운영자가 처리할 제보인가 — 열려 있고 `visited_ok` 가 아니다(그것은 처리할 것이 아니라 세는 것이다). */
export const needsHandling = (row: TReportRow): boolean => row.status === 'open' && row.kind !== 'visited_ok';

/** 장소 id → 처리할 제보(최신순). 순수. 제안(`place_id null`)은 빠진다. */
export function openReportsByPlace(rows: readonly TReportRow[]): Record<string, TReportRow[]> {
  const byPlace: Record<string, TReportRow[]> = {};
  for (const row of rows) {
    if (!row.place_id || !needsHandling(row)) continue;
    (byPlace[row.place_id] ??= []).push(row);
  }
  for (const list of Object.values(byPlace)) list.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  return byPlace;
}

/** 열린 장소 제안(F8) — 최신순. 순수. */
export const openSuggestions = (rows: readonly TReportRow[]): TReportRow[] =>
  rows.filter((row) => row.kind === 'suggest' && row.status === 'open').sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

/** 칸 하나(등록 완료 = 내리지 않은 곳 · 등록 해제 = 내린 곳)에서 제보가 열린 곳의 수 — 그 칸의 `제보 있는 곳` 칩이 남기는 줄 수다. 순수. */
export function countReportedPlaces(
  byPlace: Readonly<Record<string, readonly TReportRow[]>>,
  places: readonly Pick<TPlaceRow, 'id' | 'status'>[],
  archived: boolean,
): number {
  return places.filter((place) => (place.status === 'archived') === archived && (byPlace[place.id]?.length ?? 0) > 0).length;
}

/**
 * 머리글의 "열린 제보" — **가서 보는 곳과 같은 단위로** 센다(14 W261010.13). 순수. 오늘은 `now` 의 현지 날짜 기준.
 *
 * 예전 한 숫자(`needsHandling` 의 건수)는 장소 제안까지 셌고(제안도 열린 미처리다), 머리글이 보내는 `제보 있는 곳` 칩은 **곳**을 셌다 —
 * "열린 제보 9건" 을 보고 가면 칩은 6, 나머지 3(제안)은 다른 칸 맨 아래였다. 그래서 칩과 같은 함수(`countReportedPlaces`)로 곳을 세고,
 * 제안은 따로 센다(같은 칩을 켜면 목록 위에 선다). 내린 곳에 남은 제보는 그 칸 칩의 몫이라 따로 센다 — 내릴 때 함께 닫히므로 보통 0 이다.
 */
export type TReportInbox = {
  /** 등록 완료 칸에서 제보가 열린 곳(곳) — 그 칸 `제보 있는 곳` 칩의 숫자. */
  places: number;
  /** 그 곳들에 열린 제보(건). 한 곳에 둘이면 곳보다 크다. */
  reports: number;
  /** 등록 해제 칸에서 제보가 열린 곳(곳). */
  archivedPlaces: number;
  /** 열린 장소 제안(건). */
  suggestions: number;
  /** 오늘 들어온 것 — 종류·상태 불문(다녀왔어요·제안 포함). 처리할 일이 아니라 들어오는 속도다. */
  today: number;
};

export function reportInbox(rows: readonly TReportRow[], places: readonly Pick<TPlaceRow, 'id' | 'status'>[], now: Date): TReportInbox {
  const byPlace = openReportsByPlace(rows);
  /* 목록에 없는 장소 id(목록을 아직 못 읽었다)는 등록 완료 칸 몫으로 센다 — 제보는 게시중인 곳에만 들어온다(정책 `with check`). */
  const known = new Set(places.map((place) => place.id));
  const unknown = Object.keys(byPlace)
    .filter((id) => !known.has(id))
    .map((id) => ({ id, status: 'published' as const }));
  const all = [...places, ...unknown];
  const today = now.toLocaleDateString('sv-SE');
  return {
    places: countReportedPlaces(byPlace, all, false),
    reports: all.filter((place) => place.status !== 'archived').reduce((sum, place) => sum + (byPlace[place.id]?.length ?? 0), 0),
    archivedPlaces: countReportedPlaces(byPlace, all, true),
    suggestions: openSuggestions(rows).length,
    today: rows.filter((row) => reportDay(row.created_at) === today).length,
  };
}

/** 머리글 한 줄 — 0 인 갈래는 말하지 않는다. 할 일이 없고 오늘 들어온 것도 없으면 `null`. 순수. */
export function reportInboxText(inbox: TReportInbox): string | null {
  const parts: string[] = [];
  if (inbox.places > 0) parts.push(inbox.reports > inbox.places ? `열린 제보 ${inbox.places}곳(${inbox.reports}건)` : `열린 제보 ${inbox.places}곳`);
  if (inbox.suggestions > 0) parts.push(`장소 제안 ${inbox.suggestions}건`);
  if (inbox.archivedPlaces > 0) parts.push(`등록 해제 칸에 열린 제보 ${inbox.archivedPlaces}곳`);
  if (inbox.today > 0) parts.push(`오늘 들어온 것 ${inbox.today}건`);
  return parts.length > 0 ? parts.join(' · ') : null;
}

/** 머리글이 `등록 완료 칸에서 보기` 로 보낼 것이 있나 — 등록 완료 칸의 제보나 제안. */
export const inboxHasWork = (inbox: TReportInbox): boolean => inbox.places > 0 || inbox.suggestions > 0;

/** 폐업으로 읽히는 종류 — 이것이 열려 있으면 등록 해제 폼을 `폐업` 으로 열고, 사이트는 확인일을 그리지 않는다(R5). */
export const CLOSURE_KINDS: readonly TReportKind[] = ['closed', 'replaced'];

/**
 * 제보 여럿의 상태를 바꾼다. 0행이면 던진다 — 정책이 어긋나면 PostgREST 는 에러가 아니라 빈 결과를 준다.
 */
export async function setReportStatus(
  client: SupabaseClient,
  ids: readonly string[],
  status: Exclude<TReportStatus, 'open'>,
  note: string | undefined,
  nowIso: string,
): Promise<TReportRow[]> {
  if (ids.length === 0) return [];
  const { data, error } = await client
    .from('place_reports')
    .update({ status, handled_note: note?.trim() || null, handled_at: nowIso })
    .in('id', [...ids])
    .select();
  if (error) throw new Error(`제보를 처리하지 못했어요 — 다시 눌러 보고, 안 되면 다시 로그인해 주세요. (${error.message})`);
  if (!data || data.length === 0) throw new Error('제보를 처리하지 못했어요 — 바뀐 줄이 없어요. 다시 로그인해 주세요.');
  return data as TReportRow[];
}

/**
 * 장소를 등록 해제했다 — 그 장소의 열린 제보를 `handled` 로 함께 닫는다(R4: 사이트에 없는 곳에 대한 말은 더 할 일이 없다).
 * 실패해도 던지지 않는다 — 해제는 이미 됐고, 남은 제보는 등록 해제 칸에서 손으로 닫을 수 있다.
 */
export async function closeReportsForArchived(
  client: SupabaseClient,
  rows: readonly TReportRow[],
  placeId: string,
  nowIso: string,
): Promise<TReportRow[]> {
  const ids = rows.filter((row) => row.place_id === placeId && needsHandling(row)).map((row) => row.id);
  if (ids.length === 0) return [];
  try {
    return await setReportStatus(client, ids, 'handled', '등록 해제로 닫음', nowIso);
  } catch {
    return [];
  }
}

/** 바뀐 행을 목록에 덮는다 — 순수. */
export function mergeReportRows(rows: readonly TReportRow[], updated: readonly TReportRow[]): TReportRow[] {
  const byId = new Map(updated.map((row) => [row.id, row]));
  return rows.map((row) => byId.get(row.id) ?? row);
}

/**
 * 제보가 **어느 사이트에서** 왔나를 운영자 말로 — 순수(14 W261010.14 "운영자 말"). `배포 dda522e` 는 커밋 해시라 운영자가 읽을 수 없었다.
 * 운영자가 알아야 하는 것은 하나다: 지금 나가 있는 사이트를 보고 한 말인가, 그 전 사이트를 보고 한 말인가(그 뒤 고쳤으면 무시해도 된다).
 * `/admin` 은 같은 배포에서 돌므로 `current`(이 화면의 빌드)와 같으면 지금 사이트다. 값이 없으면(옛 보내기) 말하지 않는다.
 */
export function reportBuildText(appBuild: string | null, current: string): string | null {
  if (!appBuild) return null;
  return appBuild === current ? '지금 사이트를 보고 보냄' : '예전 사이트를 보고 보냄 — 그 뒤 고친 것일 수 있어요';
}

/** 제보 한 줄의 날짜 — `2026-10-01`. */
export const reportDay = (iso: string): string => new Date(iso).toLocaleDateString('sv-SE');

/** "다녀왔어요" 를 확인 날짜로 올리는 규칙(ADR-021 R5) — 30일 안에 2건 이상. 한 건은 실수일 수 있다. */
export const VISITED_WINDOW_DAYS = 30;
export const VISITED_MIN_COUNT = 2;

export type TVisitedTally = {
  /** 아직 반영하지 않은(열린) 다녀왔어요 중 창 안이고 마지막 확인보다 뒤인 것. */
  ids: string[];
  /** 규칙을 채웠나 — `/admin` 의 「최근 확인으로 반영」 이 선다. 자동으로 올리지는 않는다(운영자가 한 번 본다). */
  ready: boolean;
};

/**
 * 장소 id → 다녀왔어요 집계 — 순수. 마지막 확인(`verified_at`) **이전**의 것은 세지 않는다 — 이미 그 확인에 포함된 말이다.
 * 열린 폐업 제보가 있는 곳은 `ready` 가 서지 않는다 — "그대로였어요" 와 "문 닫았어요" 가 같이 있으면 사람이 먼저 봐야 한다.
 */
export function visitedTallyByPlace(
  rows: readonly TReportRow[],
  verifiedAtById: Readonly<Record<string, string | null | undefined>>,
  now: Date,
): Record<string, TVisitedTally> {
  const since = now.getTime() - VISITED_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const closure = new Set(
    rows.filter((row) => row.place_id && row.status === 'open' && CLOSURE_KINDS.includes(row.kind)).map((row) => row.place_id),
  );
  const tally: Record<string, TVisitedTally> = {};
  for (const row of rows) {
    if (!row.place_id || row.kind !== 'visited_ok' || row.status !== 'open') continue;
    const at = new Date(row.created_at).getTime();
    if (at < since) continue;
    const verified = verifiedAtById[row.place_id];
    if (verified && at <= new Date(verified).getTime()) continue;
    (tally[row.place_id] ??= { ids: [], ready: false }).ids.push(row.id);
  }
  for (const [placeId, entry] of Object.entries(tally)) {
    entry.ready = entry.ids.length >= VISITED_MIN_COUNT && !closure.has(placeId);
  }
  return tally;
}

/** 제안 한 줄에서 검색할 이름 — 첫 구분자(쉼표·대시·가운뎃점) 앞. "카페 바당, 애월읍 — 테라스…" → "카페 바당". 순수. */
export function suggestionSearchName(note: string | null): string {
  const text = (note ?? '').trim();
  const head = text.split(/[,—·]|\s-\s/)[0].trim();
  return head || text;
}

/**
 * 제안의 이름으로 블로그를 찾게 한다 — 검수 대기의 `추가 수집` 과 **같은 표**(`collect_requests`)에 후보 없이(`candidate_id` 는 비어도 된다) 한 줄.
 * 예전 안내("그 이름으로 수집해요 — pnpm data collect")는 실행 수단이 없는 말이었다: 수집 스크립트는 이름을 인자로 받지 않는다(14 W261010.13).
 * 찾고 읽는 쪽은 추가 수집과 같다 — 워커가 그 검색어로 글을 담고 다음 분석이 맨 앞에서 읽어, 동반 근거가 있으면 검수 대기에 후보로 선다.
 * 같은 이름이 이미 대기 중이면(유일 인덱스 23505) 실패가 아니다.
 */
export async function requestSuggestionCollect(client: SupabaseClient, name: string): Promise<'queued' | 'alreadyQueued'> {
  const { error } = await client
    .from('collect_requests')
    .insert({ query: collectRequestQuery(name), name, name_key: collectRequestKey(name) });
  if (error?.code === '23505') return 'alreadyQueued';
  if (error) throw new Error(isBlocksUnavailable(error) ? COLLECT_REQUESTS_UNAVAILABLE_TEXT : `수집 요청: ${error.message}`);
  return 'queued';
}

/**
 * 장소 id → 열린 `policy`(조건이 달라요) 제보 수(11 T3.2). 검수 대기의 갱신 묶음이 "사용자도 같은 가게가 달라졌다고 했다" 를 보여 주는 자리.
 * 제보를 제안의 입력에 넣지는 않는다 — 한 줄 메모라 인용 검증(`quoteInBody`)을 못 지난다. 서로 **보이게만** 한다. 순수.
 */
export function policyReportCounts(byPlace: Readonly<Record<string, readonly TReportRow[]>>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [placeId, rows] of Object.entries(byPlace)) {
    const n = rows.filter((row) => row.kind === 'policy').length;
    if (n) out[placeId] = n;
  }
  return out;
}
