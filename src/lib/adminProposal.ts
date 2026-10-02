/**
 * 셋째 패스 「제안」(`scripts/analyze/proposePlaces.mjs`)을 검수 화면이 읽는 자리(docs/todo/11 T2.2). 순수.
 *
 * 제안의 상태는 **둘이 아니라 셋**이다 — 갱신 묶음이 아님(해당 없음) · 제안 없음 · 제안 있음.
 * `제안 없음` 은 "안 봤다" 다(패스가 꺼졌거나 실패했거나 이 패스 전의 후보) — `verify` 의 `null` 과 같은 함정이라(CLAUDE.md)
 * 초록이나 "괜찮다" 로 그리면 안 된다. `verifyView` 와 같은 어법으로 화면 표식을 여기서만 정한다.
 *
 * 그리고 **본 것과 덮이는 것이 같아야 한다.** 제안이 있으면 덮어쓰기의 '새 값' 은 대표 후보의 추출값이 아니라 제안 값이다
 * (`withProposal`) — 화면의 전·후 목록(`latestPlan`)과 쓰기(`approveGroup`)가 둘 다 이 함수를 지난다.
 */

import { expandOverwriteColumns } from '../../scripts/analyze/applyApproved.mjs';
import type { TCandidateExtracted, TCandidateGroup, TCandidateRow, TPlaceRow } from './adminCandidates';
import { policyDirection } from './policyDirection';
import type { TPetPolicyFacts, TStayEnvironment } from '../types';

export type TProposalField = {
  action: 'keep' | 'change' | 'append';
  value: unknown;
  basedOn: string[];
  quote: string | null;
  why: string | null;
  /** `pet_policy_text` 의 change 에만 — 근거 글의 판단을 제안 원문에 대 본 것. */
  petPolicy?: TPetPolicyFacts | null;
};

export type TProposal = {
  summary: string | null;
  fields: Partial<Record<string, TProposalField>>;
  conflicts: { field: string; posts: string[] }[];
  promptVersion?: string;
  model?: string;
  at?: string;
  superseded?: boolean;
};

/** 묶음의 **살아 있는** 제안 — `superseded` 가 아닌 것 중 가장 새 것. 없으면 null. */
export function liveProposal(rows: TCandidateRow[]): TProposal | null {
  const live = rows
    .map((row) => row.extracted.proposal as TProposal | undefined)
    .filter((proposal): proposal is TProposal => Boolean(proposal && typeof proposal === 'object' && !proposal.superseded));
  live.sort((a, b) => String(b.at ?? '').localeCompare(String(a.at ?? '')));
  return live[0] ?? null;
}

export type TProposalView =
  | { state: 'missing'; label: string }
  | { state: 'ready'; label: string; proposal: TProposal; changed: string[] };

/**
 * 표식. 갱신 묶음이 아니면 null(그리지 않는다). 갱신인데 제안이 없으면 `제안 없음` — **초록이 아니다**.
 * `changed` 는 제안이 change·append 한 칸 이름.
 */
export function proposalView(group: Pick<TCandidateGroup, 'kind' | 'rows'>): TProposalView | null {
  if (group.kind !== 'update') return null;
  const proposal = liveProposal(group.rows);
  if (!proposal) return { state: 'missing', label: '제안 없음' };
  const changed = Object.entries(proposal.fields)
    .filter(([, field]) => field && field.action !== 'keep')
    .map(([key]) => key);
  return { state: 'ready', label: changed.length ? `제안 ${changed.length}칸` : '제안: 그대로', proposal, changed };
}

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/**
 * 제안을 얹은 extracted — 덮어쓰기의 '새 값'. 제안이 손댈 수 있는 칸(U4)은:
 *  - change → 제안 값(조건 원문이면 판단도 제안의 것)
 *  - append(소개) → 지금 소개 + 한 줄
 *  - keep 이거나 제안이 말하지 않은 칸 → **지금 사이트 값**(그래야 전·후 목록에 안 선다 — 제안이 "그대로" 라 한 칸을 대표 글의 값이 덮지 않게)
 * 제안 밖의 칸(이름·주소·좌표·네이버 id·홈페이지)은 대표 후보의 값 그대로다 — 전·후 목록에 서고, 기본 체크는 꺼져 있다(`proposalPick`).
 */
export function withProposal(extracted: TCandidateExtracted, proposal: TProposal | null, place: TPlaceRow): TCandidateExtracted {
  if (!proposal) return extracted;
  const f = proposal.fields;
  const pick = <T,>(key: string, site: T): T => (f[key]?.action === 'change' ? (f[key]!.value as T) : site);
  const policy = f.pet_policy_text;
  const features = f.features;
  return {
    ...extracted,
    petPolicyText: policy?.action === 'change' ? (text(policy.value) ?? place.pet_policy_text) : place.pet_policy_text,
    petPolicy: policy?.action === 'change' ? (policy.petPolicy ?? null) : place.pet_policy,
    stayPriceText: pick('stay_price_text', place.stay_price_text),
    stayAmenitiesText: pick('stay_amenities_text', place.stay_amenities_text),
    stayEnvironment: pick<TStayEnvironment | null>('stay_environment', place.stay_environment ?? null),
    category: pick('category', place.category),
    features: features?.action === 'append' && text(features.value) ? [text(place.features), text(features.value)].filter(Boolean).join('\n') : place.features,
  };
}

/** 제안 칸 → 덮어쓰기 칸(화면 키). 조건은 원문+판단 짝. 소개(append)는 기본 체크에 넣지 않는다(U4 — 기본 유지). */
const PROPOSAL_COLUMNS: Record<string, string[]> = {
  pet_policy_text: ['pet_policy_text', 'pet_policy'],
  stay_price_text: ['stay_price_text'],
  stay_amenities_text: ['stay_amenities_text'],
  stay_environment: ['stay_environment'],
  category: ['category'],
};

/**
 * 제안이 있을 때의 **기본 체크**(U6·U7) — 제안이 change 라 한 칸만. 동반 조건이 **완화**로 바뀌면 근거 글이 **둘 이상**일 때만 켠다
 * (글 하나의 완화는 꺼진 채 `전화로 확인해 주세요`). 제안이 없으면 null — 부르는 쪽이 지금까지의 기본(`defaultOverwritePick`)으로 간다.
 * @param all 바뀌는 칸(`latestPlan(...).changes` 의 key)
 */
export function proposalPick(all: string[], proposal: TProposal | null, place: TPlaceRow): string[] | null {
  if (!proposal) return null;
  const on = new Set<string>();
  for (const [field, columns] of Object.entries(PROPOSAL_COLUMNS)) {
    const entry = proposal.fields[field];
    if (entry?.action !== 'change') continue;
    if (field === 'pet_policy_text') {
      const loosen = policyDirection(place.pet_policy, entry.petPolicy ?? null).overall === 'loosen';
      if (loosen && new Set(entry.basedOn).size < 2) continue;
    }
    for (const column of columns) on.add(column);
  }
  const expanded = expandOverwriteColumns([...on]) as Set<string>;
  return all.filter((key) => expanded.has(key));
}
