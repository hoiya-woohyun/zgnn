/**
 * 승인·반려를 DB 에 쓰는 순서 — `scripts/apply-approved.mjs` 와 **같은 규칙·같은 필드**다(ADR-018).
 *
 * 왜 같아야 하나: 두 도구가 같은 테이블에 쓴다. 중간에 실패하면 후보가 `approved` 로 남고 터미널의
 * `pnpm data:apply` 가 그대로 이어받는데, 규칙이 다르면 이어받은 쪽이 다른 값을 쓴다 — `places` 가 조용히 오염된다.
 * 그래서 병합 규칙(빈 칸만 채움)·재대조·place_sources 는 전부 그 스크립트가 쓰는 순수 함수를 그대로 부른다.
 *
 * PostgREST 에는 **트랜잭션이 없다.** 그래서 순서가 곧 안전장치다 —
 *  (1) 쓰기 전에 순수 검사와 대상 판정을 끝낸다(막힌 후보는 DB 를 건드리지 않는다),
 *  (2) 신규 insert 직후 후보에 `match_place_id` 를 먼저 적는다(뒤에서 죽어도 재시도가 장소를 두 개 만들지 않게),
 *  (3) 어느 단계든 실패하면 **어느 단계인지 붙여서** 던진다. 화면이 그것을 그대로 보여 준다 —
 *      삼키면 사람이 두 번 누르고 장소가 두 개 생긴다.
 *
 * CLI 와 다른 점은 셋이다. 신규 장소가 곧바로 `published`(draft 단계 생략, 요구 "맞다 → 다른 사용자에게 보인다"),
 * `reviewer_note` 태그가 `[data:apply]` 대신 `[admin]`, 그리고 **짝이 내린 곳일 때 사람에게 묻는다**
 * (CLI 는 그 후보를 pending 으로 되돌리고 사유만 적는다 — 터미널에는 물어볼 자리가 없다).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { mergeIntoExisting, toNewPlaceRow, toRecheckCandidate } from '../../scripts/analyze/applyApproved.mjs';
import { matchPlace, THRESHOLD } from '../../scripts/analyze/matchPlace.mjs';
import { toMatchablePlace } from '../../scripts/lib/placeFields.mjs';
import {
  regionUsable,
  type TCandidateGroup,
  type TCandidateRow,
  type TPlaceRow,
  type TPlaceStatus,
} from './adminCandidates';
import { restorePlace } from './adminPlaces';
import { appendReviewerNote } from './adminSession';
import type { TPlace } from '../types';

/**
 * 0.4~0.85 구간에서 "이 곳 아닌가요?" 로 보여 줄 기존 장소.
 *
 * 상태 셋은 **선택**이고 `approveGroup` 이 경계에서 채운다(`decideTarget` 은 status 없는 `TPlace[]` 만 본다).
 * 없으면 화면이 "내림" 을 못 보여 주고, 그러면 그 패널의 두 버튼이 둘 다 틀린다 — '여기에 합치기' 는 내린 곳에
 * 합치려 하고 '새 장소로' 는 복제본을 만든다. 보여 주려고만 있는 칸이 아니라 **선택을 가르는** 칸이다.
 */
export type TSimilarPlace = {
  id: string;
  name: string;
  confidence: number;
  reason: string;
  status?: TPlaceStatus;
  archivedAt?: string | null;
  archiveNote?: string | null;
};

export type TApplyOutcome =
  | { kind: 'created' | 'merged'; placeId: string; placeName: string; patchKeys: string[]; rows: number }
  /** 사람이 골라야 한다 — 이 결과가 나오면 **DB 에 아무것도 쓰지 않았다.** */
  | { kind: 'needsDecision'; similar: TSimilarPlace }
  /**
   * 짝지은 장소가 **내린 곳**이다. 역시 쓰기 전이고, 사람이 둘 중 하나를 골라야 한다 —
   * 되살려서 합치거나(다시 열었다) 반려하거나(폐업 그대로). 이 갈래를 `blocked` 문구로 뭉개지 않는 이유는
   * 나갈 길이 다르기 때문이다: `blocked` 는 "고칠 것이 있다" 지만 이것은 "고를 것이 있다" 다.
   */
  | { kind: 'archivedTarget'; placeId: string; placeName: string; archivedAt: string | null; note: string | null }
  /** 반영 자체가 불가능하다(종류·이름·지역·대상). 역시 쓰기 전이다. */
  | { kind: 'blocked'; reason: string };

export type TApplyOptions = {
  /** 사람이 '새 장소로' 를 골랐다 — 짝(match_place_id)을 무시하고 재대조도 하지 않는다. */
  asNew?: boolean;
  /** 사람이 '여기에 합치기' 를 골랐다. `null`·`undefined` 는 "고르지 않았다" 로 같다. */
  mergeInto?: string | null;
  /** 사람이 '되살려서 합치기' 를 골랐다 — 내린 곳을 `published` 로 돌리고 그 위에 합친다. */
  restoreArchived?: boolean;
  /**
   * 사람이 "내린 그 곳과는 **다른 가게**다" 를 명시적으로 확인했다 — `asNew` 의 복제본 경고를 넘긴다.
   * 기본값이 `false` 인 것이 요점이다: 확인 없이 `asNew` 로 내린 곳을 지나가면 그 가게가 새 id 로 되살아난다.
   */
  confirmedDifferent?: boolean;
  nowIso: string;
  /** 새 장소 id. `places.id` 는 default 가 없어 우리가 정한다(보통 `crypto.randomUUID`). */
  newId: () => string;
};

export type TTargetDecision =
  | { kind: 'target'; targetId: string | null }
  | { kind: 'needsDecision'; similar: TSimilarPlace };

const PLACE_TYPES = new Set(['stay', 'restaurant', 'cafe']);

/**
 * 이 후보를 장소로 올릴 수 있는가 — 순수. 막는 이유를 사람 말로 돌려준다(없으면 null).
 *
 * 승인 시점에 보는 세 칸은 `toNewPlaceRow` 가 반영을 막는 바로 그 칸들이다(applyApproved.mjs:99-112).
 * 지역이 비어 있으면 **새 장소**는 읍·면 칩이 비고 상세 헤더가 '기타' 가 된다 — 그래서 신규에는 없어서는 안 된다.
 * **병합이어도 같은 세 칸을 본다**(브리프 결정 2 의 완성도 게이트). 대상에 이미 지역이 있으면 `mergeIntoExisting` 이
 * 그 칸을 덮지 않아 고른 값은 후보에만 남지만, 게이트를 갈래별로 다르게 두지 않는 쪽을 골랐다 —
 * "올려도 되는 후보인가" 의 기준이 짝의 유무에 따라 달라지면 사람이 같은 카드를 두 번 다르게 판단한다.
 */
export function leadProblem(lead: TCandidateRow): string | null {
  const extracted = lead.extracted;
  const type = extracted?.type;
  if (type === 'other') return "종류가 '기타' 라 장소로 올릴 수 없어요 — 숙소·식당·카페만 올려요.";
  if (!type || !PLACE_TYPES.has(type)) return `종류 '${String(type)}' 는 장소가 될 수 없어요 — 숙소·식당·카페만 올려요.`;
  if (!extracted.name || extracted.name.trim() === '') return '이름이 비어 있어요.';
  if (!regionUsable(extracted.regionRaw)) {
    return '지역을 골라 주세요 — "동쪽 (구좌읍)" 형식이 있어야 읍·면 칩과 방향 필터에 들어가요.';
  }
  return null;
}

/**
 * 어느 장소에 반영할지 — 순수. `null` 이면 새로 만든다.
 *
 * 분석 때 '신규' 였던 후보만 다시 대조한다. 같은 새 가게를 말하는 글 둘이 따로 승인되면 분석 시점엔 서로를 모르므로
 * 둘 다 '신규' 인데, 여기서 두 번째가 첫 번째로 합쳐진다(apply-approved.mjs:11-12).
 * tier 가 auto/ask 인데 짝이 비어 있으면 **사람이 비운 것**이라 재대조로 되살리지 않는다(같은 파일 :13).
 */
export function decideTarget(lead: TCandidateRow, existing: TPlace[], opts: TApplyOptions): TTargetDecision {
  const chosen = opts.mergeInto ?? (opts.asNew ? null : lead.match_place_id);
  if (chosen) return { kind: 'target', targetId: chosen };
  if (opts.asNew) return { kind: 'target', targetId: null };
  if ((lead.extracted?.match?.tier ?? 'new') !== 'new') return { kind: 'target', targetId: null };

  const rechecked = matchPlace(toRecheckCandidate(lead), existing);
  // matchPlace 의 JSDoc 은 match 를 object 로만 말한다 — 경계에서 한 번 좁힌다.
  const match = rechecked.match as { id: string; name: string } | null;
  if (!match) return { kind: 'target', targetId: null };
  if (rechecked.confidence >= THRESHOLD.AUTO_MERGE) return { kind: 'target', targetId: match.id };
  if (rechecked.confidence >= THRESHOLD.ASK) {
    // 이 구간은 코드가 정하지 않는다 — 신규로 넣으면 이웃 가게의 중복이고, 합치면 오병합이다(apply-approved.mjs:89).
    // CLI 는 pending 으로 되돌리지만 화면은 그 자리에서 사람에게 묻는다.
    return {
      kind: 'needsDecision',
      similar: { id: match.id, name: match.name, confidence: rechecked.confidence, reason: rechecked.reason },
    };
  }
  return { kind: 'target', targetId: null };
}

const failIf = (step: string, error: { message: string } | null) => {
  if (error) throw new Error(`${step}: ${error.message}`);
};

/** 후보를 approved 로. `reviewed_at` 은 적지 않는다 — 트리거가 찍는다(20260928150000:14-31). */
async function markApproved(client: SupabaseClient, row: TCandidateRow): Promise<void> {
  const { error } = await client
    .from('candidates')
    .update({ status: 'approved', reviewer_note: appendReviewerNote(row.reviewer_note, '[admin] 승인') })
    .eq('id', row.id);
  failIf('후보 승인 표시', error);
}

/**
 * 기존 장소의 **빈 칸만** 채운다. 사람이 쓴 칸은 AI 가 덮지 않는다는 원칙이 `mergeIntoExisting` 안에 있다.
 * 채운 컬럼 이름을 돌려준다(화면이 "무엇을 채웠는지" 를 말하고, `extracted.applied` 에 남는다).
 */
async function fillBlanks(client: SupabaseClient, target: TPlaceRow, row: TCandidateRow): Promise<string[]> {
  let patch = mergeIntoExisting(target, row.extracted, { postUrl: row.post_url }) as Partial<TPlaceRow> | null;
  // CLI 가 만들어 둔 draft 는 "사람이 올려 주기를 기다리는" 행이다. 운영자가 여기서 통과시켰으니 같은 update 로 올린다.
  if (target.status === 'draft') patch = { ...(patch ?? {}), status: 'published' };
  if (!patch) return [];

  const { error } = await client.from('places').update(patch).eq('id', target.id);
  failIf('장소 보강', error);
  // 호출자가 들고 있는 행도 함께 갱신한다 — 같은 묶음의 다음 후보가 방금 채운 칸을 빈 칸으로 보면 두 번 쓰고,
  // 채운 좌표를 다음 재대조가 못 보면 9km 밖 동명 가게와 합쳐진다(apply-approved.mjs:120-123 과 같은 이유).
  Object.assign(target, patch);
  return Object.keys(patch);
}

/** place_sources 는 (place_id, post_url) 복합 PK 라 둘 다 있어야 한다 — 글 링크 없는 후보는 출처를 못 남긴다. */
async function linkSource(client: SupabaseClient, placeId: string, postUrl: string | null): Promise<void> {
  if (!postUrl) return;
  const { error } = await client
    .from('place_sources')
    .upsert({ place_id: placeId, post_url: postUrl }, { onConflict: 'place_id,post_url', ignoreDuplicates: true });
  failIf('출처 기록', error);
}

/**
 * 후보를 merged 로 + 어느 장소의 어느 칸을 채웠는지. 되돌릴 때 그 칸을 비우면 된다(빈 칸만 채웠으므로).
 *
 * 예외가 하나다 — **`status`**. draft 대상을 올린 승인은 그 키도 `patchKeys` 에 들어가는데(위 `fillBlanks`),
 * 그것은 빈 칸을 채운 게 아니라 상태를 바꾼 것이고 컬럼은 NOT NULL + check 다(`20260920124849_zgnn_schema.sql`).
 * 되돌릴 때 이 키만은 비우지 말고 `'draft'` 로 되돌린다.
 */
async function markMerged(
  client: SupabaseClient,
  row: TCandidateRow,
  applied: { placeId: string; kind: 'created' | 'merged'; patchKeys: string[]; at: string },
): Promise<void> {
  const { error } = await client
    .from('candidates')
    .update({ status: 'merged', extracted: { ...row.extracted, applied } })
    .eq('id', row.id);
  failIf('반영 완료 표시', error);
}

/** 내린 곳 하나를 "사람이 골라야 한다" 결과로. 두 자리에서 같은 모양을 만들므로 한 곳에 둔다. */
const archivedOutcome = (row: TPlaceRow): TApplyOutcome => ({
  kind: 'archivedTarget',
  placeId: row.id,
  placeName: row.name,
  archivedAt: row.archived_at,
  note: row.archive_note,
});

/**
 * 묶음 하나를 승인해 `places` 까지 반영한다. 대표(lead)를 먼저 처리해 장소를 정하고, 나머지 행은 그 장소로 보강한다.
 *
 * `places` 는 **읽고 고친다**(호출자의 캐시) — 새 장소를 push 하고, 채운 칸을 그 행에 반영한다.
 * 다음 묶음의 재대조가 방금 만든 장소를 봐야 같은 가게가 두 번 생기지 않는다(apply-approved.mjs:133).
 */
export async function approveGroup(
  client: SupabaseClient,
  group: TCandidateGroup,
  places: TPlaceRow[],
  opts: TApplyOptions,
): Promise<TApplyOutcome> {
  const lead = group.lead;

  // ── 쓰기 전: 순수 검사 ────────────────────────────────────────────────────
  const problem = leadProblem(lead);
  if (problem) return { kind: 'blocked', reason: problem };

  /*
   * 대조 corpus. `toMatchablePlace` 로 만드는 이유는 `status` 한 칸을 얹어야 하기 때문이다 —
   * 점수가 같을 때 내린 곳보다 살아 있는 곳을 고르는 규칙이 그 칸을 본다(`matchPlace.mjs` 의 `preferLive`).
   * `fromPlaceRow` 로 만들면 그 규칙이 조용히 꺼지고, 이름을 바꿔 다시 낸 가게가 옛 이름 쪽에 붙는다.
   */
  const existing = places.map(toMatchablePlace) as TPlace[];

  /*
   * `asNew` 는 짝을 **버리는** 선택이다. 버리는 그 짝이 내린 곳이면 여기서 멈춘다 — 그대로 통과시키면
   * `decideTarget` 이 `targetId: null` 을 주고 아래의 archived 가지를 아예 지나쳐 **새 장소가 published 로 생긴다.**
   * 즉 내린 가게가 새 id 로 사이트에 돌아온다(소프트 삭제가 무효가 되는 유일한 남은 경로였다).
   *
   * 그래도 `asNew` 자체를 막지는 않는다 — 같은 이름의 **다른** 가게는 실제로 있다. 대신 사람이 그 사실을
   * 확인했다는 표식(`confirmedDifferent`)을 요구한다. 확인은 화면의 '정말 다른 가게예요' 가 준다.
   *
   * 버려지는 짝을 `match_place_id` 로만 찾지 않는다 — 0.4~0.85 패널에서 온 `asNew` 는 짝이 비어 있고
   * 재대조가 찾아낸 이웃을 버리는 것이라, `asNew` 를 끈 판정을 한 번 더 돌려 그 id 를 얻는다(순수 함수라 I/O 가 없다).
   */
  if (opts.asNew && !opts.confirmedDifferent) {
    const would = decideTarget(lead, existing, { ...opts, asNew: false, mergeInto: null });
    const droppedId = would.kind === 'target' ? would.targetId : would.similar.id;
    const dropped = droppedId ? places.find((place) => place.id === droppedId) : undefined;
    if (dropped?.status === 'archived') return archivedOutcome(dropped);
  }

  const decision = decideTarget(lead, existing, opts);
  if (decision.kind === 'needsDecision') {
    /*
     * 상태를 경계에서 얹는다. `decideTarget` 은 status 없는 `TPlace[]` 만 보므로 거기서는 알 수 없고,
     * 이 함수는 행(`places`)을 들고 있다. 이 셋이 없으면 화면의 "비슷한 장소" 패널이 내린 곳을 멀쩡한 곳처럼
     * 보여 주고, 그 패널의 두 버튼이 둘 다 틀린 일을 한다(`TSimilarPlace` 주석).
     */
    const row = places.find((place) => place.id === decision.similar.id);
    return {
      kind: 'needsDecision',
      similar: {
        ...decision.similar,
        status: row?.status,
        archivedAt: row?.archived_at,
        archiveNote: row?.archive_note,
      },
    };
  }

  let target: TPlaceRow | undefined;
  if (decision.targetId) {
    target = places.find((place) => place.id === decision.targetId);
    if (!target) {
      /*
       * `fetchMatchablePlaces` 가 2026-09-29 부터 archived 까지 읽으므로, 여기 오는 것은 **id 가 아예 없는** 경우다
       * (Studio 에서 행을 지웠거나 짝이 다른 프로젝트의 id 다). 내린 곳은 아래 archived 가지가 받는다.
       * "새로고침" 을 권하지 않는다: 다시 읽어도 그 행은 또 없고, 사람은 될 리 없는 일을 반복한다.
       * 나갈 길은 화면에 이미 있다 — 짝이 붙은 후보는 `새 장소로 올리기` 가 보이고, 그것은 짝을 무시하고 신규로 올린다.
       */
      return {
        kind: 'blocked',
        reason: `짝지은 장소(${decision.targetId})가 DB 에 없어요 — 지워졌거나 다른 프로젝트의 id 예요. '새 장소로 올리기' 로 올리거나 Studio 에서 확인해 주세요.`,
      };
    }
    /*
     * 내린 곳에 후보가 조용히 합쳐지지 않게(apply-approved.mjs:108-110). 여기서 멈추면 후보는 pending 그대로다.
     *
     * **이 가지가 소프트 삭제의 방어선이다.** 대조 corpus 에 archived 가 없던 시절에는 같은 가게의 새 글이 '신규' 로
     * 판정돼 복제본이 생겼다(`fetchMatchablePlaces` 주석). 지금은 짝이 잡히고 여기서 멈춘다.
     * 다만 `blocked` 로 끝내지 않는다 — 폐업했던 가게가 다시 여는 일은 실제로 있고, 그때 사람이 '되살려서 합치기' 를
     * 고를 수 있어야 한다. 고르지 않았으면 무엇을 고를지 화면이 묻는다.
     */
    if (target.status === 'archived' && !opts.restoreArchived) return archivedOutcome(target);
  }

  // ── 여기서부터 DB 에 쓴다. 실패는 어느 단계인지 붙여 던진다 ──────────────

  /*
   * 되살리기를 골랐으면 그것이 **첫 쓰기**다. 순서를 이렇게 두는 이유 — 뒤가 죽어도 장소는 `published` 로 남아
   * 다음 빌드에 사이트로 돌아오고, 남은 일(빈 칸 채우기)은 후보가 `approved` 로 남아 `pnpm data:apply` 가 이어받는다.
   * 반대 순서면 "승인은 됐는데 장소는 여전히 내려 있는" 상태로 끊기고, 그건 화면에서 보이지 않는다.
   */
  let restoredName: string | null = null;
  if (target && target.status === 'archived') {
    Object.assign(target, await restorePlace(client, target, { nowIso: opts.nowIso }));
    restoredName = target.name;
  }

  /*
   * 되살리기가 커밋된 뒤에 뒷단계가 죽으면 **장소는 이미 게시중**이다. 그 사실을 실패 문구에 실어야 한다 —
   * 안 실으면 사람이 그 자리에서 '아니에요' 를 누르고(그건 `candidates` 만 건드린다) 내렸던 곳이 다음 빌드에
   * 사이트로 돌아간다. '올린 장소' 칸에서는 그냥 평범한 '게시중' 한 줄로 보여 흔적이 `archive_note` 한 줄뿐이다.
   */
  try {
    await markApproved(client, lead);
  } catch (error) {
    throw restoredName
      ? new Error(
          `${error instanceof Error ? error.message : String(error)} — ${restoredName} 은 이미 게시중으로 돌아갔어요. 반려하려면 '올린 장소' 에서 다시 내려 주세요.`,
        )
      : error;
  }

  let placeId: string;
  let placeName: string;
  let kind: 'created' | 'merged';
  let patchKeys: string[];

  if (target) {
    patchKeys = await fillBlanks(client, target, lead);
    placeId = target.id;
    placeName = target.name;
    kind = 'merged';
  } else {
    let created: TPlaceRow;
    try {
      // 승인 즉시 published — draft 로 넣으면 Studio 를 또 열어야 해 이 화면을 만든 이유가 사라진다(ADR-018).
      created = { ...(toNewPlaceRow(lead, { id: opts.newId() }) as unknown as TPlaceRow), status: 'published' };
    } catch (e) {
      // leadProblem 이 같은 규칙을 먼저 보므로 여기 오지 않는 게 정상이다 — 오면 그 함수의 메시지를 그대로 보여 준다.
      // 이 자리는 approved 를 이미 적은 뒤다(두 규칙이 어긋났다는 뜻). 후보는 approved 로 남아 `pnpm data:apply` 가
      // 이어받아 같은 이유로 pending 으로 되돌리고 reviewer_note 에 사유를 적는다 — 잃어버리지는 않는다.
      return { kind: 'blocked', reason: e instanceof Error ? e.message : '장소 행을 만들지 못했어요.' };
    }
    const insert = await client.from('places').insert(created);
    failIf('장소 추가', insert.error);
    places.push(created);
    // insert 직후 후보에 새 id 를 묶는다 — 다음 단계에서 죽어도 재시도가 두 번째 insert 를 하지 않게(파일 머리 주석 (2)).
    const writeBack = await client.from('candidates').update({ match_place_id: created.id }).eq('id', lead.id);
    failIf('새 장소와 짝 맺기', writeBack.error);
    target = created;
    placeId = created.id;
    placeName = created.name;
    kind = 'created';
    patchKeys = [];
  }

  await linkSource(client, placeId, lead.post_url);
  await markMerged(client, lead, { placeId, kind, patchKeys, at: opts.nowIso });

  // 같은 가게를 말하는 나머지 글들 — 대표가 정한 장소로 보강만 한다(새로 만들지 않는다).
  for (const row of group.rows) {
    if (row.id === lead.id) continue;
    await markApproved(client, row);
    const keys = await fillBlanks(client, target, row);
    await linkSource(client, placeId, row.post_url);
    await markMerged(client, row, { placeId, kind: 'merged', patchKeys: keys, at: opts.nowIso });
  }

  return { kind, placeId, placeName, patchKeys, rows: group.rows.length };
}

/**
 * 묶음 하나를 반려한다. `places` 는 건드리지 않는다.
 * 사유는 `reviewer_note` 에 덧붙인다 — 왜 반려했는지가 남지 않으면 같은 글이 다음 분석에 또 올라온다.
 */
export async function rejectGroup(
  client: SupabaseClient,
  group: TCandidateGroup,
  reason: string,
  note?: string,
): Promise<void> {
  const line = `[admin] ${reason}${note && note.trim() ? ` — ${note.trim()}` : ''}`;
  for (const row of group.rows) {
    const { error } = await client
      .from('candidates')
      .update({ status: 'rejected', reviewer_note: appendReviewerNote(row.reviewer_note, line) })
      .eq('id', row.id);
    failIf('후보 반려', error);
  }
}

/**
 * 지역만 고쳐 넣는다(브리프 결정 9 의 최소 편집). `extracted` 통째로 다시 쓰는 이유 —
 * jsonb 안의 한 키만 바꾸는 문법이 PostgREST 에 없다. 그래서 읽어 온 행을 그대로 펼쳐 한 키만 덮는다.
 */
export async function setRegion(client: SupabaseClient, row: TCandidateRow, regionRaw: string): Promise<TCandidateRow> {
  const extracted = { ...row.extracted, regionRaw };
  const { error } = await client.from('candidates').update({ extracted }).eq('id', row.id);
  failIf('지역 저장', error);
  return { ...row, extracted };
}
