/**
 * 묶음 소개(13 §5.3 A3) — 검수 대기가 `group_intros`(분석이 묶음 키로 저장한 종합 소개, A2)를 읽고, 카드의 'AI 요약' · 펼친 줄의 '소개' ·
 * 등록 소개(`approveGroup`)가 **한 함수**(`chooseGroupIntro`, scripts/analyze/groupIntroMaterials.mjs)로 소개를 정한다. CLI 반영도 같은 함수다.
 *
 * 저장된 줄은 지문이 지금 재료와 같을 때만 쓴다 — 지문은 브라우저에서도 같은 값이 나오게 노드 모듈 없이 잰다(groupIntroMaterials.mjs 머리 주석).
 * 묶음 키가 분석과 같아야 줄을 찾는다 — 그래서 검수 대기는 pending 을 끝까지 읽는다(`fetchPendingCandidates`, todo/06 #16).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { chooseGroupIntro } from '../../scripts/analyze/groupIntroMaterials.mjs';
import { isTableMissing } from '../../scripts/lib/collectRequests.mjs';
import { selectAllPages } from '../../scripts/lib/selectAllPages.mjs';
import type { TCandidateGroup } from './adminCandidates';

export type TIntroSentence = { text: string; posts: string[] };

/** `group_intros` 한 줄(읽는 칸만). 거부·충돌도 지문과 함께 저장된다(`intro` null). */
export type TGroupIntroRow = {
  group_key: string;
  fingerprint: string;
  intro: string | null;
  sentences: TIntroSentence[] | null;
  conflict: { reason: string; posts: string[] } | null;
  reasons: string[] | null;
};

/** 묶음 키 → 저장된 줄. */
export type TGroupIntros = ReadonlyMap<string, TGroupIntroRow>;

export type TGroupIntroView = ReturnType<typeof chooseGroupIntro>;

export const NO_GROUP_INTROS: TGroupIntros = new Map();

/**
 * 저장된 묶음 소개 전부. **표가 아직 원격에 없으면**(🧑 `db push` 전 — PostgREST `PGRST205` · `42P01`) 빈 묶음으로 조용히 물러난다 —
 * 그때는 모든 신규 묶음이 대체값(재료 하나의 요약 · 대표 `features`)이고, 화면은 깨지지 않는다.
 * 그 밖의 실패는 던진다(후보·장소 읽기와 같은 규칙) — 삼키면 충돌 묶음의 뱃지가 사라지고 대표 요약이 그대로 등록된다.
 */
export async function fetchGroupIntros(client: SupabaseClient): Promise<TGroupIntros> {
  const { data, error } = await selectAllPages((from: number, to: number) =>
    client.from('group_intros').select('group_key, fingerprint, intro, sentences, conflict, reasons').order('group_key').range(from, to),
  );
  if (error) {
    if (isTableMissing(error)) return NO_GROUP_INTROS;
    throw new Error(`묶음 소개 조회: ${error.message}`);
  }
  return new Map(((data ?? []) as TGroupIntroRow[]).map((row) => [row.group_key, row]));
}

/** 이 묶음의 소개 — 카드·펼친 줄·등록이 이것 하나를 부른다. `intros` 가 없으면(옛 호출) 저장값 없이 대체값만. */
export function groupIntroOf(group: TCandidateGroup, intros?: TGroupIntros): TGroupIntroView {
  return chooseGroupIntro(group, intros?.get(group.key) ?? null);
}

/**
 * 소개 문장의 출처 글을 **이름표**로 — 글 주소 → 그 글의 제목(행의 `blog_posts` 임베딩). 제목이 없으면 주소 그대로.
 * 엔젤하우스처럼 수십 편이 같은 요약을 냈으면 `max` 개까지만 싣고 나머지는 수로 센다(`rest`).
 */
export function introPostLinks(group: TCandidateGroup, posts: readonly string[], max = 3): { links: { url: string; title: string }[]; rest: number } {
  const titleOf = new Map(group.rows.map((row) => [row.post_url, row.blog_posts?.title?.trim() || null]));
  const links = posts.slice(0, max).map((url) => ({ url, title: titleOf.get(url) ?? url }));
  return { links, rest: Math.max(0, posts.length - max) };
}
