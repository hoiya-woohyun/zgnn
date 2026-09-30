/**
 * 표 위 줄의 **일괄 처리** — 고른 묶음들에 무엇을 할 수 있고 무엇을 건너뛰나(2026-09-30).
 *
 * 한 줄씩 누르던 동작(올리기·최신본으로 저장)을 여러 줄에 한 번에 건다. 원칙 하나 — **사람의 판단이 필요한 줄은
 * 일괄로 넘기지 않는다.** 닮은 정도 0.4~0.85(`needsDecision`)·짝이 내린 곳(`archivedTarget`)은 한 줄에서 사람이 골라야 하는
 * 자리라, 일괄은 거기서 멈추고 그 줄에 패널을 세워 둔다(`approveGroup` 이 쓰기 전에 돌려주므로 아무것도 안 쓴 상태다).
 * 여기는 그 분류와 결과 문장만 맡는 순수 함수다.
 */

import type { TCandidateGroup, TPlaceRow } from './adminCandidates';
import { latestPlan } from './adminLatest';

export type TBulkLatest = {
  /** 덮을 수 있는 묶음과 짝 id · 바뀌는 칸 수. */
  eligible: { group: TCandidateGroup; pairId: string; changes: number }[];
  /** 짝이 없다 — 덮을 대상이 없다(새 장소 후보). */
  noPair: number;
  /** 짝이 내린 곳 — 되살릴지는 한 줄에서 사람이 정한다. */
  archived: number;
  /** 새 분석이 지금 값과 같다 — 덮을 칸이 없다. */
  same: number;
};

/**
 * 최신본으로 저장할 수 있는 묶음 가르기. 짝 행은 페이지의 캐시(`placesView`)에서 찾는다 — 한 줄 버튼과 같은 행이라야
 * 한 줄에서 본 "N칸" 과 일괄의 합이 같다. 짝 행을 못 찾으면(DB 에 없다) 짝 없음으로 센다.
 */
export function bulkLatestTargets(groups: TCandidateGroup[], places: TPlaceRow[]): TBulkLatest {
  const byId = new Map(places.map((place) => [place.id, place]));
  const out: TBulkLatest = { eligible: [], noPair: 0, archived: 0, same: 0 };
  for (const group of groups) {
    const pairId = group.lead.match_place_id;
    const place = pairId ? byId.get(pairId) : undefined;
    if (!pairId || !place) out.noPair += 1;
    else if (place.status === 'archived') out.archived += 1;
    else {
      const changes = latestPlan(place, group.lead.extracted).changes.length;
      if (changes) out.eligible.push({ group, pairId, changes });
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
  ].filter(Boolean);
  const head = `${plan.eligible.length}곳의 기존 장소를 새 분석 값으로 덮어요 — 모두 ${cells}칸.`;
  return skipped.length ? `${head} ${skipped.join(' · ')}은 건너뛰어요.` : head;
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
