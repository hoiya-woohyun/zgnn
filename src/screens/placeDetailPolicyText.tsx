import { Fragment, type ReactNode } from 'react';
import { Button } from '../components/base/button';
import { PetBadges } from '../components/petBadges';
import { evidenceText, type TPolicyEvidence } from '../lib/petPolicyPublic';
import type { TPlaceEntry } from '../lib/places';
import { useDog } from '../store/useAppStore';
import { useEligibility } from '../store/useDogEligibility';

/**
 * 근거 칸의 이름표(판정 카드가 단다). 원문을 내지 않는 곳에 「원문」 을 달면 정리한 문장이 블로거의 말처럼 읽힌다.
 * 판정 C7 의 "원문을 확인해 주세요" 는 그때 밑의 「후기에서 원문 보기」 링크를 가리킨다.
 */
export const POLICY_EVIDENCE_LABEL: Record<TPolicyEvidence['kind'], string> = { raw: '원문', derived: '정리한 조건' };

/**
 * 상세 「반려동물 이용」 의 근거 — 배지 + 조건 문장(21 S5, ADR-017 결정 13). 무엇을 그릴지는 `policyEvidence` 가 정한다.
 * - 원문 공개(시드 — 가족이 쓴 문장): 원문 그대로 + 판정 근거 강조.
 * - 그 밖(블로그 출처): 원문을 내지 않는다. 판단에서 만든 줄 + 안내(없으면 notes) + 출처 링크. 판정 근거의 인용(`quote`)은
 *   원문 조각이라 강조할 자리가 없고, 그래서 화면에 나가지 않는다.
 *
 * 배지와 문장을 한 곳에서 그리는 이유: 배지는 "요금이 본문에 이미 있다" 면 칩을 숨기는데, 그 본문은 **화면에 실제로 나가는 글**이어야 한다(`evidenceText`).
 */
export function PlaceDetailPolicyText({ place, evidence }: { place: TPlaceEntry; evidence: TPolicyEvidence }) {
  const dog = useDog();

  return (
    <>
      {/* 파서가 조건을 놓쳤을 수 있어, 구조화 배지와 문장을 함께 보여준다. */}
      <PetBadges policy={place.policy} hideNoInfo={Boolean(dog)} sourceText={evidenceText(evidence)} className="mb-3" />
      {evidence.kind === 'raw' ? (
        <p className="whitespace-pre-line text-md text-secondary">
          <HighlightedPolicyText text={evidence.text} place={place} />
        </p>
      ) : (
        <>
          <ul className="space-y-1 text-md text-secondary">
            {evidence.lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          {evidence.note && <p className="mt-2 text-md text-secondary">{evidence.note}</p>}
          {/* 출처 설명("블로그 글을 읽고 정리했어요")은 두지 않는다 — 모든 장소가 블로그에서 왔고, AI 정리 안내는 카드 맨 아래 공통 줄이 한다. */}
          {place.reviewUrl && (
            <p className="mt-1 flex">
              {/* 액션 줄의 「후기」 와 같은 글이다 — 이름이 달라 다른 것으로 읽혔다(14 W261013.14m). 합치지 않는 이유: "원문" 은 C7·배지 `원문 확인 필요` 가
                  가리키는 자리고, 「후기」 칸을 이 38곳에서만 빼면 액션 줄 칸 수가 장소마다 갈린다(14 W261010.6). */}
              <Button color="link-color" size="sm" className="min-h-11" href={place.reviewUrl} target="_blank" rel="noopener noreferrer">
                후기에서 원문 보기
              </Button>
            </p>
          )}
        </>
      )}
    </>
  );
}

/**
 * 원문 문단에서 판정 근거(`reason.quote`)와 일치하는 문장을 `<mark>` 로 강조한다.
 *
 * `quote` 는 `petPolicy.ts` 가 원문을 문장 단위로 쪼갠 조각 그대로라(트림만 적용, 구분자인
 * '.'·줄바꿈은 없음) 정규식 없이 `indexOf` 로 원문 안 위치를 그대로 찾을 수 있다 — 이스케이프
 * 걱정이 없다. 못 찾으면(예: 파서가 원문을 살짝 다르게 나눈 경우) 그 quote 는 그냥 건너뛰고
 * 강조 없이 원문을 있는 그대로 보여준다.
 */
function HighlightedPolicyText({ text, place }: { text: string; place: TPlaceEntry }) {
  const eligibility = useEligibility(place);
  if (!eligibility) return <>{text}</>;

  const quotes = Array.from(
    new Set(eligibility.reasons.map((reason) => reason.quote).filter((quote): quote is string => Boolean(quote))),
  );
  if (quotes.length === 0) return <>{text}</>;

  // reasons 는 심각도순이므로 quotes 의 순서가 곧 우선순위다. 겹치는 구간은 더 센 근거가
  // 차지하도록, 심각도순으로 하나씩 넣되 이미 잡힌 구간과 겹치면 버린다. 그 뒤 위치순 정렬.
  const merged: { start: number; end: number; quote: string }[] = [];
  for (const quote of quotes) {
    const start = text.indexOf(quote);
    if (start < 0) continue;
    const end = start + quote.length;
    if (merged.some((taken) => start < taken.end && end > taken.start)) continue;
    merged.push({ start, end, quote });
  }
  merged.sort((a, b) => a.start - b.start);
  if (merged.length === 0) return <>{text}</>;

  const nodes: ReactNode[] = [];
  let cursor = 0;
  merged.forEach((range, index) => {
    if (range.start > cursor) nodes.push(<Fragment key={`t${index}`}>{text.slice(cursor, range.start)}</Fragment>);
    nodes.push(
      <mark key={`m${index}`} className="rounded bg-brand-primary px-0.5 text-ink">
        {text.slice(range.start, range.end)}
      </mark>,
    );
    cursor = range.end;
  });
  if (cursor < text.length) nodes.push(<Fragment key="tail">{text.slice(cursor)}</Fragment>);

  return <>{nodes}</>;
}
