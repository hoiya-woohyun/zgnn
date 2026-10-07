'use client';

import { useState } from 'react';
import { SavedNoteForm } from '../components/savedNoteForm';
import { SavedNoteLine } from '../components/savedNoteLine';
import { useIsSaved, useSavedNote } from '../store/useAppStore';

/**
 * 상세 머리의 내 메모 — 목록 카드와 같은 줄인데 **누르면 고칠 수 있다**(10 F5.1).
 *
 * 메모 줄이 상세에도 보이게 되자(29df435) 고치려면 저장 화면까지 가야 했다. 줄 자체를 버튼으로 — 저장 화면처럼
 * 따로 "메모 고치기" 칸을 두지 않는다(머리에 글자 줄이 하나 더 늘어난다). 메모가 **없으면 아무것도 없다** — 상세는 읽는
 * 화면이라 "메모 남기기" 를 권하지 않는다. 저장이 풀리면 메모도 없어져(`toggleSaved`) 줄이 같이 사라진다.
 */
export function PlaceDetailNote({ id, name, className }: { id: string; name: string; className?: string }) {
  const saved = useIsSaved(id);
  const note = useSavedNote(id);
  const [editing, setEditing] = useState(false);

  if (!saved || !note) return null;

  if (editing) {
    return <SavedNoteForm id={id} name={name} onClose={() => setEditing(false)} className={className ? `${className} flex items-center gap-2` : 'flex items-center gap-2'} />;
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      aria-label={`${name} 메모 고치기: ${note}`}
      className={`block w-full rounded-lg outline-focus-ring hover:bg-tertiary focus-visible:outline-2 focus-visible:outline-offset-2 ${className ?? ''}`}
    >
      <SavedNoteLine id={id} />
    </button>
  );
}
