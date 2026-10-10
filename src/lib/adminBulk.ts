/**
 * 표 위 줄의 **일괄 처리** — 고른 묶음들에 무엇을 할 수 있고 무엇을 건너뛰나(2026-09-30).
 *
 * 한 줄씩 누르던 동작(올리기·최신본으로 저장)을 여러 줄에 한 번에 건다. 원칙 하나 — **사람의 판단이 필요한 줄은
 * 일괄로 넘기지 않는다.** 닮은 정도 0.4~0.85(`needsDecision`)·짝이 내린 곳(`archivedTarget`)·원글과 주소가 다른 곳(`addressConflict`)은 한 줄에서 사람이 골라야 하는
 * 자리라, 일괄은 거기서 멈추고 그 줄에 패널을 세워 둔다(`approveGroup` 이 쓰기 전에 돌려주므로 아무것도 안 쓴 상태다).
 * 여기는 그 분류와 결과 문장만 맡는 순수 함수다.
 */

import { addressUnresolved } from './adminAddress';
import { previewFor, regionUsable, type TCandidateGroup, type TPlaceRow } from './adminCandidates';
import { overwriteDefault } from './adminPairPolicy';
import { policyCell } from './adminPreview';
import { verifyListedOnly, verifyNeedsLook, verifyView } from './adminVerify';

export type TBulkLatest = {
  /**
   * 덮을 수 있는 묶음과 짝 id · 덮을 칸 수. `columns` 는 덮을 칸 — **한 줄의 기본 체크와 같다**: 제안이 있으면 제안이 켠 칸만(11 U7),
   * 없으면 `defaultOverwritePick`(완화된 조건 · 사이트에 값이 있는 이름·종류·소개는 끈다, 2026-10-04). 일괄이 한 줄보다 더 덮지 않는다.
   */
  eligible: { group: TCandidateGroup; pairId: string; changes: number; columns: string[] }[];
  /** 짝이 없다 — 덮을 대상이 없다(새 장소 후보). */
  noPair: number;
  /** 짝이 내린 곳 — 되살릴지는 한 줄에서 사람이 정한다. */
  archived: number;
  /** 새 분석이 지금 값과 같다 — 덮을 칸이 없다. */
  same: number;
  /** 바뀌는 칸은 있는데 기본으로 켜진 칸이 없다(이름·소개·완화된 조건뿐) — 덮으려면 한 줄에서 사람이 켠다. */
  offByDefault: number;
};

/**
 * 최신본으로 저장할 수 있는 묶음 가르기. 짝 행은 페이지의 캐시(`placesView`)에서 찾는다 — 한 줄 버튼과 같은 행이라야
 * 한 줄에서 본 "N칸" 과 일괄의 합이 같다. 짝 행을 못 찾으면(DB 에 없다) 짝 없음으로 센다.
 */
export function bulkLatestTargets(groups: TCandidateGroup[], places: TPlaceRow[]): TBulkLatest {
  const byId = new Map(places.map((place) => [place.id, place]));
  const out: TBulkLatest = { eligible: [], noPair: 0, archived: 0, same: 0, offByDefault: 0 };
  for (const group of groups) {
    const pairId = group.lead.match_place_id;
    const place = pairId ? byId.get(pairId) : undefined;
    if (!pairId || !place) out.noPair += 1;
    else if (place.status === 'archived') out.archived += 1;
    else {
      // 한 줄의 기본 체크(`adminPageGroupCard`)와 같은 함수 — 일괄이 더 공격적이면 "본 줄과 다른 것이 덮였다" 가 된다.
      const { plan, columns } = overwriteDefault(group, place);
      const keys = plan.changes.map((change) => change.key);
      if (columns.length) out.eligible.push({ group, pairId, changes: columns.length, columns });
      else if (keys.length) out.offByDefault += 1;
      else out.same += 1;
    }
  }
  return out;
}

/** 확인 문장 — 몇 묶음 · 몇 칸이 바뀌고, 무엇을 왜 건너뛰나. */
export function bulkLatestSummary(plan: TBulkLatest): string {
  const cells = plan.eligible.reduce((sum, entry) => sum + entry.changes, 0);
  const skipped = [
    plan.noPair && `짝 없는 ${plan.noPair}곳`,
    plan.archived && `짝이 내린 곳인 ${plan.archived}곳`,
    plan.same && `바뀔 칸이 없는 ${plan.same}곳`,
    plan.offByDefault && `이름·소개처럼 사람이 켜야 하는 칸만 바뀌는 ${plan.offByDefault}곳`,
  ].filter(Boolean);
  const head = `${plan.eligible.length}곳의 기존 장소를 새 분석 값으로 덮어요 — 모두 ${cells}칸.`;
  return skipped.length ? `${head} ${skipped.join(' · ')}은 건너뛰어요.` : head;
}

export type TBulkApprove = {
  /** 근거 걱정 없이 올라가는 줄. */
  ok: number;
  /** 교차점검이 `동반 근거 없음` 인데 올라가는 줄 — 한 줄 결정 줄은 이 경우 주 버튼을 반려로 뒤집는다. */
  noEvidence: number;
  /**
   * 교차점검이 `동반 불가 정황` 이라 일괄로는 올리지 않는 줄(2026-10-10, todo/14 W261010.1). 예전엔 근거 없음과 한 칸이라
   * "근거 없음 2곳도 그대로 올라가요" 에 빨간 표식의 가게가 섞여 게시됐다 — 강아지를 못 데려간다는 정황을 일괄 한 번이 덮으면 안 된다.
   */
  denied: number;
  /** 주소가 원글과 달라 올라가지 않는 줄(줄에서 직접 고른다). */
  addressUnresolved: number;
  /** 지역이 없어 올라가지 않는 줄. */
  noRegion: number;
  /** 짝이 내린 곳이라 멈추는 줄. */
  archivedTarget: number;
  /** 분석이 '닮은 곳, 확인 필요' 로 표시한 줄 — 올릴 때 고를 것을 띄울 수 있다. */
  ask: number;
  /** 근거가 얇은 신규(`thinNewEvidence`) — 일괄로는 안 올리고 한 줄씩 보게 둔다(todo/13 A3). */
  thin: number;
  /** 확인 문장에 이름을 적는 칸 — 근거 없이 **올라가는** 곳과 동반 불가 정황이라 **건너뛰는** 곳. 수만 보이면 어느 줄인지 다시 찾아야 한다. */
  names: { noEvidence: string[]; denied: string[] };
};

type TBulkSlot = Exclude<keyof TBulkApprove, 'names'>;

/** 이름 몇 개를 한 덩어리로 — 셋까지 적고 나머지는 수로. */
export function namesNote(names: readonly string[], max = 3): string {
  if (!names.length) return '';
  const shown = names.slice(0, max).join(' · ');
  return names.length > max ? `${shown} 외 ${names.length - max}곳` : shown;
}

/**
 * 근거가 얇은 신규인가(todo/13 A3) — 새 장소로 올라갈 묶음이 **조건 미기재**(`policyCell` 의 `noLimit` — "가능" 한 줄뿐)이면서
 * 독립 글이 하나뿐이거나 교차점검이 '동반 표기만' 이다. 그대로 올리면 사이트가 "애견동반 가능" 한 줄을 조건 없는 '갈 수 있어요' 로 내보낸다.
 *
 * 막지 않는다 — 한 줄씩은 올릴 수 있다. 일괄에서만 빼는 이유는 일괄 버튼이 "봤다" 는 뜻을 잃지 않게 하는 것이다:
 * 이런 줄은 원문을 한 번 읽어야 하는 자리인데, 백 줄을 한 번에 고르면 그 한 번이 사라진다.
 * 짝이 있는 묶음(보강·갱신)은 사이트의 조건을 덮지 않으므로 대상이 아니다.
 *
 * **문장 없음(`noText`)이면서 교차점검이 '동반 표기만'** 인 신규도 얇다(2026-10-06, todo/13 A7) — 조건 문장도 없고 강아지가 있었다는 서술도 없어,
 * 근거가 "동반 가능" 이라는 표기 하나뿐이다. 문장 없음 + '동반 확인' 은 그대로 올라간다(교차점검이 개가 있었다고 봤다).
 * 독립 글 수는 여기서 보지 않는다 — 글이 여럿이어도 표기만이면 얇고, 동반 확인이면 한 건이어도 근거가 있다.
 */
export function thinNewEvidence(group: TCandidateGroup): boolean {
  if (group.lead.match_place_id) return false;
  const extracted = group.lead.extracted;
  const state = policyCell(previewFor(extracted), extracted.petPolicyText).state;
  if (state === 'noText') return verifyListedOnly(extracted.verify);
  if (state !== 'noLimit') return false;
  const independent = group.independentPosts ?? group.posts?.length ?? 1;
  return independent <= 1 || verifyListedOnly(extracted.verify);
}

/**
 * 한 줄이 일괄 올리기에서 어느 칸에 서나 — 우선순위: 동반 불가 정황 → 지역 → 주소 → 내린 곳 → 닮은 곳 → 근거 얇음 → 근거 없음 → 나머지.
 * 동반 불가 정황이 맨 앞인 이유: 다른 이유로도 건너뛰는 줄이라도 확인 문장에 그 이름이 적혀야 한다(가장 비싼 오류다).
 * 집계(`bulkApproveSummary`)와 실제로 보낼 줄 고르기(`bulkApproveJobs`)가 **같은 함수**를 지나야 확인 문장이 말한 것과 올라간 것이 같다.
 */
function bulkApproveSlot(group: TCandidateGroup, byId: Map<string, TPlaceRow>): TBulkSlot {
  const extracted = group.lead.extracted;
  const pairId = group.lead.match_place_id;
  if (verifyView(extracted?.verify)?.state === 'denied') return 'denied';
  if (!regionUsable(extracted?.regionRaw)) return 'noRegion';
  if (addressUnresolved(extracted)) return 'addressUnresolved';
  if (pairId && byId.get(pairId)?.status === 'archived') return 'archivedTarget';
  if (!pairId && extracted?.match?.tier === 'ask') return 'ask';
  if (thinNewEvidence(group)) return 'thin';
  if (verifyNeedsLook(extracted?.verify)) return 'noEvidence';
  return 'ok';
}

/** 확인 문장이 "건너뛰어요" 라 말하고 **보내지도 않는** 칸. */
const SKIPPED_SLOTS: ReadonlySet<TBulkSlot> = new Set(['thin', 'denied', 'noRegion']);

/**
 * 일괄 올리기가 실제로 `approveGroup` 에 보낼 묶음 — 근거 얇은 신규 · 동반 불가 정황 · 지역 없음은 뺀다. 지역 없음을 보내면
 * `approveGroup` 이 `blocked` 로 돌려줘 결과 줄이 확인 문장의 "건너뛰어요" 를 '실패' 로 셌다(2026-10-10, todo/14 W261010.1).
 * 나머지 멈추는 줄(주소·내린 곳·닮은 곳)은 `approveGroup` 이 쓰기 전에 스스로 멈추고 그 줄에 패널을 세우므로 그대로 보낸다(그 패널이 다음 할 일이다).
 */
export function bulkApproveJobs(groups: TCandidateGroup[], places: TPlaceRow[] = []): TCandidateGroup[] {
  const byId = new Map(places.map((place) => [place.id, place]));
  return groups.filter((group) => !SKIPPED_SLOTS.has(bulkApproveSlot(group, byId)));
}

/**
 * 일괄 올리기 확인의 구성 — 고른 줄을 세어 무엇이 올라가고 무엇이 멈추나. `approveGroup` 의 가드(지역·주소·내린 곳)와 같은 판정을 쓴다.
 * 한 줄은 한 칸에만 센다(`bulkApproveSlot` 의 우선순위). `places` 는 짝이 내린 곳인지 보는 캐시다.
 */
export function bulkApproveSummary(groups: TCandidateGroup[], selected: readonly string[], places: TPlaceRow[] = []): TBulkApprove {
  const wanted = new Set(selected);
  const byId = new Map(places.map((place) => [place.id, place]));
  const out: TBulkApprove = { ok: 0, noEvidence: 0, denied: 0, addressUnresolved: 0, noRegion: 0, archivedTarget: 0, ask: 0, thin: 0, names: { noEvidence: [], denied: [] } };
  for (const group of groups) {
    if (!wanted.has(group.key)) continue;
    const slot = bulkApproveSlot(group, byId);
    out[slot] += 1;
    if (slot === 'noEvidence' || slot === 'denied') out.names[slot].push(group.lead.extracted?.name ?? '이름 없음');
  }
  return out;
}

/** 일괄 올리기를 확인하는 자리의 문장. 올라가지 않는 줄은 '건너뛰어요', 올라가는데 근거가 없는 줄은 그렇다고 적는다. */
export function bulkApproveText(plan: TBulkApprove): string {
  const up = plan.ok + plan.noEvidence;
  const head = plan.noEvidence
    ? `${up}곳 올려요 — 그중 근거 없음 ${plan.noEvidence}곳(${namesNote(plan.names.noEvidence)})도 그대로 올라가요.`
    : `${up}곳 올려요.`;
  const skipped = [
    plan.denied && `동반 불가 정황인 ${plan.denied}곳(${namesNote(plan.names.denied)})`,
    plan.noRegion && `지역이 없는 ${plan.noRegion}곳`,
    plan.addressUnresolved && `주소가 원글과 다른 ${plan.addressUnresolved}곳`,
    plan.archivedTarget && `짝이 내린 곳인 ${plan.archivedTarget}곳`,
    plan.thin && `근거가 얇아 한 줄씩 봐야 하는 ${plan.thin}곳`,
  ].filter(Boolean);
  const ask = plan.ask ? ` 닮은 곳 확인이 필요한 ${plan.ask}곳은 멈추고 그 줄에 고를 것을 띄울 수 있어요.` : '';
  const rest = skipped.length ? ` ${skipped.join(' · ')}은 건너뛰어요.` : '';
  return `${head}${rest}${ask} 짝이 있으면 그 장소의 빈 칸만 채우고, 없으면 새 장소로 올라가요.`;
}

/** 일괄 올리기 주 버튼을 내려야 하나 — 근거 없음이든 멈추는 줄이든 하나라도 있으면 핑크 한 번으로 보내지 않는다. */
export function bulkApproveNeedsLook(plan: TBulkApprove): boolean {
  return plan.noEvidence + plan.denied + plan.addressUnresolved + plan.noRegion + plan.archivedTarget + plan.ask + plan.thin > 0;
}

export type TBulkTally = {
  done: number;
  waiting: number;
  failed: number;
  /** 운영자가 `멈추기` 를 눌러 **손대지 않은** 묶음 수(todo/09 T6.5). 실패도 기다림도 아니다 — 다시 고르면 그대로 돈다. */
  stopped?: number;
  /** 확인 문장이 "건너뛰어요" 라 말해 **보내지 않은** 묶음 수 — 실패가 아니다(2026-10-10). 줄은 목록에 남아 한 줄씩 본다. */
  skipped?: number;
  /** 된 묶음의 이름 — "2곳 올렸어요" 만으로는 무엇이 사이트에 나갔는지 모른다. */
  doneNames?: string[];
};

/** 멈춰서 안 한 수를 결과 줄 끝에 — 올리기·덮어쓰기·제외가 같은 말을 쓴다. */
export function stoppedNote(stopped: number | undefined): string {
  return stopped ? ` · 멈춰서 ${stopped}곳은 안 했어요` : '';
}

/**
 * 일괄 결과 한 줄. **기다리는 것(사람이 골라야 하는 줄)을 실패와 섞지 않는다** — 실패는 다시 누르면 되고,
 * 기다리는 것은 펼쳐서 골라야 한다. 둘을 한 수로 말하면 운영자가 할 일을 모른다.
 */
export function summarizeBulk(verb: string, tally: TBulkTally): string {
  const names = namesNote(tally.doneNames ?? []);
  const parts = [`${tally.done}곳 ${verb}${names ? `(${names})` : ''}`];
  if (tally.waiting) parts.push(`${tally.waiting}곳은 직접 골라야 해요(줄을 펼쳐 보세요)`);
  if (tally.failed) parts.push(`${tally.failed}곳 실패 — 줄에 이유를 적어 뒀어요`);
  if (tally.skipped) parts.push(`${tally.skipped}곳은 건너뛰었어요`);
  return parts.join(' · ') + stoppedNote(tally.stopped);
}

export type TBulkTone = 'success' | 'warning' | 'error';

/**
 * 일괄 결과 줄의 색. 글은 `summarizeBulk` 가 바르게 세어도 줄이 늘 초록이면 운영자는 숫자를 안 읽는다 —
 * "0곳 올렸어요 · 3곳 실패" 가 초록으로 선 것이 todo/09 T6.4 의 출발이다. 하나도 못 했으면 빨강,
 * 일부가 기다리거나 실패했으면 노랑(할 일이 남았다), 전부 됐을 때만 초록.
 */
export function bulkTone(tally: TBulkTally): TBulkTone {
  const left = tally.waiting + tally.failed + (tally.stopped ?? 0) + (tally.skipped ?? 0);
  if (left === 0) return 'success';
  return tally.done === 0 ? 'error' : 'warning';
}
