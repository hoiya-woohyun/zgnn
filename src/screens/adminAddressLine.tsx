'use client';

import type { TAddressView } from '../lib/adminAddress';
import { cx } from '../utils/cx';

/**
 * 주소 한 줄 — **어디서 왔는지 · 원글과 맞는지 · 직접 확인하는 링크**.
 *
 * 두 곳이 쓴다(펼친 상세 · 고치기 폼). 소유자가 둘이라 이름에 소유자 접두어를 붙이지 않는다(CLAUDE.md 의 예외 2).
 * 같은 컴포넌트를 쓰는 것이 요점이다 — 폼에서 주소를 고치는 순간 상세에 있던 것과 **같은 문장**으로 대조가
 * 다시 그려져야, "고쳤더니 원글과 맞았다" 가 화면에서 이어진다.
 *
 * 검증됐을 때만 초록을 쓴다. 나머지는 회색 한 단어다 — 확인 못 한 것이 대부분인 화면에서
 * 그것마다 경보를 울리면 정말 다른 주소(동명 오채택)가 줄 끝으로 밀린다(ADR-019 결정 4 와 같은 이유).
 */
export function AdminAddressLine({ view }: { view: TAddressView }) {
  return (
    <>
      <span className="font-medium text-secondary">{view.address ?? '—'}</span>
      {view.mapUrl && (
        /* 다시 확인하는 길은 링크뿐이다 — 브라우저에는 네이버 키가 없다(ADR-016). */
        <a
          className="ml-1.5 text-xs text-brand-secondary underline"
          href={view.mapUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          네이버 지도에서 보기
        </a>
      )}
      <span
        className={cx(
          'mt-0.5 block text-xs',
          view.verified ? 'text-success-primary' : 'text-tertiary',
        )}
      >
        {view.sourceText}
      </span>
      {view.cross && (
        <span
          className={cx(
            'mt-0.5 block text-xs',
            view.cross.tone === 'warn' ? 'font-semibold text-warning-primary' : 'text-tertiary',
          )}
        >
          {view.cross.text}
        </span>
      )}
    </>
  );
}
