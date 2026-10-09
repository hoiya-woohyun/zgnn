/**
 * **재분석 준비** — 글의 분석 결과를 지우고 `pnpm data analyze` 가 그 글을 다시 읽게 되돌린다(검수 화면, 2026-09-30).
 *
 * 절차의 정본은 docs/architecture/data-pipeline.md 「재분석」이다. 그동안 DB 를 손으로 되돌렸고, 이 파일은 그 손질을 버튼 하나로 옮긴다.
 * `pnpm data analyze` 는 `analyzed_at is null` 인 글만 고르므로 되돌리는 칸은 그것 하나다(`analysis` 는 다음 실행이 덮는다).
 * 거기에 `requested_at` 을 찍어 상주 워커가 그 글을 바로 읽게 한다(사람이 요청한 글 — ADR-024 결정 4).
 *
 * 규칙 넷 — 전부 그 문서에서 왔다.
 *  1. **글 단위로 되돌린다.** 글을 다시 읽으면 그 글의 장소가 **전부** 다시 후보가 된다. 이 묶음의 행만 눕히면 같은 글의
 *     형제 후보(다른 줄)가 새 행으로 또 생겨 같은 가게가 두 줄이 된다 — 그래서 대상은 "고른 묶음의 글" 에 걸린 pending 후보 전부다.
 *  2. **지우지 않고 눕힌다**(`status='rejected'` + `[admin] 재분석`). `candidates` 에 DELETE grant 가 없고, 남아야 옛 판단과 새 판단을 대 본다.
 *     머리표가 사람의 반려와 달라 반려 사유 집계에 섞이지 않는다.
 *  3. **사람이 고친 후보(`[admin] 고침`)는 남긴다** — 눕히면 그 손질이 새 후보에 묻힌다. `approved`·`merged`·`rejected` 도 안 건드린다(이미 정한 것).
 *  4. **후보를 먼저 눕히고 글을 나중에 되돌린다.** 거꾸로 하면 그 사이에 터미널에서 돈 `pnpm data analyze` 가 새 후보를 만들고,
 *     옛 후보가 그대로 pending 이라 한 가게가 옛 판단·새 판단 두 벌로 묶인다(대표가 어느 쪽인지 알 수 없다).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { TCandidateRow } from './adminCandidates';
import { EDITED_NOTE } from './adminApply';
import { appendReviewerNote } from './adminSession';

/** 눕힌 후보의 머리표. 반려 사유 칩(`[admin] <사유>`)과 구별되는 문자열이어야 집계가 섞이지 않는다. */
export const REANALYZE_NOTE = '[admin] 재분석';

export type TReanalyzePlan = {
  /** 되돌릴 글 url. */
  posts: string[];
  /** 눕힐 pending 후보 — 고른 묶음 밖의 형제 후보까지. */
  lay: TCandidateRow[];
  /** 사람이 고쳐서 남기는 후보. */
  keep: TCandidateRow[];
};

/**
 * 고른 묶음들의 행 → 무엇을 되돌리나. `pending` 은 지금 화면이 들고 있는 pending 후보 **전부**다(묶음 밖 형제를 찾으려면 필요하다).
 * 글 링크가 없는 후보는 되돌릴 글이 없어 대상에서 빠진다 — 그 후보만 눕히면 다시 생겨날 길이 없다.
 */
export function reanalyzePlan(chosen: TCandidateRow[], pending: TCandidateRow[]): TReanalyzePlan {
  const posts = [...new Set(chosen.map((row) => row.post_url).filter((url): url is string => Boolean(url)))];
  const inPosts = new Set(posts);
  const hit = pending.filter((row) => row.status === 'pending' && row.post_url && inPosts.has(row.post_url));
  const edited = (row: TCandidateRow) => Boolean(row.reviewer_note?.includes(EDITED_NOTE));
  return { posts, lay: hit.filter((row) => !edited(row)), keep: hit.filter(edited) };
}

/** 확인 문장 — 누르기 전에 무엇이 바뀌는지(지우지 않는다, 수집 완료로 되돌린다). 숫자가 유일한 단서라(형제 후보는 화면의 다른 줄이다) 셋 다 적는다. */
export function reanalyzeSummary(plan: TReanalyzePlan): string {
  const kept = plan.keep.length ? `이미 등록한 장소와 사람이 고친 후보 ${plan.keep.length}건은` : '이미 등록한 장소는';
  // 고친 후보가 있을 때만 — 다시 읽어도 그 (글, 가게) 는 새로 만들지 않는다(analyze-candidates 의 `editedKeysFor`, D3).
  const again = plan.keep.length ? ' 다시 읽어도 그 가게는 새로 만들지 않아요.' : '';
  return `글 ${plan.posts.length}건을 수집 완료로 되돌려요. 그 글에서 나온 검수 대기 후보 ${plan.lay.length}건(다른 줄 포함)은 목록에서 빠져요 — DB 에는 '재분석' 표시로 남아요. ${kept} 그대로예요.${again} 다음 분석이 다시 읽어요.`;
}

const failIf = (step: string, error: { message: string } | null) => {
  if (error) throw new Error(`${step}: ${error.message}`);
};

/** 규칙 4 의 순서대로 쓴다. 실패하면 어느 단계인지 붙여 던진다 — 후보만 눕고 글이 안 돌아간 상태는 다시 누르면 이어진다. */
export async function prepareReanalyze(client: SupabaseClient, plan: TReanalyzePlan): Promise<void> {
  for (const row of plan.lay) {
    const { error } = await client
      .from('candidates')
      .update({ status: 'rejected', reviewer_note: appendReviewerNote(row.reviewer_note, REANALYZE_NOTE) })
      .eq('id', row.id);
    failIf('후보 눕히기', error);
  }
  // `requested_at` 도 찍는다 — 상주 워커(`pnpm data`)의 자동 분석은 사람이 요청한 글만 읽는다(ADR-024 결정 4). 안 찍으면 저수지에 섞여 기다린다.
  const requestedAt = new Date().toISOString();
  for (const url of plan.posts) {
    const { error } = await client.from('blog_posts').update({ analyzed_at: null, requested_at: requestedAt }).eq('url', url);
    failIf('글 되돌리기', error);
  }
}
