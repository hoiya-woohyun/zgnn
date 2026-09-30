'use client';

import { Button } from '../components/base/button';
import { Checkbox } from '../components/base/checkbox';
import type { TRejectReason } from '../lib/adminCandidates';
import { cx } from '../utils/cx';
import { AdminPageRejectForm } from './adminPageRejectForm';

type TBulkMode = 'reject' | 'reanalyze' | 'approve' | 'latest';

type TAdminPageBulkBarProps = {
  selectedCount: number;
  visibleCount: number;
  allSelected: boolean;
  busy: boolean;
  /** 지금 열린 확인 하나. 반려는 사유 폼, 나머지는 확인 문장 + 버튼. */
  mode?: TBulkMode;
  summary?: string;
  error?: string;
  /** 고른 것 중 덮어쓸 수 있는 곳 수 — 버튼 라벨에 싣고 0 이면 버튼을 안 그린다. */
  latestCount: number;
  /** 확인 문장 — 형제 후보·건너뛰는 줄까지 세려면 목록 전체가 필요해 페이지가 만든다. */
  confirmText?: string;
  onToggleAll: (selected: boolean) => void;
  onClear: () => void;
  onStart: (mode: TBulkMode) => void;
  onCancel: () => void;
  onReject: (reason: TRejectReason, note: string) => void;
  onConfirm: () => void;
};

const CONFIRM: Record<Exclude<TBulkMode, 'reject'>, { title: (n: number) => string; button: string; destructive: boolean }> = {
  approve: { title: (n) => `고른 ${n}곳을 올릴까요?`, button: '올리기', destructive: false },
  latest: { title: () => '고른 것을 덮어쓸까요?', button: '덮어쓰기', destructive: false },
  reanalyze: { title: (n) => `고른 ${n}곳을 재분석할까요?`, button: '재분석', destructive: true },
};

/**
 * 표 위의 **일괄 처리 줄** — 체크한 줄들에 한 번에 거는 동작 넷: 올리기 · 덮어쓰기 · 반려 · 재분석.
 *
 * **고른 뒤에만 나타난다**(2026-09-30 v2). 늘 떠 있던 동안 버튼 대부분이 꺼진 채였고, 꺼진 `고른 것 올리기` 도 핑크라
 * 눌리는 것처럼 보였다. 펼친 줄에도 같은 동작이 있어 두 겹이었는데, 둘을 **맥락으로** 가른다 — 여기는 "고른 것들", 펼친 줄은 "이 줄".
 * 이런 동작이 있다는 것은 줄 앞 체크박스가 말한다(고르면 이 줄이 뜬다).
 *
 * - `덮어쓰기` 는 고른 것 중 덮을 수 있는 게 있을 때만 선다 — 지금 `기존` 후보가 0건이라 늘 꺼져 있던 버튼이다.
 * - **표 위에 붙는다**(sticky). `fixed` 가 아니라 `sticky` 다 — `<main>` 안의 `fixed` 는 스와이프 중에 어긋난다(CLAUDE.md).
 *   `/admin` 에는 셸의 뒤로가기 줄이 없으므로(`appShell` 의 `bare`) 맨 위에 붙는다.
 * - **확인은 하나씩만 열린다**(`mode`). 반려는 사유 폼, 나머지는 무엇이 일어나는지 한 문장 + 버튼.
 * - **결과 한 줄은 목록이 비어도·고른 것이 없어도 남는다** — 전부 처리한 직후 이 줄까지 사라지면 방금 한 일이 됐는지 말해 주는 것이 없다.
 *
 * 전부 고르기는 표 머리글의 체크박스다. 좁은 화면에서는 머리글이 없어 여기 남긴다(`md:hidden` — 그 폭에서는 이 줄이 늘 선다).
 */
export function AdminPageBulkBar({
  selectedCount,
  visibleCount,
  allSelected,
  busy,
  mode,
  summary,
  error,
  latestCount,
  confirmText,
  onToggleAll,
  onClear,
  onStart,
  onCancel,
  onReject,
  onConfirm,
}: TAdminPageBulkBarProps) {
  const picked = selectedCount > 0;
  const locked = busy || Boolean(mode);
  const confirm = mode && mode !== 'reject' ? CONFIRM[mode] : null;
  const active = picked || Boolean(mode) || busy;
  const said = Boolean(summary || error);
  return (
    <div
      className={cx(
        'z-10 mt-3 border-y border-secondary px-4 py-2 md:sticky md:top-0 md:px-6',
        // 고른 것이 있으면 줄 자체가 달라 보여야 한다 — 아래 표에서 눈을 뗀 사이에 골라 둔 것을 잊는 자리다.
        active ? 'bg-brand-primary' : 'bg-secondary',
        // 고른 것도 할 말도 없으면 넓은 화면에서는 사라진다(좁은 화면은 전부 고르기가 여기 있어 남는다).
        !active && !said && 'md:hidden',
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="md:hidden">
          <Checkbox
            size="sm"
            isSelected={allSelected}
            isIndeterminate={picked && !allSelected}
            isDisabled={busy || visibleCount === 0}
            onChange={onToggleAll}
            label={<span className="text-xs text-secondary">걸러 보기에 걸린 {visibleCount}곳 전부 고르기</span>}
          />
        </div>
        {active && (
          <>
            <span className="text-xs font-semibold text-primary">{selectedCount}곳 고름</span>
            <div className="flex flex-wrap items-center gap-1.5">
              <Button color="primary" size="sm" isDisabled={!picked || locked} onClick={() => onStart('approve')}>
                올리기
              </Button>
              {latestCount > 0 && (
                <Button color="secondary" size="sm" isDisabled={locked} onClick={() => onStart('latest')}>
                  덮어쓰기 · {latestCount}곳
                </Button>
              )}
              <Button color="tertiary" size="sm" isDisabled={!picked || locked} onClick={() => onStart('reject')}>
                반려
              </Button>
              <Button color="tertiary" size="sm" isDisabled={!picked || locked} onClick={() => onStart('reanalyze')}>
                재분석
              </Button>
              <Button color="link-gray" size="sm" className="ml-1" isDisabled={busy} onClick={onClear}>
                선택 해제
              </Button>
            </div>
          </>
        )}
      </div>

      {summary ? <p className="mt-1.5 text-xs text-success-primary">{summary}</p> : null}
      {error ? <p className="mt-1.5 text-xs text-error-primary">{error}</p> : null}

      {confirm && confirmText ? (
        <div className="mt-2 max-w-2xl space-y-1.5 border-t border-secondary pt-2">
          <p className="text-xs font-semibold text-primary">{confirm.title(selectedCount)}</p>
          <p className="text-xs text-secondary">{confirmText}</p>
          {mode === 'reanalyze' && (
            <p className="text-xs text-tertiary">
              눕힌 후보는 반려 목록에 남아요. 그다음 터미널에서 <code>pnpm data:analyze</code> 를 돌려 주세요.
            </p>
          )}
          <div className="flex gap-2">
            <Button
              color={confirm.destructive ? 'primary-destructive' : 'primary'}
              size="sm"
              isDisabled={busy}
              isLoading={busy}
              onClick={onConfirm}
            >
              {confirm.button}
            </Button>
            <Button color="secondary" size="sm" isDisabled={busy} onClick={onCancel}>
              취소
            </Button>
          </div>
        </div>
      ) : null}

      {mode === 'reject' ? (
        <div className="-mx-4 mt-2 md:-mx-6">
          <AdminPageRejectForm busy={busy} count={selectedCount} onCancel={onCancel} onSubmit={onReject} />
        </div>
      ) : null}
    </div>
  );
}
