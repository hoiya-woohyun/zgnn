/**
 * 기존 장소에 붙은 묶음(갱신·보강·확인)이 **올리면 무엇을 바꾸나** — 덮어쓰기의 기본 체크와, 목록 줄의 동반 조건 칸(todo/13 T2.3).
 *
 * 왜 한 파일인가 — 목록 칸이 "올리면 나갈 조건" 을 말하려면 기본 체크를 알아야 하고, 그 기본 체크는 한 줄(`adminPageGroupCard`)과
 * 일괄(`bulkLatestTargets`)이 이미 같은 식으로 계산하고 있었다. 셋이 각자 계산하면 한 곳만 고쳐도 "목록이 말한 것 ≠ 올라간 것" 이 된다.
 */

import { previewFor, type TCandidateGroup, type TPlaceRow, type TPolicyPreview } from './adminCandidates';
import { defaultOverwritePick, latestPlan, type TLatestPlan } from './adminLatest';
import { policyCell, type TPolicyCell } from './adminPreview';
import { liveProposal, proposalPick, withProposal } from './adminProposal';
import { policyDirection } from './policyDirection';

export type TOverwriteDefault = {
  /** 덮으면 바뀌는 칸 전부(전·후 목록). */
  plan: TLatestPlan;
  /** 사람이 체크를 건드리기 전에 켜져 있는 칸. */
  columns: string[];
  /** 동반 조건이 더 쉬워지는 덮어쓰기라 조건 칸을 꺼 두었다(11 U6). */
  loosen: boolean;
};

/**
 * 덮어쓰기의 기본 체크 — 제안이 있으면 제안이 켠 칸만(11 U7), 없으면 `defaultOverwritePick`(완화된 조건 · 사이트에 값이 있는 이름·종류·소개는 끈다).
 * '새 값' 은 제안을 지난 값이다(`withProposal`) — 쓰기(`approveGroup`)도 같은 함수를 지난다.
 */
export function overwriteDefault(group: TCandidateGroup, place: TPlaceRow): TOverwriteDefault {
  const proposal = liveProposal(group.rows ?? []);
  const effective = withProposal(group.lead.extracted, proposal, place);
  const plan = latestPlan(place, effective);
  const keys = plan.changes.map((change) => change.key);
  const loosen = policyDirection(place.pet_policy, effective.petPolicy).overall === 'loosen';
  const columns = proposalPick(keys, proposal, place, group.rows) ?? defaultOverwritePick(keys, { loosen, place });
  return { plan, columns, loosen };
}

/** 동반 조건 짝 칸 — 원문과 판단은 한 체크로 함께 덮인다(`expandOverwriteColumns`). */
const POLICY_COLUMNS = ['pet_policy_text', 'pet_policy'];

export type TListPolicy = {
  cell: TPolicyCell;
  /** 칸이 사이트의 지금 조건을 보여 준다(올려도 조건은 안 바뀐다). */
  fromSite: boolean;
  /** 사이트를 보여 주는데 글은 다른 조건을 말한다 — 작은 보조 표식으로 남긴다. */
  blogDiffers: boolean;
};

const cellKey = (cell: TPolicyCell) => `${cell.state}|${cell.items.map((item) => item.label).join('·')}`;

/**
 * 목록 줄의 동반 조건 칸 — **올리면 나갈 조건**을 보여 준다(todo/13 T2.3).
 *
 * 소길스테이: 목록에 블로그가 읽은 "실내 OK · 대형견 OK" 가 서 있었는데, 상세의 제안은 "사이트의 10kg 미만 1마리 유지" 였다.
 * 목록만 보면 올리는 순간 대형견이 되는 것처럼 읽혔다 — 목록과 상세가 서로 반대를 말한 것이다.
 *
 *  - 짝 장소가 없으면(신규) 글이 곧 나갈 조건이다.
 *  - 짝이 있고 조건 칸이 체크돼 있으면(기본 체크, 또는 사람이 고친 체크) 글(제안을 지난 값) 쪽.
 *  - 사이트의 조건 원문이 비어 있으면 글 쪽 — 올리기(합치기)가 빈 칸을 채운다(`fillBlanks`).
 *  - 그 밖에는 사이트의 지금 조건. 글이 다른 말을 하면 `blogDiffers` 로 남긴다 — 숨기면 "글이 뭐라 했나" 를 펼쳐야만 안다.
 *
 * @param pick 사람이 고친 체크(`state.overwritePick`). 없으면 기본 체크.
 */
export function listPolicyCell(group: TCandidateGroup, preview: TPolicyPreview, place: TPlaceRow | undefined, pick?: string[]): TListPolicy {
  const extracted = group.lead.extracted;
  const blog = policyCell(preview, extracted.petPolicyText);
  if (!place || !place.pet_policy_text?.trim()) return { cell: blog, fromSite: false, blogDiffers: false };

  const fallback = overwriteDefault(group, place);
  const keys = fallback.plan.changes.map((change) => change.key);
  const columns = pick ? pick.filter((key) => keys.includes(key)) : fallback.columns;
  if (columns.some((key) => POLICY_COLUMNS.includes(key))) {
    const effective = withProposal(extracted, liveProposal(group.rows ?? []), place);
    const cell = effective === extracted ? blog : policyCell(previewFor(effective), effective.petPolicyText);
    return { cell, fromSite: false, blogDiffers: false };
  }

  // 사이트 쪽 — 사이트와 같은 길(`withPolicyFacts(parsePetPolicy(…))` → `toPetBadges`)이다(`previewPolicy` 의 병합 결과).
  const site = policyCell(previewFor({ ...extracted, petPolicyText: place.pet_policy_text, petPolicy: place.pet_policy }), place.pet_policy_text);
  const differs = Boolean(extracted.petPolicyText?.trim()) && cellKey(site) !== cellKey(blog);
  return { cell: site, fromSite: true, blogDiffers: differs };
}
