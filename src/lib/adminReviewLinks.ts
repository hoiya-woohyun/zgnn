/**
 * 후기 글 주소 점검(14 W261019.4) — `pnpm data links` 가 `review_link_checks` 에 남긴 결과를 /admin 이 읽는다.
 * 점검은 `places` 가 아닌 별도 표에 적는다(places 의 update 는 재빌드를 건다 — 마이그레이션 20261019120000 머리 주석).
 * 사이트는 읽지 않는다. 운영자가 장소 목록 줄에서 "후기 글이 지워졌다" 를 보고 출처를 갈아 끼운다.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { isTableMissing } from '../../scripts/lib/collectRequests.mjs';
import { selectAllPages } from '../../scripts/lib/selectAllPages.mjs';

/** `review_link_checks` 한 줄. `state` 는 alive · gone · unknown. */
export type TReviewLinkCheck = { place_id: string; url: string; state: string; detail: string | null; checked_at: string };

/**
 * 장소 id → 점검 결과. **표가 아직 원격에 없으면**(🧑 `db push` 전) 빈 맵으로 물러난다 — 경고가 없는 것일 뿐 화면은 그대로다.
 * 그 밖의 실패는 던진다(부르는 쪽이 화면을 막지 않고 경고만 남긴다).
 */
export async function fetchReviewLinkChecks(client: SupabaseClient): Promise<Map<string, TReviewLinkCheck>> {
  const { data, error } = await selectAllPages((from: number, to: number) =>
    client.from('review_link_checks').select('place_id, url, state, detail, checked_at').order('place_id').range(from, to),
  );
  if (error) {
    if (isTableMissing(error)) return new Map();
    throw new Error(`후기 주소 점검 조회: ${error.message}`);
  }
  return new Map(((data ?? []) as TReviewLinkCheck[]).map((row) => [row.place_id, row]));
}

/** 서울 시각의 `10월 19일`. */
function kstMonthDay(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric' }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${get('month')}월 ${get('day')}일`;
}

/**
 * 줄에 띄울 경고 한 줄 — 삭제·비공개(`gone`)이고 **점검한 주소가 지금 후기 주소와 같을 때만**이다.
 * 운영자가 후기를 갈아 끼우면 묵은 결과가 저절로 꺼진다. `unknown`(차단·점검·네트워크)은 운영자가 할 수 있는 일이 없어 말하지 않는다.
 */
export function reviewLinkProblem(check: TReviewLinkCheck | undefined, reviewUrl: string | null | undefined): string | null {
  if (!check || check.state !== 'gone') return null;
  if (check.url.trim() !== (reviewUrl ?? '').trim()) return null;
  return `후기 글을 읽을 수 없어요 — ${check.detail ?? '삭제되었거나 비공개예요'} · ${kstMonthDay(check.checked_at)} 확인`;
}
