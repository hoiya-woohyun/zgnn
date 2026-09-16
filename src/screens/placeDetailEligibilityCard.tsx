import { Fragment, type ReactNode } from 'react';
import Link from 'next/link';
import { EligibilityBadge } from '../components/eligibilityBadge';
import type { TEligibilityLevel } from '../lib/eligibility';
import type { TPlaceEntry } from '../lib/places';
import { useDog } from '../store/useAppStore';
import { useEligibility } from '../store/useDogEligibility';

/**
 * 판정 레벨별 머리글. "두부는 조건부예요" 처럼 이름 + 은/는 + 상태로 읽힌다.
 * `unknown` 은 배지 라벨("정보 없음")을 그대로 문장에 붙이면 어색해 다른 문구를 쓴다.
 */
const HEADLINE: Record<TEligibilityLevel, string> = {
  ok: '가능해요',
  cond: '조건부예요',
  unknown: '판정할 정보가 부족해요',
  hard: '어려워요',
};

/**
 * 한글 이름 마지막 글자의 받침 유무로 '은/는' 을 고른다(받침 있으면 은, 없으면 는).
 * 한글 완성형 범위 밖(영문 등)이면 받침이 없는 것으로 보고 '는'을 쓴다.
 */
const topicParticle = (name: string): '은' | '는' => {
  const last = name.trim().at(-1);
  if (!last) return '는';
  const code = last.codePointAt(0);
  if (code === undefined || code < 0xac00 || code > 0xd7a3) return '는';
  return (code - 0xac00) % 28 === 0 ? '는' : '은';
};

/**
 * 상세 화면의 판정 카드. 원문 카드("반려동물 이용") 바로 위에 얹는다.
 *
 * 강아지가 없으면 강제 등록 없이 조용한 배너 한 줄만(2026-09-15 리뷰 §1② — 첫 진입 강제
 * 등록은 이탈). 있으면 배지 + 머리글 + 근거(심각도순, `useEligibility` 가 이미 정렬해 준다).
 * 요금 정보(`info` 레벨)는 판정 근거가 아니라 참고 정보라 아래에 작게 따로 둔다.
 */
export function PlaceDetailEligibilityCard({ place }: { place: TPlaceEntry }) {
  const dog = useDog();
  const eligibility = useEligibility(place);

  if (!dog || !eligibility) {
    return (
      <Link
        href="/dog"
        className="mb-3 flex min-h-11 items-center justify-between gap-2 rounded-2xl border border-secondary bg-secondary px-4 py-3 text-sm font-semibold text-secondary transition-colors hover:bg-tertiary"
      >
        우리 강아지를 등록하면 여기서 바로 판정을 볼 수 있어요
        <span aria-hidden="true" className="text-tertiary">
          ›
        </span>
      </Link>
    );
  }

  const mainReasons = eligibility.reasons.filter((r) => r.level !== 'info');
  const infoReasons = eligibility.reasons.filter((r) => r.level === 'info');

  return (
    <div className="mb-3 rounded-2xl border border-secondary bg-primary p-4">
      <div className="flex items-center gap-2">
        <EligibilityBadge level={eligibility.level} size="md" />
        <p className="text-md font-bold text-primary">
          {dog.name}
          {topicParticle(dog.name)} {HEADLINE[eligibility.level]}
        </p>
      </div>

      {mainReasons.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {mainReasons.map((reason, index) => (
            <li key={index} className="flex gap-1.5 text-sm text-secondary">
              <span aria-hidden="true" className="text-tertiary">
                ·
              </span>
              {reason.text}
            </li>
          ))}
        </ul>
      )}

      {infoReasons.length > 0 && (
        <p className="mt-2 text-xs text-tertiary">{infoReasons.map((reason) => reason.text).join(' · ')}</p>
      )}
    </div>
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
export function HighlightedPolicyText({ text, place }: { text: string; place: TPlaceEntry }) {
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
