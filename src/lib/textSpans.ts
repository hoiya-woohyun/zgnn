/**
 * 한 줄을 칠할 조각으로 나누는 공용 층(06 G). **어디를 칠할지는 부르는 쪽이 정하고**(주소 다름 · AI 보정),
 * 여기는 구간 목록을 조각으로 바꾸기만 한다 — 화면은 `mark` 인 조각을 `<mark>` 로 감싼다.
 */

/** 한 줄의 조각. `mark` 가 참인 조각을 칠한다. */
export type TTextSpan = { text: string; mark: boolean };
export type TTextRange = { start: number; end: number };

/**
 * 구간을 정렬하고 **겹치거나 맞닿는 것은 합친다** — 같은 금액을 두 규칙이 칠하면 구간이 겹치는데, 그대로 자르면
 * 겹친 글자가 두 번 찍힌다. 빈 구간·줄 밖 구간은 버린다. 칠할 것이 없으면 칠하지 않은 한 조각.
 */
export function spansOf(text: string, ranges: readonly TTextRange[]): TTextSpan[] {
  const sorted = ranges
    .map(({ start, end }) => ({ start: Math.max(0, start), end: Math.min(text.length, end) }))
    .filter(({ start, end }) => end > start)
    .sort((a, b) => a.start - b.start);
  const merged: TTextRange[] = [];
  for (const range of sorted) {
    const last = merged.at(-1);
    if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
    else merged.push({ ...range });
  }
  if (merged.length === 0) return [{ text, mark: false }];

  const spans: TTextSpan[] = [];
  let cursor = 0;
  for (const range of merged) {
    if (range.start > cursor) spans.push({ text: text.slice(cursor, range.start), mark: false });
    spans.push({ text: text.slice(range.start, range.end), mark: true });
    cursor = range.end;
  }
  if (cursor < text.length) spans.push({ text: text.slice(cursor), mark: false });
  return spans;
}
