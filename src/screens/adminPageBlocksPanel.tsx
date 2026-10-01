'use client';

import type { TBlocksSummary } from '../lib/adminBlocks';

type TAdminPageBlocksPanelProps = {
  /** undefined = 아직 못 읽었다. 건수는 머리글(`PageHeader`)이 말한다. */
  summary?: TBlocksSummary;
};

/**
 * 블랙리스트 칸(`place_blocks`, 09 D6) — 라벨·건수·`미적용` 만 먼저 선다. 목록·풀기·기간 바꾸기는 T1.5.
 * 표가 원격에 없으면 "0건" 이 아니라 적용이 안 됐다고 말한다(09 「실행 규약」).
 */
export function AdminPageBlocksPanel({ summary }: TAdminPageBlocksPanelProps) {
  if (!summary) return <p className="px-4 pt-6 text-sm text-tertiary md:px-6">블랙리스트를 읽고 있어요</p>;
  if (summary.kind === 'unavailable') {
    return (
      <p className="px-4 pt-6 text-sm text-tertiary md:px-6">
        블랙리스트 표가 아직 적용되지 않았어요 — DB 마이그레이션이 적용되면 여기 보여요.
      </p>
    );
  }
  if (summary.kind === 'error') {
    return <p className="px-4 pt-6 text-sm text-error-primary md:px-6">블랙리스트를 읽지 못했어요 ({summary.message})</p>;
  }
  return <p className="px-4 pt-6 text-sm text-tertiary md:px-6">막고 있는 가게의 목록과 풀기·기간 바꾸기는 이 칸에 이어서 붙어요.</p>;
}
