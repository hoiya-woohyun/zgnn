/**
 * 블랙리스트(`place_blocks`, ADR-020 D1·D2) — 제외한 가게 이름을 분석이 다시 후보로 만들지 않게 하는 차단 행.
 *
 * 만료는 스케줄러가 아니라 비교다 — `until` 은 시각이고 null 이면 영구, 분석이 읽는 순간 `blockFor`(scripts/analyze/analyzeCandidates.mjs)가
 * 지난 것을 걸러 낸다. 일찍 푸는 것은 `lifted_at` 이고 DELETE 는 없다(소프트 삭제 경계, ADR-018).
 *
 * **표가 아직 원격에 없을 수 있다**(마이그레이션은 사용자가 나중에 `db push`). 그때 PostgREST 는 404(`PGRST205`)를 준다 —
 * 호출부가 그것을 "0건" 이나 크래시가 아니라 `미적용` 으로 말하도록 `isBlocksUnavailable` 이 가른다.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { extractAddressUnits } from '../../scripts/analyze/naverLocal.mjs';
import { normalizeName, townOf } from '../../scripts/analyze/matchPlace.mjs';
import { rejectGroup } from './adminApply';
import type { TCandidateGroup, TPlaceRow } from './adminCandidates';
import { archivePlace, restorePlace, type TArchiveReason } from './adminPlaces';
import { appendReviewerNote } from './adminSession';

export const BLOCK_CHOICES = ['none', 'months3', 'forever'] as const;

export type TBlockChoice = (typeof BLOCK_CHOICES)[number];

export const BLOCK_CHOICE_LABEL: Record<TBlockChoice, string> = {
  none: '없음',
  months3: '3개월',
  forever: '영구',
};

/** 사유 → 기본 선택(ADR-020 「사유별 블랙리스트 기본값」). 반려 사유와 등록 해제 사유를 둘 다 받는다 — 표에 없는 말은 `none`. */
const DEFAULT_BLOCK: Record<string, TBlockChoice> = {
  '동반 불가': 'months3',
  폐업: 'forever',
  '제주 아님': 'forever',
  '동반 불가로 바뀜': 'months3',
  '업장 요청': 'forever',
};

export function defaultBlockFor(reason: string | null | undefined): TBlockChoice {
  return (reason && DEFAULT_BLOCK[reason]) || 'none';
}

/** 차단이 풀리는 시각(ISO) — `months3` 은 지금부터 3개월, `forever` 는 null(영구). */
export function blockUntil(choice: Exclude<TBlockChoice, 'none'>, now: Date): string | null {
  if (choice === 'forever') return null;
  const until = new Date(now.getTime());
  until.setMonth(until.getMonth() + 3);
  return until.toISOString();
}

/** `place_blocks` 에 넣는 행. `id`·`created_at` 은 DB 가 채운다. */
export type TBlockInsert = {
  name_key: string;
  town: string | null;
  display_name: string;
  reason: string;
  note: string | null;
  until: string | null;
  candidate_id: string | null;
  place_id: string | null;
};

/**
 * 후보 묶음 → 차단 행. 읍·면은 **분석이 후보에서 읽는 것과 같은 규칙**(주소 토큰 → 없으면 `regionRaw`)으로 뽑는다 —
 * 다르게 뽑으면 걸어 둔 차단이 같은 가게의 다음 후보에 안 걸린다(`blockFor`). 선택이 `none` 이면 null.
 */
export function blockRowFor(
  group: TCandidateGroup,
  choice: TBlockChoice,
  reason: string,
  note: string | undefined,
  now: Date,
): TBlockInsert | null {
  if (choice === 'none') return null;
  const extracted = group.lead.extracted;
  return {
    name_key: extracted.nameKey ?? normalizeName(extracted.name),
    town: extractAddressUnits(extracted.address).eupMyeon ?? townOf(extracted.regionRaw) ?? null,
    display_name: extracted.name,
    reason,
    note: note?.trim() || null,
    until: blockUntil(choice, now),
    candidate_id: group.lead.id,
    place_id: null,
  };
}

/**
 * 묶음의 차단 행 **전부** — 대표의 행(`blockRowFor`)에 더해, 대표와 **이름 키가 다른** 행마다 한 줄씩(키가 같은 것끼리는 하나).
 * 같은 자리의 신규 묶음(`mergeSameSpotGroups` — "본카페" ↔ "애월본카페")은 키가 둘인 채 한 줄로 서는데, 대표 키만 막으면
 * 다른 키의 글이 다음 분석에 그대로 올라온다. 읍·면은 그 행의 것(규칙은 `blockRowFor` 와 같다).
 */
export function blockRowsFor(
  group: TCandidateGroup,
  choice: TBlockChoice,
  reason: string,
  note: string | undefined,
  now: Date,
): TBlockInsert[] {
  const lead = blockRowFor(group, choice, reason, note, now);
  if (!lead) return [];
  const out = [lead];
  const keys = new Set([lead.name_key]);
  for (const row of group.rows) {
    const key = row.extracted.nameKey ?? normalizeName(row.extracted.name);
    if (!key || keys.has(key)) continue;
    keys.add(key);
    out.push({
      ...lead,
      name_key: key,
      town: extractAddressUnits(row.extracted.address).eupMyeon ?? townOf(row.extracted.regionRaw) ?? null,
      display_name: row.extracted.name,
      candidate_id: row.id,
    });
  }
  return out;
}

/**
 * 등록 해제한 **장소** → 차단 행(09 T1.4). 읍·면 규칙은 `blockRowFor` 와 같다(주소 토큰 → 없으면 `region_raw`) —
 * 분석의 `blockFor` 가 후보에서 읽는 것과 같아야 걸린다. `place_id` 를 채우는 것은 되살릴 때 풀 행을 찾는 열쇠라서다.
 */
export function placeBlockRowFor(
  place: Pick<TPlaceRow, 'id' | 'name' | 'address' | 'region_raw'>,
  choice: TBlockChoice,
  reason: string,
  note: string | undefined,
  now: Date,
): TBlockInsert | null {
  if (choice === 'none') return null;
  return {
    name_key: normalizeName(place.name),
    town: extractAddressUnits(place.address).eupMyeon ?? townOf(place.region_raw) ?? null,
    display_name: place.name,
    reason,
    note: note?.trim() || null,
    until: blockUntil(choice, now),
    candidate_id: null,
    place_id: place.id,
  };
}

/** `reviewer_note` 에 덧붙이는 줄 — 반려 집계 칩(`[admin] <사유>`)과 다른 문자열이어야 한다. */
export function blockNoteLine(choice: Exclude<TBlockChoice, 'none'>): string {
  return `[admin] 블랙리스트 ${BLOCK_CHOICE_LABEL[choice]}`;
}

/** 표가 원격에 없을 때의 오류인가(PostgREST `PGRST205` · Postgres `42P01` · 메시지). 이때는 "미적용" 으로 말한다. */
export function isBlocksUnavailable(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return (
    error.code === 'PGRST205' ||
    error.code === '42P01' ||
    /could not find the table|relation .* does not exist|schema cache/i.test(error.message ?? '')
  );
}

export const BLOCKS_UNAVAILABLE_TEXT = '블랙리스트 표가 아직 적용되지 않았어요';

export async function insertBlock(client: SupabaseClient, row: TBlockInsert): Promise<void> {
  const { error } = await client.from('place_blocks').insert(row);
  if (!error) return;
  throw new Error(isBlocksUnavailable(error) ? BLOCKS_UNAVAILABLE_TEXT : error.message);
}

export type TRejectBlockOutcome = {
  /** 블랙리스트에 실제로 들어간 선택(`none` 이면 안 넣은 것). 실패하면 `none` 이다. */
  blocked: TBlockChoice;
  /** 반려는 됐는데 블랙리스트 쓰기가 실패했다 — 그 이유. */
  blockError?: string;
};

/**
 * 묶음을 제외한다 — 반려 먼저, 블랙리스트 나중. 차단만 들어가고 반려가 안 되면 화면엔 남는데 분석엔 안 올라오는 상태가 되고,
 * 반대(반려만 되고 차단이 실패)는 다시 눌러도 이어지는 쪽이라 이 순서다. 반려가 던지면 그대로 던진다(차단은 시도하지 않는다).
 * 차단이 실패하면 던지지 않고 `blockError` 로 돌려준다 — 반려는 이미 됐으니 호출부가 그 사실과 함께 말해야 한다.
 */
export async function rejectAndBlock(
  client: SupabaseClient,
  group: TCandidateGroup,
  reason: string,
  note: string | undefined,
  choice: TBlockChoice,
  now: Date = new Date(),
): Promise<TRejectBlockOutcome> {
  const rejectLine = await rejectGroup(client, group, reason, note);
  const rows = blockRowsFor(group, choice, reason, note, now);
  if (!rows.length || choice === 'none') return { blocked: 'none' };
  try {
    for (const row of rows) await insertBlock(client, row);
  } catch (error) {
    return { blocked: 'none', blockError: error instanceof Error ? error.message : String(error) };
  }
  // 기록 한 줄은 부가다 — 차단은 이미 들어갔으니 이 쓰기가 실패해도 결과를 뒤집지 않는다.
  for (const candidate of group.rows) {
    await client
      .from('candidates')
      .update({ reviewer_note: appendReviewerNote(appendReviewerNote(candidate.reviewer_note, rejectLine), blockNoteLine(choice)) })
      .eq('id', candidate.id);
  }
  return { blocked: choice };
}

/** 한 줄 결과 문장. 차단 실패는 "반려는 됐다" 와 "블랙리스트는 안 들어갔다" 를 함께 말한다. */
export function rejectOutcomeText(reason: string, outcome: TRejectBlockOutcome): string {
  if (outcome.blockError) return `제외했어요 · ${reason} — 블랙리스트에는 안 들어갔어요(${outcome.blockError})`;
  if (outcome.blocked !== 'none') return `제외했어요 · ${reason} · 블랙리스트 ${BLOCK_CHOICE_LABEL[outcome.blocked]}`;
  return `제외했어요 · ${reason}`;
}

export type TBlockCounts = {
  /** 아직 막고 있는 행(풀지 않았고 기간이 안 지났다). */
  active: number;
  /** 풀지는 않았는데 기간이 지난 행 — 더는 걸리지 않는다(화면의 `지남`). */
  expired: number;
};

/** 풀지 않은 행들에서 막고 있는 것과 지난 것을 센다 — 순수. 비교는 분석의 `blockFor` 와 같다(`until` 이 null 이면 영구). */
export function countBlockRows(rows: readonly { until: string | null }[], now: Date): TBlockCounts {
  const counts: TBlockCounts = { active: 0, expired: 0 };
  for (const row of rows) {
    if (!row.until || new Date(row.until).getTime() > now.getTime()) counts.active += 1;
    else counts.expired += 1;
  }
  return counts;
}

/** 블랙리스트 탭 라벨의 바탕. `unavailable` 은 표가 원격에 없는 것이라 "0건" 과 다르게 말한다. */
export type TBlocksSummary =
  | ({ kind: 'ok' } & TBlockCounts)
  | { kind: 'unavailable' }
  | { kind: 'error'; message: string };

/** `place_blocks` 의 한 행(풀지 않은 것만 읽는다). 블랙리스트 칸의 한 줄이 이것이다. */
export type TBlockRow = {
  id: string;
  name_key: string;
  town: string | null;
  display_name: string;
  reason: string;
  note: string | null;
  until: string | null;
  lifted_at: string | null;
  candidate_id: string | null;
  place_id: string | null;
  created_at: string;
};

/** 블랙리스트 읽기 결과. `unavailable` 은 표가 원격에 없는 것이라 "0건" 과 다르게 말한다. */
export type TBlocksLoad = { kind: 'ok'; rows: TBlockRow[] } | { kind: 'unavailable' } | { kind: 'error'; message: string };

/**
 * 풀지 않은 행 **전부**(09 T1.5) — 만료가 지난 것도 담는다. 분석은 지난 행을 이미 안 보지만(`blockFor`), 화면에서까지 빼면
 * "막아 둔 가게가 왜 다시 후보로 올라왔나" 를 읽을 자리가 없다 — 그 줄이 `지남` 으로 서 있어야 답이 된다.
 * 탭 건수(`blocksSummaryOf`)와 등록 해제 칸의 칩(`placeBlocksOf`)도 이 한 번 읽은 것에서 파생한다 — 따로 읽으면
 * 풀기 한 번에 세 값이 서로 다른 틱에 움직인다.
 */
export async function fetchBlocks(client: SupabaseClient): Promise<TBlocksLoad> {
  const { data, error } = await client
    .from('place_blocks')
    .select('id, name_key, town, display_name, reason, note, until, lifted_at, candidate_id, place_id, created_at')
    .is('lifted_at', null)
    .order('created_at', { ascending: false });
  if (error) return isBlocksUnavailable(error) ? { kind: 'unavailable' } : { kind: 'error', message: error.message };
  return { kind: 'ok', rows: (data ?? []) as TBlockRow[] };
}

/** 읽기 결과 → 탭 라벨의 바탕 — 순수. 아직 못 읽었으면 undefined. */
export function blocksSummaryOf(load: TBlocksLoad | undefined, now: Date): TBlocksSummary | undefined {
  if (!load) return undefined;
  if (load.kind !== 'ok') return load;
  return { kind: 'ok', ...countBlockRows(load.rows, now) };
}

/**
 * 읽기 결과 → 장소 id 별 열린 차단 하나(등록 해제 칸의 칩) — 순수. 표가 없거나 못 읽었으면 undefined
 * (그 칸은 undefined 를 보고 칩과 `블랙리스트` 버튼을 숨긴다).
 */
export function placeBlocksOf(load: TBlocksLoad | undefined): Record<string, TPlaceBlock> | undefined {
  if (load?.kind !== 'ok') return undefined;
  const rows: TPlaceBlock[] = [];
  for (const row of load.rows) if (row.place_id) rows.push({ id: row.id, place_id: row.place_id, until: row.until });
  return latestBlockByPlace(rows);
}

/** 장소에 걸린 **열린** 차단 하나(풀지 않은 것). 등록 해제 칸의 줄 칩이 이것을 그린다. */
export type TPlaceBlock = { id: string; place_id: string; until: string | null };

/** 순수 — 장소마다 가장 늦게 풀리는 차단 하나(영구 = 무한대). */
export function latestBlockByPlace(rows: readonly TPlaceBlock[]): Record<string, TPlaceBlock> {
  const rank = (row: TPlaceBlock) => (row.until ? new Date(row.until).getTime() : Number.POSITIVE_INFINITY);
  const byPlace: Record<string, TPlaceBlock> = {};
  for (const row of rows) {
    const prev = byPlace[row.place_id];
    if (!prev || rank(row) > rank(prev)) byPlace[row.place_id] = row;
  }
  return byPlace;
}

/** 칩 문구 — 순수. `영구` · `~2027-01-01` · `지남`. */
export function blockChipText(block: Pick<TPlaceBlock, 'until'>, now: Date): string {
  if (!block.until) return '영구';
  if (new Date(block.until).getTime() <= now.getTime()) return '지남';
  return `~${block.until.slice(0, 10)}`;
}

/** 블랙리스트 칸 한 줄의 표기 — 순수. `origin` 은 그 행을 어디서 걸었나(후보 제외 · 장소 등록 해제). */
export type TBlockRowView = {
  /** `영구` · `~2027-01-01` · `지남` — 등록 해제 칸의 칩과 같은 말(`blockChipText`). */
  remaining: string;
  /** 기간이 지나 더는 걸리지 않는다(분석의 `blockFor` 와 같은 비교). 화면은 회색으로 낮춘다. */
  expired: boolean;
  origin: 'candidate' | 'place' | 'none';
};

export function blockRowView(row: Pick<TBlockRow, 'until' | 'candidate_id' | 'place_id'>, now: Date): TBlockRowView {
  const remaining = blockChipText(row, now);
  return {
    remaining,
    expired: remaining === '지남',
    origin: row.place_id ? 'place' : row.candidate_id ? 'candidate' : 'none',
  };
}

/**
 * 한 행을 일찍 푼다(`lifted_at`). DELETE 가 아닌 이유는 머리 주석 — 풀어도 행은 남아 "언제 왜 막았다 풀었나" 가 읽힌다.
 * 이미 풀린 행은 건드리지 않는다(두 번 눌러도 처음 푼 시각이 남는다). 표가 없으면 `BLOCKS_UNAVAILABLE_TEXT` 로 던진다.
 */
export async function liftBlock(client: SupabaseClient, id: string, now: Date = new Date()): Promise<void> {
  const { error } = await client.from('place_blocks').update({ lifted_at: now.toISOString() }).eq('id', id).is('lifted_at', null);
  if (error) throw new Error(isBlocksUnavailable(error) ? BLOCKS_UNAVAILABLE_TEXT : error.message);
}

/**
 * 기간을 바꾼다 — `until` 한 칸. 3개월은 **지금부터** 3개월이다(처음 건 날부터가 아니라): 지난 행을 다시 막는 손잡이이기도 해서,
 * 건 날부터 세면 이미 지난 날짜가 되어 눌러도 아무 일이 없다. 바뀐 `until` 을 돌려준다(화면이 다시 읽지 않고 그 줄만 고친다).
 */
export async function extendBlock(
  client: SupabaseClient,
  id: string,
  choice: Exclude<TBlockChoice, 'none'>,
  now: Date = new Date(),
): Promise<string | null> {
  const until = blockUntil(choice, now);
  const { error } = await client.from('place_blocks').update({ until }).eq('id', id).is('lifted_at', null);
  if (error) throw new Error(isBlocksUnavailable(error) ? BLOCKS_UNAVAILABLE_TEXT : error.message);
  return until;
}

/**
 * 그 장소에서 건 열린 차단을 모두 푼다(`lifted_at`). 되살렸는데 블랙리스트가 남으면 그 가게의 새 글이 **조용히** 안 올라온다.
 * 표가 없으면 풀 것도 없다 — 던지지 않는다.
 */
export async function liftPlaceBlocks(client: SupabaseClient, placeId: string, now: Date = new Date()): Promise<void> {
  const { error } = await client
    .from('place_blocks')
    .update({ lifted_at: now.toISOString() })
    .eq('place_id', placeId)
    .is('lifted_at', null);
  if (error && !isBlocksUnavailable(error)) throw new Error(error.message);
}

export type TPlaceArchiveOutcome = { place: TPlaceRow; blocked: TBlockChoice; blockError?: string };

/**
 * 장소를 등록 해제하고 블랙리스트에 건다 — **해제 먼저, 차단 나중**(`rejectAndBlock` 과 같은 순서·같은 이유).
 * 해제가 던지면 그대로 던지고, 차단만 실패하면 `blockError` 로 돌려준다(해제는 이미 됐다).
 */
export async function archiveAndBlock(
  client: SupabaseClient,
  place: TPlaceRow,
  reason: TArchiveReason,
  note: string | undefined,
  choice: TBlockChoice,
  now: Date = new Date(),
): Promise<TPlaceArchiveOutcome> {
  const updated = await archivePlace(client, place, { nowIso: now.toISOString(), reason, note });
  const row = placeBlockRowFor(place, choice, reason, note, now);
  if (!row) return { place: updated, blocked: 'none' };
  try {
    await insertBlock(client, row);
  } catch (error) {
    return { place: updated, blocked: 'none', blockError: error instanceof Error ? error.message : String(error) };
  }
  return { place: updated, blocked: choice };
}

/**
 * 등록 해제 칸에서 블랙리스트를 넣거나 바꾼다 — 열린 것을 먼저 풀고 새로 건다(한 장소에 열린 행이 둘이면 칩이 어느 쪽을 말하는지 모호하다).
 * `none` 이면 풀기만 한다.
 */
export async function setPlaceBlock(
  client: SupabaseClient,
  place: TPlaceRow,
  choice: TBlockChoice,
  reason: string,
  now: Date = new Date(),
): Promise<void> {
  await liftPlaceBlocks(client, place.id, now);
  const row = placeBlockRowFor(place, choice, reason, undefined, now);
  if (row) await insertBlock(client, row);
}

/** 되살린다 — 되살림 먼저, 그다음 그 장소의 열린 차단을 푼다. 풀기 실패는 `liftError` 로(되살림은 이미 됐다). */
export async function restoreAndLift(
  client: SupabaseClient,
  place: TPlaceRow,
  now: Date = new Date(),
): Promise<{ place: TPlaceRow; liftError?: string }> {
  const updated = await restorePlace(client, place, { nowIso: now.toISOString() });
  try {
    await liftPlaceBlocks(client, place.id, now);
  } catch (error) {
    return { place: updated, liftError: error instanceof Error ? error.message : String(error) };
  }
  return { place: updated };
}

/** 해제 결과 한 줄. */
export function archiveOutcomeText(wasDraft: boolean, outcome: Pick<TPlaceArchiveOutcome, 'blocked' | 'blockError'>): string {
  const base = wasDraft ? '내렸어요 · 사이트에는 원래 없던 곳이에요' : '내렸어요 · 다음 빌드부터 사이트에서 사라져요';
  if (outcome.blockError) return `${base} — 블랙리스트에는 안 들어갔어요(${outcome.blockError})`;
  if (outcome.blocked !== 'none') return `${base} · 블랙리스트 ${BLOCK_CHOICE_LABEL[outcome.blocked]}`;
  return base;
}
