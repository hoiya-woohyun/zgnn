'use client';

import { useState } from 'react';
import { Button } from '../components/base/button';
import { Input } from '../components/base/input';
import { REJECT_REASONS, type TRejectReason } from '../lib/adminCandidates';

type TAdminPageRejectFormProps = {
  busy: boolean;
  onCancel: () => void;
  onSubmit: (reason: TRejectReason, note: string) => void;
};

/**
 * 반려 사유. 칩을 먼저 고르게 하는 이유 — 자유 입력만 두면 매번 다른 말이 적혀 나중에 "왜 반려했나" 를 셀 수 없다.
 * 메모는 선택이다(브리프 결정 8). 사유 없이 반려하는 길은 두지 않는다 — 사유가 없으면 같은 글이 다음 분석에 또 올라온다.
 */
export function AdminPageRejectForm({ busy, onCancel, onSubmit }: TAdminPageRejectFormProps) {
  const [reason, setReason] = useState<TRejectReason | null>(null);
  const [note, setNote] = useState('');

  return (
    <div className="border-t border-secondary px-4 py-4">
      <p className="text-sm font-semibold text-secondary">왜 아닌가요?</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {REJECT_REASONS.map((candidate) => (
          <Button
            key={candidate}
            size="sm"
            color={reason === candidate ? 'primary' : 'secondary'}
            aria-pressed={reason === candidate}
            className="h-11"
            isDisabled={busy}
            onClick={() => setReason(candidate)}
          >
            {candidate}
          </Button>
        ))}
      </div>

      <div className="mt-3">
        <Input
          aria-label="반려 메모(선택)"
          placeholder="메모 (선택)"
          value={note}
          onChange={setNote}
          isDisabled={busy}
          size="lg"
        />
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <Button
          color="primary-destructive"
          size="lg"
          className="sm:flex-1"
          isDisabled={busy || !reason}
          isLoading={busy}
          onClick={() => reason && onSubmit(reason, note)}
        >
          {busy ? '반려하고 있어요…' : '반려하기'}
        </Button>
        <Button color="secondary" size="lg" className="sm:flex-1" isDisabled={busy} onClick={onCancel}>
          취소
        </Button>
      </div>
      {!reason && <p className="mt-2 text-xs text-tertiary">사유를 하나 골라 주세요.</p>}
    </div>
  );
}
