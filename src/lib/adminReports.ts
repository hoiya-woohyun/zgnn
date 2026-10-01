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

/** 머리글의 "열린 제보 N · 오늘 M" — 순수. 오늘은 `now` 의 현지 날짜 기준. */
export function reportHeadline(rows: readonly TReportRow[], now: Date): { open: number; today: number } {
  const day = (iso: string) => new Date(iso).toLocaleDateString('sv-SE');
  const today = now.toLocaleDateString('sv-SE');
  let open = 0;
  let todayCount = 0;
  for (const row of rows) {
    if (needsHandling(row)) open += 1;
    if (day(row.created_at) === today) todayCount += 1;
  }
  return { open, today: todayCount };
}

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
