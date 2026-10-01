/**
 * 저장한 곳의 **한 줄 메모**(docs/todo/10 F5 — 태호 "아내가 고른 곳 · 1일차 · 전화했음, 2마리 OK", 은서 "전화해서 된다고 들음").
 * 하트 하나로는 "왜 저장했나" 를 적을 데가 없었다. 순수 함수만 — 스토어(`useAppStore`)가 쓴다.
 *
 * 기기 안에만 있다(localStorage). 공유 링크(07 P1)에는 **싣지 않는다** — 사적인 메모다.
 */

/** 한 줄. 길면 카드가 메모장이 된다. */
export const SAVED_NOTE_MAX = 80;

/** 입력 → 저장할 값. 앞뒤 공백을 걷고, 줄바꿈은 한 칸으로, 길면 자른다(글자 단위). 비면 null(지운다). */
export function cleanSavedNote(value: string): string | null {
  const flat = value.replace(/\s*\n\s*/g, ' ').trim();
  if (flat === '') return null;
  return [...flat].slice(0, SAVED_NOTE_MAX).join('');
}

/**
 * 저장소에서 읽은 메모를 믿지 않는다 — 저장한 곳(`savedIds`)에 없는 id 의 메모는 버리고(하트를 지웠거나 장소가 데이터에서 빠졌다),
 * 문자열이 아니거나 비면 버리고, 길면 자른다.
 */
export function sanitizeSavedNotes(value: unknown, savedIds: readonly string[]): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const keep = new Set(savedIds);
  const notes: Record<string, string> = {};
  for (const [id, note] of Object.entries(value)) {
    if (!keep.has(id) || typeof note !== 'string') continue;
    const cleaned = cleanSavedNote(note);
    if (cleaned) notes[id] = cleaned;
  }
  return notes;
}

/** 메모 하나를 바꾼 새 객체. null 이면 지운다. */
export function withSavedNote(notes: Readonly<Record<string, string>>, id: string, value: string): Record<string, string> {
  const next = { ...notes };
  const cleaned = cleanSavedNote(value);
  if (cleaned) next[id] = cleaned;
  else delete next[id];
  return next;
}
