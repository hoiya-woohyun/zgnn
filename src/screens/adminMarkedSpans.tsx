import { cx } from '../utils/cx';
import type { TTextSpan } from '../lib/textSpans';

/** 칠의 결 — 다시 볼 곳은 경고(노랑), 동반 불가 정황처럼 반대 근거는 오류(빨강) 계열(06 G 「지키는 것」). */
const MARK_TONE = { warning: 'bg-warning-secondary', error: 'bg-error-secondary' } as const;

/**
 * `/admin` 의 칠한 조각 — 어디를 칠할지는 `src/lib/` 의 순수 함수가 정하고(06 G) 여기는 `<mark>` 로 감싸기만 한다.
 * 주소 다름·보정이 대 본 원문이 같은 모양이어야 운영자가 "칠한 곳 = 다시 볼 곳" 하나로 읽는다.
 */
export function AdminMarkedSpans({ spans, tone = 'warning' }: { spans: readonly TTextSpan[]; tone?: keyof typeof MARK_TONE }) {
  return spans.map((span, index) =>
    span.mark ? (
      <mark key={index} className={cx('rounded px-0.5 font-semibold text-primary', MARK_TONE[tone])}>
        {span.text}
      </mark>
    ) : (
      span.text
    ),
  );
}
