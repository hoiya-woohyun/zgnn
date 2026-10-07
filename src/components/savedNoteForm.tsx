'use client';

import { useState } from 'react';
import { Button } from './base/button';
import { Input } from './base/input';
import { NO_AUTOFILL } from './noAutofill';
import { SAVED_NOTE_MAX } from '../lib/savedNotes';
import { useAppStore, useSavedNote } from '../store/useAppStore';

type TSavedNoteFormProps = {
  id: string;
  name: string;
  /** 저장이든 취소든 닫힐 때. 여는 쪽이 상태를 쥔다 — 폼은 열려 있는 동안만 존재한다. */
  onClose: () => void;
  className?: string;
};

/**
 * 저장한 곳 메모 **입력 폼** 하나 — 저장 화면 카드 밑(`savedPageNote.tsx`)과 상세 머리(`placeDetailNote.tsx`)가 같은 것을 연다.
 * 초안은 열릴 때의 메모로 시작한다(지금 값을 고치는 것이지 새로 쓰는 것이 아니다). 80자(`SAVED_NOTE_MAX`)는 입력 칸이 막는다.
 */
export function SavedNoteForm({ id, name, onClose, className }: TSavedNoteFormProps) {
  const note = useSavedNote(id);
  const setSavedNote = useAppStore((state) => state.setSavedNote);
  const [draft, setDraft] = useState(note ?? '');

  return (
    <form
      className={className ?? 'flex items-center gap-2'}
      onSubmit={(event) => {
        event.preventDefault();
        setSavedNote(id, draft);
        onClose();
      }}
    >
      <div className="min-w-0 flex-1">
        <Input
          aria-label={`${name} 메모`}
          {...NO_AUTOFILL}
          placeholder="예: 1일차 · 전화했음, 2마리 OK"
          value={draft}
          onChange={setDraft}
          maxLength={SAVED_NOTE_MAX}
          autoFocus
        />
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
