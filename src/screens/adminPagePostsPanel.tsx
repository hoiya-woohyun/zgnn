'use client';

import type { TPostCounts } from '../lib/adminPosts';

type TAdminPagePostsPanelProps = {
  /** undefined = 아직 못 셌다(조회 중이거나 실패 — `error` 가 이유). 건수 자체는 머리글(`PageHeader`)이 말한다. */
  counts?: TPostCounts;
  error?: string;
};

/**
 * 수집 완료 칸(`blog_posts`, 09 D4·D5) — 이 태스크에서는 **다음 명령만** 말한다(글 목록·글 단위 분석 제외는 T3.2).
 *
 * 버튼이 아니라 명령을 적는 이유: 수집·분석은 네이버 키와 `claude -p` 구독이 있는 사용자 터미널에서만 돈다(ADR-016) —
 * 화면에 버튼이 있으면 운영자가 그것이 분석을 돌린다고 믿는다.
 */
export function AdminPagePostsPanel({ counts, error }: TAdminPagePostsPanelProps) {
  if (error) return <p className="px-4 pt-6 text-sm text-error-primary md:px-6">{error}</p>;
  if (!counts) return <p className="px-4 pt-6 text-sm text-tertiary md:px-6">수집한 글을 세고 있어요</p>;
  return (
    <div className="space-y-2 px-4 pt-6 text-sm text-secondary md:px-6">
      {counts.unanalyzed > 0 ? (
        <p>
          미분석 {counts.unanalyzed.toLocaleString('ko-KR')}건 — 터미널에서 <code>pnpm data:analyze --limit 30</code> 를 돌리면 읽어요.
        </p>
      ) : (
        <p>미분석 글이 없어요 — 새 글은 터미널에서 <code>pnpm data:collect</code> 로 모아요.</p>
      )}
      {counts.excluded === null ? (
        <p className="text-xs text-tertiary">글 단위 분석 제외는 DB 마이그레이션이 적용된 뒤에 쓸 수 있어요(미적용).</p>
      ) : null}
    </div>
  );
}
