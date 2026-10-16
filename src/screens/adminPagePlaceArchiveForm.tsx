'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '../components/base/button';
import { Input } from '../components/base/input';
import { NO_AUTOFILL } from '../components/noAutofill';
import { BLOCK_CHOICE_LABEL, BLOCK_CHOICES, defaultBlockFor, type TBlockChoice } from '../lib/adminBlocks';
import { ARCHIVE_REASONS, type TArchiveReason } from '../lib/adminPlaces';
import { cx } from '../utils/cx';
import { AdminFilterChip } from './adminFilterChip';
import { ADMIN_PANEL_DIVIDER } from './adminTable';

type TAdminPagePlaceArchiveFormProps = {
  wasDraft: boolean;
  busy: boolean;
  /** 열 때 미리 고를 사유 — 폐업 제보에서 열면 `폐업`(10 T1.4). */
  initialReason?: TArchiveReason;
  onCancel: () => void;
  onSubmit: (reason: TArchiveReason, note: string, block: TBlockChoice) => void;
};

/**
 * 등록 해제 사유 + 블랙리스트 기간(09 T1.4 · ADR-020). 반려 폼(`adminPageRejectForm`)과 같은 두 줄이다 —
 * 사유를 고르면 기간 기본값이 따라 바뀌고(`폐업` → 영구), 사람이 바꾼 뒤엔 안 따라간다.
 *
 * 줄(`adminPagePlaceRow`)에서 떼어 낸 이유: 사유·메모가 줄의 state 였던 동안 취소해도 남았다(09 T6.8).
 * 폼이 자기 state 를 가지면 닫히는 순간 언마운트되어 비워진다.
 */
export function AdminPagePlaceArchiveForm({ wasDraft, busy, initialReason, onCancel, onSubmit }: TAdminPagePlaceArchiveFormProps) {
  const [reason, setReason] = useState<TArchiveReason | null>(initialReason ?? null);
  const [note, setNote] = useState('');
  const [block, setBlock] = useState<TBlockChoice>(defaultBlockFor(initialReason));
  const [blockTouched, setBlockTouched] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  /*
   * 열리는 순간 폼을 화면 안으로(14 W261010.28) — 폼은 줄 머리 바로 밑에 서지만, 제보 판의 `등록 해제… (폐업)` 처럼 펼친 판 아래에서 열면
   * 화면 위로 비켜 있다. `nearest` 라 이미 보이면 움직이지 않는다. 포커스도 옮겨 키보드·스크린리더가 "왜 등록 해제하나요?" 에서 시작한다.
   */
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    box.scrollIntoView?.({ block: 'nearest' });
    box.focus({ preventScroll: true });
  }, []);

  const pickReason = (candidate: TArchiveReason) => {
    setReason(candidate);
    if (!blockTouched) setBlock(defaultBlockFor(candidate));
  };

  return (
    <div ref={boxRef} tabIndex={-1} role="group" aria-label="등록 해제 사유" className={cx(ADMIN_PANEL_DIVIDER, 'px-4 py-3 outline-none')}>
      <p className="text-xs font-semibold text-secondary">왜 등록 해제하나요?</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {ARCHIVE_REASONS.map((candidate) => (
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
        <Input {...NO_AUTOFILL} aria-label="등록 해제 메모(선택)" placeholder="메모 (선택)" value={note} onChange={setNote} isDisabled={busy} size="sm" />
      </div>

      {/* 거짓말을 하지 않는 자리다 — DB 에서 내려도 사이트에서 사라지는 것은 다음 빌드부터다(ADR-015). */}
      <p className="mt-2 text-xs text-tertiary">
        {wasDraft
          ? '등록 해제하면 ‘등록 해제’ 칸으로 옮겨져요. 사이트에는 원래 없던 곳이에요.'
          : '등록 해제하면 다음 빌드부터 사이트에서 사라져요. 되살리려면 ‘등록 해제’ 칸에서 찾으면 돼요.'}
        {block === 'none'
          ? ' 이 가게를 쓴 새 글은 다시 검수 대기로 올라와요.'
          : ` 블랙리스트에 있는 동안 이 가게를 쓴 새 글은 후보가 되지 않아요. 되살리면 풀려요.`}
      </p>

      <div className="mt-2 flex flex-wrap gap-2">
        <Button
          color="primary-destructive"
          size="sm"
          isDisabled={busy || !reason}
          isLoading={busy}
          onClick={() => reason && onSubmit(reason, note, block)}
        >
          {busy ? '등록 해제하고 있어요…' : `등록 해제${block === 'none' ? '' : ` · 블랙리스트 ${BLOCK_CHOICE_LABEL[block]}`}`}
        </Button>
        <Button color="secondary" size="sm" isDisabled={busy} onClick={onCancel}>
          취소
        </Button>
      </div>
      {!reason && <p className="mt-2 text-xs text-tertiary">사유를 하나 골라 주세요.</p>}
    </div>
  );
}
