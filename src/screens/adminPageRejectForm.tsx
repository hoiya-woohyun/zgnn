'use client';

import { useState } from 'react';
import { Button } from '../components/base/button';
import { Input } from '../components/base/input';
import { NO_AUTOFILL } from '../components/noAutofill';
import { BLOCK_CHOICE_LABEL, BLOCK_CHOICES, defaultBlockFor, type TBlockChoice } from '../lib/adminBlocks';
import { REJECT_REASON_HINT, REJECT_REASONS, type TRejectReason } from '../lib/adminCandidates';
import { AdminFilterChip } from './adminFilterChip';

type TAdminPageRejectFormProps = {
  busy: boolean;
  onCancel: () => void;
  onSubmit: (reason: TRejectReason, note: string, block: TBlockChoice) => void;
  /**
   * 한 번에 반려할 묶음 수. 한 줄(카드 안)에서는 주지 않는다 — 그 자리는 무엇을 버리는지 위에 펼쳐져 있다.
   * 일괄 반려에서는 **숫자가 유일한 단서**라 되돌릴 수 없다는 경고와 버튼 라벨에 함께 싣는다.
   */
  count?: number;
  /** 결정 레일 안에서 열린다 — 자기 윗선·여백 없이 레일의 흐름을 따른다(`AdminPageGroupActions`). */
  inline?: boolean;
  /** 사유 칩 묶음. 기본은 신규용(`REJECT_REASONS`), 갱신 묶음은 `UPDATE_REJECT_REASONS`(11 T1.5). */
  reasons?: readonly TRejectReason[];
};

/**
 * 제외 사유 + 블랙리스트 기간(ADR-020). 둘째 줄의 기간은 사유를 고르면 기본값이 따라 바뀐다(사람이 바꾼 뒤엔 안 따라간다).
 * **클릭 수는 반려만 하던 때와 같다** — 사유 칩 → 바로 제출. 기간 칸을 한 번 더 누르게 하면 운영자가 제외를 피하고 등록으로 흐른다.
 *
 * 반려 사유. 칩을 먼저 고르게 하는 이유 — 자유 입력만 두면 매번 다른 말이 적혀 나중에 "왜 반려했나" 를 셀 수 없다.
 * 메모는 선택이다(브리프 결정 8). 사유 없이 반려하는 길은 두지 않는다 — 사유가 없으면 같은 글이 다음 분석에 또 올라온다.
 */
export function AdminPageRejectForm({ busy, onCancel, onSubmit, count, inline = false, reasons = REJECT_REASONS }: TAdminPageRejectFormProps) {
  const [reason, setReason] = useState<TRejectReason | null>(null);
  const [note, setNote] = useState('');
  const [block, setBlock] = useState<TBlockChoice>('none');
  const [blockTouched, setBlockTouched] = useState(false);

  const pickReason = (candidate: TRejectReason) => {
    setReason(candidate);
    if (!blockTouched) setBlock(defaultBlockFor(candidate));
  };

  return (
    <div className={inline ? undefined : 'border-t border-dashed border-tertiary px-4 py-3'}>
      <p className="text-xs font-semibold text-secondary">왜 제외하나요?</p>
      {/* 되돌릴 수 없다는 사실은 라벨이 아니라 이 줄이 전한다. 단위를 '글' 로 쓰면 틀린다(묶음은 여러 글이다). */}
      <p className="mt-1 text-xs text-tertiary">
        {count == null ? '제외하면' : `고른 ${count}곳을 제외해요. 제외하면`} 목록에서 사라져요. 화면에서는 되돌릴 수
        없어요.
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {reasons.map((candidate) => (
          <AdminFilterChip key={candidate} pressed={reason === candidate} isDisabled={busy} onClick={() => pickReason(candidate)}>
            {candidate}
          </AdminFilterChip>
        ))}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-semibold text-secondary">블랙리스트에</span>
        {BLOCK_CHOICES.map((choice) => (
          <AdminFilterChip
            key={choice}
            pressed={block === choice}
            isDisabled={busy}
            onClick={() => {
              setBlock(choice);
              setBlockTouched(true);
            }}
          >
            {BLOCK_CHOICE_LABEL[choice]}
          </AdminFilterChip>
        ))}
      </div>

      <div className="mt-2 max-w-md">
        <Input
          aria-label="제외 메모(선택)"
          {...NO_AUTOFILL}
          placeholder="메모 (선택)"
          value={note}
          onChange={setNote}
          isDisabled={busy}
          size="sm"
        />
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        <Button
          color="primary-destructive"
          size="sm"
          isDisabled={busy || !reason}
          isLoading={busy}
          onClick={() => reason && onSubmit(reason, note, block)}
        >
          {busy ? '제외하고 있어요…' : `${count == null ? '제외' : `${count}곳 제외`}${block === 'none' ? '' : ` · 블랙리스트 ${BLOCK_CHOICE_LABEL[block]}`}`}
        </Button>
        <Button color="secondary" size="sm" isDisabled={busy} onClick={onCancel}>
          취소
        </Button>
      </div>
      {/* 고르기 전엔 재촉, 고른 뒤엔 그 칩의 뜻 — 같은 자리라 레이아웃이 흔들리지 않는다. */}
      <p className="mt-2 text-xs text-tertiary">{reason ? REJECT_REASON_HINT[reason] : '사유를 하나 골라 주세요.'}</p>
    </div>
  );
}
