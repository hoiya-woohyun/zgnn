'use client';

import { Edit03 } from '@untitledui/icons';
import { useState } from 'react';
import { Button } from '../components/base/button';
import { Input } from '../components/base/input';
import { NO_AUTOFILL } from '../components/noAutofill';
import { SAVED_NOTE_MAX } from '../lib/savedNotes';
import { useAppStore, useIsSaved, useSavedNote } from '../store/useAppStore';

/**
 * 저장한 곳 카드 밑의 한 줄 메모(docs/todo/10 F5). "1일차 · 아내가 고름 · 전화했음, 2마리 OK" 같은 말을 적는다.
 *
 * 카드 링크 **밖**에 둔다 — 안에 두면 메모를 누르는 것이 상세로 가는 것이 된다. 기기 안에만 저장되고 공유에는 싣지 않는다.
 * 입력은 누를 때만 연다 — 늘 열린 칸이면 저장 목록이 폼이 되고, 메모 없는 카드가 비어 보인다.
 */
export function SavedPageNote({ id, name }: { id: string; name: string }) {
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
    <button
      type="button"
      onClick={open}
      aria-label={note ? `${name} 메모 고치기: ${note}` : `${name}에 메모 남기기`}
      className="mt-1 flex min-h-11 w-full items-center gap-2 rounded-xl px-2 text-left text-sm hover:bg-tertiary"
    >
      <Edit03 size={16} aria-hidden="true" className="shrink-0 text-fg-quaternary" />
      {note ? <span className="min-w-0 flex-1 text-secondary">{note}</span> : <span className="text-tertiary">메모 남기기</span>}
    </button>
  );
}
