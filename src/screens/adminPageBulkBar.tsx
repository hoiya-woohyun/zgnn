'use client';

import { Button } from '../components/base/button';
import { Checkbox } from '../components/base/checkbox';
import type { TRejectReason } from '../lib/adminCandidates';
import { cx } from '../utils/cx';
import { AdminPageRejectForm } from './adminPageRejectForm';

type TAdminPageBulkBarProps = {
  /** 고른 묶음 수. */
  selectedCount: number;
  /** 지금 걸러 보기에 걸린 묶음 수 — **화면에 그린 수가 아니다**(무한 스크롤로 아직 안 그린 것도 포함). */
  visibleCount: number;
  allSelected: boolean;
  busy: boolean;
  rejecting: boolean;
  /** 끝난 뒤 한 줄(`summarizeBulkReject`). 실패가 섞이면 이 줄이 그것을 말한다. */
  summary?: string;
  error?: string;
  onToggleAll: (selected: boolean) => void;
  onClear: () => void;
  onStartReject: () => void;
  onCancelReject: () => void;
  onReject: (reason: TRejectReason, note: string) => void;
  /** 재분석 확인이 열려 있다. 확인 문장은 형제 후보까지 센 것이라 페이지가 만든다. */
  reanalyzing: boolean;
  reanalyzeText?: string;
  onStartReanalyze: () => void;
  onReanalyze: () => void;
};

/**
 * 여러 묶음을 한 번에 반려하는 줄. 표 **위**에 두고, 표 안의 체크박스와 짝을 이룬다.
 *
 * **전부 고르기는 2026-09-30 에 표 머리글로 옮겼다**(`AdminTable` 의 `selectAll`) — 표 안의 체크박스들 맨 위가
 * 그 일을 하는 자리로 읽히기 때문이다. 여기 두었던 두 이유는 이렇게 살렸다:
 *  1) 머리글은 `md` 이상에서만 보인다. 그래서 이 체크박스는 **`md` 미만에서만** 남긴다 — 좁은 화면에서
 *     전부 고르기가 통째로 사라지지 않게.
 *  2) **개수를 말해야 한다.** 무한 스크롤이라 "보이는 것" 과 "걸러 보기에 걸린 것" 이 다르고, 고르는 것은
 *     뒤쪽이다 — 141묶음 중 40묶음만 그려진 상태에서 눌러도 141묶음이 골라진다. `md` 이상에서는 그 수를
 *     **글자 줄**로 남기고(컨트롤은 머리글에), 머리글 체크박스는 같은 말을 `aria-label` 로 싣는다.
 *
 * 반려 폼은 카드 안의 것과 **같은 컴포넌트**다(`AdminPageRejectForm`). 사유 칩을 두 벌로 두면 한쪽에만 칩이
 * 늘어나는 날이 오고, 그러면 `reviewer_note` 의 말이 어디서 반려했느냐에 따라 달라진다.
 */
export function AdminPageBulkBar({
  selectedCount,
  visibleCount,
  allSelected,
  busy,
  rejecting,
  summary,
  error,
  onToggleAll,
  onClear,
  onStartReject,
  onCancelReject,
  onReject,
  reanalyzing,
  reanalyzeText,
  onStartReanalyze,
  onReanalyze,
}: TAdminPageBulkBarProps) {
  const picked = selectedCount > 0;
  return (
    <div
      className={cx(
        'mt-3 border-y border-secondary px-4 py-2 md:px-6',
        // 고른 것이 있으면 줄 자체가 달라 보여야 한다 — 아래 표에서 눈을 뗀 사이에 골라 둔 것을 잊는 자리다.
        picked ? 'bg-brand-primary' : 'bg-secondary',
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="md:hidden">
          <Checkbox
            size="sm"
            isSelected={allSelected}
            /* 일부만 골랐을 때 '전부 골랐다' 로 보이면, 한 번 더 누르면 풀릴 줄 알고 눌렀다가 나머지가 켜진다. */
            isIndeterminate={picked && !allSelected}
            isDisabled={busy || visibleCount === 0}
            onChange={onToggleAll}
            label={
              <span className="text-xs text-secondary">걸러 보기에 걸린 {visibleCount}묶음 전부 고르기</span>
            }
          />
        </div>
        {/*
          * `md` 이상에서는 컨트롤이 머리글에 있으므로 **숫자만** 남긴다. 이 줄을 지우면 "걸러 보기에 걸린 것" 이
          * 몇인지 말하는 곳이 화면에서 사라지고, 그러면 머리글 체크박스가 보이는 줄만 고른다는 오해가 남는다.
          */}
        <span className="hidden text-xs text-secondary md:inline">걸러 보기에 걸린 {visibleCount}묶음</span>
        {picked ? (
          <>
            <span className="text-xs font-semibold text-primary">{selectedCount}묶음 골랐어요</span>
            <Button color="primary-destructive" size="sm" isDisabled={busy || rejecting} onClick={onStartReject}>
              고른 것 반려하기
            </Button>
            {/* 프롬프트를 고친 날 쌓인 후보를 통째로 다시 읽히는 길 — 반려와 달리 글이 재분석 대기로 돌아간다. */}
            <Button color="secondary" size="sm" isDisabled={busy || rejecting || reanalyzing} onClick={onStartReanalyze}>
              고른 것 재분석 준비
            </Button>
            <Button color="link-gray" size="sm" isDisabled={busy} onClick={onClear}>
              선택 해제
            </Button>
          </>
        ) : null}
      </div>

      {/*
        * 결과는 **골라 둔 것이 사라진 뒤에도** 남아야 한다 — 141줄이 한꺼번에 없어진 화면에서 이 한 줄이
        * 없으면 "눌렀는데 목록만 비었다" 가 된다. 실패가 섞였으면 같은 줄이 그것을 말한다(`summarizeBulkReject`).
        */}
      {summary ? <p className="mt-1.5 text-xs text-success-primary">{summary}</p> : null}
      {error ? <p className="mt-1.5 text-xs text-error-primary">{error}</p> : null}

      {reanalyzing && reanalyzeText ? (
        <div className="mt-2 max-w-2xl space-y-1.5 rounded-lg bg-primary px-3 py-2">
          <p className="text-xs font-semibold text-primary">고른 {selectedCount}묶음의 분석을 지우고 다시 읽을까요?</p>
          <p className="text-xs text-secondary">{reanalyzeText}</p>
          <p className="text-xs text-tertiary">
            눕힌 후보는 반려 목록에 남아요. 그다음 터미널에서 <code>pnpm data:analyze</code> 를 돌려 주세요.
          </p>
          <div className="flex gap-2">
            <Button color="primary-destructive" size="sm" isDisabled={busy} isLoading={busy} onClick={onReanalyze}>
              분석 지우기
            </Button>
            <Button color="secondary" size="sm" isDisabled={busy} onClick={onCancelReject}>
              취소
            </Button>
          </div>
        </div>
      ) : null}

      {rejecting ? (
        <div className="-mx-4 mt-2 md:-mx-6">
          <AdminPageRejectForm busy={busy} count={selectedCount} onCancel={onCancelReject} onSubmit={onReject} />
        </div>
      ) : null}
    </div>
  );
}
