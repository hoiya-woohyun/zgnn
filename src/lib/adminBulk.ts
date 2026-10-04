/**
 * 표 위 줄의 **일괄 처리** — 고른 묶음들에 무엇을 할 수 있고 무엇을 건너뛰나(2026-09-30).
 *
 * 한 줄씩 누르던 동작(올리기·최신본으로 저장)을 여러 줄에 한 번에 건다. 원칙 하나 — **사람의 판단이 필요한 줄은
 * 일괄로 넘기지 않는다.** 닮은 정도 0.4~0.85(`needsDecision`)·짝이 내린 곳(`archivedTarget`)·원글과 주소가 다른 곳(`addressConflict`)은 한 줄에서 사람이 골라야 하는
 * 자리라, 일괄은 거기서 멈추고 그 줄에 패널을 세워 둔다(`approveGroup` 이 쓰기 전에 돌려주므로 아무것도 안 쓴 상태다).
 * 여기는 그 분류와 결과 문장만 맡는 순수 함수다.
 */

import { addressUnresolved } from './adminAddress';
import { regionUsable, type TCandidateGroup, type TPlaceRow } from './adminCandidates';
import { defaultOverwritePick, latestPlan } from './adminLatest';
import { liveProposal, proposalPick, withProposal } from './adminProposal';
import { verifyNeedsLook } from './adminVerify';
import { policyDirection } from './policyDirection';

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
      const proposal = liveProposal(group.rows ?? []);
      const effective = withProposal(group.lead.extracted, proposal, place);
      const keys = latestPlan(place, effective).changes.map((change) => change.key);
      // 한 줄의 기본 체크(`adminPageGroupCard`)와 같은 식 — 일괄이 더 공격적이면 "본 줄과 다른 것이 덮였다" 가 된다.
      const loosen = policyDirection(place.pet_policy, effective.petPolicy).overall === 'loosen';
      const columns = proposalPick(keys, proposal, place, group.rows) ?? defaultOverwritePick(keys, { loosen, place });
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
  /** 교차점검이 `동반 근거 없음`·`동반 불가 정황` 인데 올라가는 줄 — 한 줄 결정 줄은 이 경우 주 버튼을 반려로 뒤집는다. */
  noEvidence: number;
  /** 주소가 원글과 달라 올라가지 않는 줄(줄에서 직접 고른다). */
  addressUnresolved: number;
  /** 지역이 없어 올라가지 않는 줄. */
  noRegion: number;
  /** 짝이 내린 곳이라 멈추는 줄. */
  archivedTarget: number;
  /** 분석이 '닮은 곳, 확인 필요' 로 표시한 줄 — 올릴 때 고를 것을 띄울 수 있다. */
  ask: number;
};

/**
 * 일괄 올리기 확인의 구성 — 고른 줄을 세어 무엇이 올라가고 무엇이 멈추나. `approveGroup` 의 가드(지역·주소·내린 곳)와 같은 판정을 쓴다.
 * 한 줄은 한 칸에만 센다(우선순위: 지역 → 주소 → 내린 곳 → 닮은 곳 → 근거 → 나머지). `places` 는 짝이 내린 곳인지 보는 캐시다.
 */
export function bulkApproveSummary(groups: TCandidateGroup[], selected: readonly string[], places: TPlaceRow[] = []): TBulkApprove {
  const wanted = new Set(selected);
  const byId = new Map(places.map((place) => [place.id, place]));
  const out: TBulkApprove = { ok: 0, noEvidence: 0, addressUnresolved: 0, noRegion: 0, archivedTarget: 0, ask: 0 };
  for (const group of groups) {
    if (!wanted.has(group.key)) continue;
    const extracted = group.lead.extracted;
    const pairId = group.lead.match_place_id;
    if (!regionUsable(extracted?.regionRaw)) out.noRegion += 1;
    else if (addressUnresolved(extracted)) out.addressUnresolved += 1;
    else if (pairId && byId.get(pairId)?.status === 'archived') out.archivedTarget += 1;
    else if (!pairId && extracted?.match?.tier === 'ask') out.ask += 1;
    else if (verifyNeedsLook(extracted?.verify)) out.noEvidence += 1;
    else out.ok += 1;
  }
  return out;
}

/** 일괄 올리기를 확인하는 자리의 문장. 올라가지 않는 줄은 '건너뛰어요', 올라가는데 근거가 없는 줄은 그렇다고 적는다. */
export function bulkApproveText(plan: TBulkApprove): string {
  const up = plan.ok + plan.noEvidence;
  const head = plan.noEvidence ? `${up}곳 올려요 — 그중 근거 없음 ${plan.noEvidence}곳도 그대로 올라가요.` : `${up}곳 올려요.`;
  const skipped = [
    plan.noRegion && `지역이 없는 ${plan.noRegion}곳`,
    plan.addressUnresolved && `주소가 원글과 다른 ${plan.addressUnresolved}곳`,
    plan.archivedTarget && `짝이 내린 곳인 ${plan.archivedTarget}곳`,
  ].filter(Boolean);
  const ask = plan.ask ? ` 닮은 곳 확인이 필요한 ${plan.ask}곳은 멈추고 그 줄에 고를 것을 띄울 수 있어요.` : '';
  const rest = skipped.length ? ` ${skipped.join(' · ')}은 건너뛰어요.` : '';
  return `${head}${rest}${ask} 짝이 있으면 그 장소의 빈 칸만 채우고, 없으면 새 장소로 올라가요.`;
}

/** 일괄 올리기 주 버튼을 내려야 하나 — 근거 없음이든 멈추는 줄이든 하나라도 있으면 핑크 한 번으로 보내지 않는다. */
export function bulkApproveNeedsLook(plan: TBulkApprove): boolean {
  return plan.noEvidence + plan.addressUnresolved + plan.noRegion + plan.archivedTarget + plan.ask > 0;
}

export type TBulkTally = { done: number; waiting: number; failed: number };

/**
 * 일괄 결과 한 줄. **기다리는 것(사람이 골라야 하는 줄)을 실패와 섞지 않는다** — 실패는 다시 누르면 되고,
 * 기다리는 것은 펼쳐서 골라야 한다. 둘을 한 수로 말하면 운영자가 할 일을 모른다.
 */
export function summarizeBulk(verb: string, tally: TBulkTally): string {
  const parts = [`${tally.done}곳 ${verb}`];
  if (tally.waiting) parts.push(`${tally.waiting}곳은 직접 골라야 해요(줄을 펼쳐 보세요)`);
  if (tally.failed) parts.push(`${tally.failed}곳 실패 — 줄에 이유를 적어 뒀어요`);
  return parts.join(' · ');
}
