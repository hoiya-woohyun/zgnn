'use client';

import type { TPublicTextPreview } from '../lib/adminPublicText';

/**
 * 사이트에 나갈 문장 한 덩이(`publicTextPreview` — 검수 카드·사이트 비교·장소 고치기가 같은 함수로 만든다, docs/todo/21 S6).
 * 모양은 상세(`placeDetailPolicyText`)가 그리는 것을 줄여 옮겼다. 상자를 두르지 않는다 — 놓이는 칸의 바탕을 따른다.
 * 안 나가는 안내·notes 는 색만으로 말하지 않고 글로 적는다.
 */
export function AdminPublicTextPreview({ preview }: { preview: TPublicTextPreview }) {
  const { evidence, hidden } = preview;
  return (
    <div className="space-y-1 text-xs">
      {evidence.kind === 'raw' ? (
        <>
          <p className="text-tertiary">원문 그대로 나가요</p>
          <p className="whitespace-pre-line text-secondary">{evidence.text}</p>
        </>
      ) : (
        <>
          <p className="text-tertiary">정리한 조건으로 나가요 · 원문은 링크로만</p>
          <ul className="space-y-0.5 text-secondary">
            {evidence.lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          {evidence.note && <p className="text-secondary">{evidence.note}</p>}
        </>
      )}
      {hidden.map((item) => (
        <div key={item.key}>
          <p className="text-warning-primary">
            안 나가는 {item.label}: {item.text}
          </p>
          <p className="text-tertiary">{item.reasons.join(' · ')}</p>
        </div>
      ))}
    </div>
  );
}
