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
  /** 고른 것 중 최신본으로 저장할 수 있는 묶음 수 — 버튼 라벨에 싣고 0 이면 끈다. */
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
  approve: { title: (n) => `고른 ${n}묶음을 올릴까요?`, button: '올리기', destructive: false },
  latest: { title: () => '고른 것을 최신본으로 저장할까요?', button: '최신본으로 저장', destructive: false },
  reanalyze: { title: (n) => `고른 ${n}묶음의 분석을 지우고 다시 읽을까요?`, button: '분석 지우기', destructive: true },
};

/**
 * 표 위의 **일괄 처리 줄** — 체크한 줄들에 한 번에 거는 동작 넷(2026-09-30): 올리기 · 최신본으로 저장 · 반려 · 재분석 준비.
 *
 * 반려 하나뿐이던 자리다. 재분석 뒤 같은 판단을 수십 줄에 되풀이하는 일(모두 올리기, 모두 새 값으로 덮기)을 한 줄씩 눌러야 했다
 * (사용자 요청: 복수 처리의 관점에서). 한 줄 버튼과 **같은 함수**를 차례로 부르므로 가드도 같다 — 사람이 골라야 하는 줄
 * (닮은 곳·내린 곳)은 건너뛰고 그 줄에 패널을 띄워 둔다.
 *
 * - **버튼은 늘 보인다**(고른 게 없으면 꺼져 있다). 고른 뒤에만 나타나면 이런 동작이 있다는 것 자체를 모른다.
 * - **표 위에 붙는다**(sticky, 머리 줄 56px 아래). 줄을 내려가며 고르다 보면 이 줄이 화면 밖으로 나가 다시 올라와야 했다.
 *   `fixed` 가 아니라 `sticky` 다 — `<main>` 안의 `fixed` 는 스와이프 중에 어긋난다(CLAUDE.md).
 * - **확인은 하나씩만 열린다**(`mode`). 반려는 사유 폼, 나머지는 무엇이 일어나는지 한 문장 + 버튼.
 * - **결과 한 줄은 목록이 비어도 남는다** — 전부 처리한 직후 이 줄까지 사라지면 방금 한 일이 됐는지 말해 주는 것이 없다.
 *
 * 전부 고르기는 표 머리글의 체크박스다. 좁은 화면에서는 머리글이 없어 여기 남긴다(`md:hidden`).
 * 그것이 고르는 것은 **걸러 보기에 걸린 전부**다(무한 스크롤로 아직 안 그린 줄까지) — 그래서 수를 여기 적어 둔다.
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
  return (
    <div
      className={cx(
        'z-10 mt-3 border-y border-secondary px-4 py-2 md:sticky md:top-14 md:px-6',
        // 고른 것이 있으면 줄 자체가 달라 보여야 한다 — 아래 표에서 눈을 뗀 사이에 골라 둔 것을 잊는 자리다.
        picked ? 'bg-brand-primary' : 'bg-secondary',
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
            label={<span className="text-xs text-secondary">걸러 보기에 걸린 {visibleCount}묶음 전부 고르기</span>}
          />
        </div>
        <span className={cx('text-xs', picked ? 'font-semibold text-primary' : 'text-tertiary')}>
          {picked ? `${selectedCount}묶음 골랐어요` : '줄 앞 체크박스로 골라 한 번에 처리해요'}
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button color="primary" size="sm" isDisabled={!picked || locked} onClick={() => onStart('approve')}>
            고른 것 올리기
          </Button>
          <Button color="secondary" size="sm" isDisabled={!picked || locked || latestCount === 0} onClick={() => onStart('latest')}>
            최신본으로 저장{picked ? ` · ${latestCount}` : ''}
          </Button>
          <Button color="secondary" size="sm" isDisabled={!picked || locked} onClick={() => onStart('reject')}>
            반려하기
          </Button>
          <Button color="secondary" size="sm" isDisabled={!picked || locked} onClick={() => onStart('reanalyze')}>
            재분석 준비
          </Button>
          {picked && (
            <Button color="link-gray" size="sm" isDisabled={busy} onClick={onClear}>
              선택 해제
            </Button>
          )}
        </div>
      </div>

      {summary ? <p className="mt-1.5 text-xs text-success-primary">{summary}</p> : null}
      {error ? <p className="mt-1.5 text-xs text-error-primary">{error}</p> : null}

      {confirm && confirmText ? (
        <div className="mt-2 max-w-2xl space-y-1.5 rounded-lg border border-secondary bg-primary px-3 py-2">
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
