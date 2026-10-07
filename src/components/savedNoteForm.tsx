'use client';

import { useState } from 'react';
import { Button } from './base/button';
import { Input } from './base/input';
import { NO_AUTOFILL } from './noAutofill';
import { SAVED_NOTE_MAX } from '../lib/savedNotes';
import { useAppStore, useSavedNote } from '../store/useAppStore';
import { cx } from '../utils/cx';

type TSavedNoteFormProps = {
  id: string;
  name: string;
  /** 저장이든 취소든 닫힐 때. 여는 쪽이 상태를 쥔다 — 폼은 열려 있는 동안만 존재한다. */
  onClose: () => void;
  className?: string;
};

/**
 * 저장한 곳 메모 **입력 폼** 하나 — 저장 화면 카드의 메모 자리(`savedPageCard.tsx`)와 상세 머리(`placeDetailNote.tsx`)가 같은 것을 연다.
 * 초안은 열릴 때의 메모로 시작한다(지금 값을 고치는 것이지 새로 쓰는 것이 아니다). 30자(`SAVED_NOTE_MAX`)는 입력 칸이 막고
 * 칸 오른쪽 끝에 "(10/30)" 으로 센다. 예전 상한(80)으로 적은 메모를 열면 넘친 수가 빨갛게 보이고, 저장할 때 잘린다.
 */
export function SavedNoteForm({ id, name, onClose, className }: TSavedNoteFormProps) {
  const note = useSavedNote(id);
  const setSavedNote = useAppStore((state) => state.setSavedNote);
  const [draft, setDraft] = useState(note ?? '');
  // 글자 단위(코드 포인트) — 저장할 때 자르는 단위(`cleanSavedNote`)와 같게.
  const count = [...draft].length;

  return (
    <form
      // 메모가 있던 자리에서 살짝 내려앉으며 나타난다. 닫힐 때는 바로 사라진다 — 여는 쪽이 폼을 통째로 내리고, 카드도 그 순간 링크로 돌아간다.
      className={cx(
        className ?? 'flex items-center gap-2',
        'animate-in fade-in slide-in-from-top-1 duration-200 motion-reduce:animate-none',
      )}
      onSubmit={(event) => {
        event.preventDefault();
        setSavedNote(id, draft);
        onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose();
      }}
    >
      <div className="relative min-w-0 flex-1">
        <Input
          aria-label={`${name} 메모`}
          aria-describedby={`saved-note-count-${id}`}
          {...NO_AUTOFILL}
          placeholder="예: 1일차 · 2마리 OK"
          value={draft}
          onChange={setDraft}
          maxLength={SAVED_NOTE_MAX}
          inputClassName="pr-17"
          autoFocus
        />
        <span
          id={`saved-note-count-${id}`}
          className={cx(
            'pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs tabular-nums',
            count > SAVED_NOTE_MAX ? 'text-error-primary' : 'text-quaternary',
          )}
        >
          ({count}/{SAVED_NOTE_MAX})
        </span>
      </div>
      <Button type="submit" size="md" color="secondary" className="min-h-11 shrink-0">
        저장
      </Button>
      <Button size="md" color="link-gray" className="min-h-11 shrink-0" onClick={onClose}>
        취소
      </Button>
    </form>
  );
}
