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
import type { TCandidateGroup } from './adminCandidates';
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
  const row = blockRowFor(group, choice, reason, note, now);
  if (!row || choice === 'none') return { blocked: 'none' };
  try {
    await insertBlock(client, row);
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
