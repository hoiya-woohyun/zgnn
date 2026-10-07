'use client';

import { Edit03 } from '@untitledui/icons';
import { useState, type ReactNode } from 'react';
import { Button } from '../components/base/button';
import { Input } from '../components/base/input';
import { NO_AUTOFILL } from '../components/noAutofill';
import { SAVED_NOTE_MAX } from '../lib/savedNotes';
import { useAppStore, useIsSaved, useSavedNote } from '../store/useAppStore';

/**
 * 저장한 곳 카드 밑의 메모 **입력**(docs/todo/10 F5). "1일차 · 아내가 고름 · 전화했음, 2마리 OK" 같은 말을 적는다.
 *
 * 적은 메모는 여기가 아니라 카드 **안** 이름 밑에 보인다(`components/savedNoteLine.tsx` — 둘러보기·지도·상세에도 같은 줄).
 * 그래서 이 줄은 고치기·남기기 한 칸뿐이다. 카드 링크 **밖**에 둔다 — 안에 두면 입력 칸을 누르는 것이 상세로 가는 것이 된다.
 * 기기 안에만 저장되고 공유에는 싣지 않는다. 입력은 누를 때만 연다 — 늘 열린 칸이면 저장 목록이 폼이 된다.
 */
type TSavedPageNoteProps = {
  id: string;
  name: string;
  /** 같은 줄 오른쪽 끝(길찾기 알약). 입력이 열리면 자리를 비켜 준다 — 입력 칸·저장·취소와 한 줄에 서면 좁은 폰에서 넘친다. */
  trailing?: ReactNode;
};

export function SavedPageNote({ id, name, trailing }: TSavedPageNoteProps) {
  const saved = useIsSaved(id);
  const note = useSavedNote(id);
  const setSavedNote = useAppStore((state) => state.setSavedNote);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  // 하트를 끈 카드는 이번 방문 동안 자리에 남는다(savedPageSession) — 저장 없는 곳엔 메모를 못 다니 줄을 감춘다.
  if (!saved) return null;

  const open = () => {
    setDraft(note ?? '');
    setEditing(true);
  };
  const save = () => {
    setSavedNote(id, draft);
    setEditing(false);
  };

  if (editing) {
    return (
      <form
        className="mt-2 flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          save();
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
        <Button size="md" color="link-gray" className="min-h-11 shrink-0" onClick={() => setEditing(false)}>
          취소
        </Button>
      </form>
    );
  }

  return (
    <div className="mt-1 flex items-center justify-between gap-2">
      <button
        type="button"
        onClick={open}
        aria-label={note ? `${name} 메모 고치기: ${note}` : `${name}에 메모 남기기`}
        className="flex min-h-11 items-center gap-1.5 rounded-xl px-2 text-sm text-tertiary hover:bg-tertiary"
      >
        <Edit03 size={16} aria-hidden="true" className="shrink-0 text-fg-quaternary" />
        {note ? '메모 고치기' : '메모 남기기'}
      </button>
      {trailing}
    </div>
  );
}
