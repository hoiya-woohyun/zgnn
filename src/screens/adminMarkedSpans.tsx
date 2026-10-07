import type { TTextSpan } from '../lib/textSpans';

/**
 * `/admin` 의 칠한 조각 — 어디를 칠할지는 `src/lib/` 의 순수 함수가 정하고(06 G) 여기는 `<mark>` 로 감싸기만 한다.
 * 주소 다름·보정이 대 본 원문이 같은 모양이어야 운영자가 "칠한 곳 = 다시 볼 곳" 하나로 읽는다.
 */
export function AdminMarkedSpans({ spans }: { spans: readonly TTextSpan[] }) {
  return spans.map((span, index) =>
    span.mark ? (
      <mark key={index} className="rounded bg-warning-secondary px-0.5 font-semibold text-primary">
        {span.text}
      </mark>
    ) : (
      span.text
    ),
  );
}
