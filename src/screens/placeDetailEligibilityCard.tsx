import { Fragment, type ReactNode } from 'react';
import Link from 'next/link';
import { Button } from '../components/base/button';
import { dogSubsetWhatIf } from '../lib/dogSubsetWhatIf';
import { headlineFor, verdictFor, type TEligibilityLevel } from '../lib/eligibility';
import { dogCallNames } from '../lib/korean';
import { needsIndoorChangedLevel } from '../lib/needsIndoorWhatIf';
import type { TPlaceEntry } from '../lib/places';
import { useAppStore, useDog } from '../store/useAppStore';
import { useEligibility } from '../store/useDogEligibility';
import { CARD_SURFACE } from '../components/cardSurface';

/**
 * 머리글 앞의 레벨 색 점. 배지(`EligibilityBadge`)를 쓰지 않는 이유: 배지 라벨이 문장이 되면서
 * ("이용하기 어려워요") 바로 옆 머리글("악동이는 이용하기 어려워요")과 같은 말을 두 번 하게 됐고,
 * 360px 에서는 머리글이 접혀 두 줄까지 차지했다. 색은 배지와 같은 계열을 쓴다 — 목록에서 본
 * 배지 색이 상세에서도 같은 뜻으로 읽혀야 한다(brand=ok · orange=cond · neutral=unknown · slate=hard).
 * 점은 장식이라 aria-hidden — 레벨은 머리글 문장이 이미 말한다.
 */
const DOT_CLASS: Record<TEligibilityLevel, string> = {
  ok: 'bg-utility-brand-500',
  cond: 'bg-utility-orange-500',
  unknown: 'bg-utility-neutral-400',
  hard: 'bg-utility-slate-600',
};

/**
 * 상세 화면의 판정 카드. 원문 카드("반려동물 이용") 바로 위에 얹는다.
 *
 * 머리글은 "악동이는 갈 수 있어요" 처럼 애칭 + 은/는 + 판정으로 읽힌다(`verdictFor`) — 근거가 하나뿐이면
 * 근거를 따르는 규칙, 정보 없음(unknown)이면 이름을 빼고 장소를 주어로 삼는 규칙이 lib 에 있어 테스트로 묶인다.
 * unknown 의 U1 근거("동반 조건이 적혀 있지 않아요")는 머리글과 같은 말이라 목록에서 뺀다.
 *
 * 강아지가 없으면 강제 등록 없이 조용한 배너 한 줄만(2026-09-15 리뷰 §1② — 첫 진입 강제
 * 등록은 이탈). 있으면 색 점 + 머리글 + 근거(심각도순, `useEligibility` 가 이미 정렬해 준다).
 * 요금 정보(`info` 레벨)는 판정 근거가 아니라 참고 정보라 아래에 작게 따로 둔다.
 *
 * **원문(`evidence`)은 따로 상자를 갖지 않고 이 면 안에 구분선으로 딸린다**(ADR-003 v15). 예전에는 판정·원문이
 * 같은 모양의 상자 둘로 쌓여 답과 근거가 같은 무게로 보였다. 강아지가 없으면 답이 없으므로 원문이 혼자 면을 갖는다.
 */
export function PlaceDetailEligibilityCard({ place, evidence }: { place: TPlaceEntry; evidence: ReactNode }) {
  const dog = useDog();
  const eligibility = useEligibility(place);
  const needsIndoor = useAppStore((state) => state.needsIndoor);
  const setNeedsIndoor = useAppStore((state) => state.setNeedsIndoor);

  if (!dog || !eligibility) {
    return (
      <>
        <Link
          href="/dog"
          className="mb-3 flex min-h-11 items-center justify-between gap-2 rounded-2xl border border-secondary bg-secondary px-4 py-3 text-sm font-semibold text-secondary transition-colors hover:bg-tertiary"
        >
          우리 강아지를 등록하면 여기서 갈 수 있는지 바로 알려 드려요
          <span aria-hidden="true" className="text-tertiary">
            ›
          </span>
        </Link>
        <div className={`${CARD_SURFACE} p-4`}>{evidence}</div>
      </>
    );
  }

  const mainReasons = eligibility.reasons.filter((r) => r.level !== 'info' && r.rule !== 'U1');
  // 다두 what-if(10 F11) — 어려움일 때만, 가장 많이 데려갈 수 있는 조합 하나. 판정을 다시 돌릴 뿐 규칙을 새로 쓰지 않는다.
  const subset = dogSubsetWhatIf(dog, place.policy, eligibility, { needsIndoor });
  const infoReasons = eligibility.reasons.filter((r) => r.level === 'info');
  /*
   * '실내 자리 필요' 는 식당·카페 목록에서만 보이는 전역 값이라, 켜 둔 걸 잊으면 판정이 이유 없이 달라진다(12 U0.3).
   * 그 값이 **등급을 바꾼 곳**에서만 말한다 — 등급이 같으면 소음이다. 끄면 이 화면과 목록·지도·홈이 함께 바뀐다.
   */
  const indoorChanged = needsIndoorChangedLevel(dog, place.policy, eligibility, needsIndoor);

  return (
    <div className={CARD_SURFACE}>
      <div className="p-4">
        {/*
         * items-start + 점에 mt: 머리글이 두 줄로 접혀도 점은 첫 줄 글자 가운데에 남는다(줄 높이 7.5 의 가운데 − 점 2.5 의 반).
         * 판정 문장은 상세에서 가장 큰 본문 글자다 — 절 제목(text-lg)·1박 요금(text-lg)보다 크다. 이 화면이 답하는 것이 이것이다.
         */}
        <div className="flex items-start gap-2">
          <span aria-hidden="true" className={`mt-2.5 size-2.5 shrink-0 rounded-full ${DOT_CLASS[eligibility.level]}`} />
          <p className="text-xl font-bold text-primary">
            {verdictFor(dog.dogs.map((d) => d.name), eligibility)}
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

        {indoorChanged && (
          <p className="mt-3 flex flex-wrap items-center gap-x-2 text-sm text-tertiary">
            실내 자리 필요로 설정돼 있어요
            <Button color="link-color" size="sm" className="min-h-11" onClick={() => setNeedsIndoor(false)}>
              끄기
            </Button>
          </p>
        )}

        {subset && (
          <p className="mt-3 rounded-xl bg-secondary px-3 py-2 text-sm text-secondary">
            {dogCallNames(subset.names)}만 데려가면 {headlineFor(subset.eligibility)}
          </p>
        )}

        {infoReasons.length > 0 && (
          <p className="mt-2 text-sm text-tertiary">{infoReasons.map((reason) => reason.text).join(' · ')}</p>
        )}
      </div>

      {/* 근거 — 판정과 같은 면, 구분선 아래. 이름표가 있어야 판정의 "원문을 확인해 주세요"(C7)가 가리키는 곳이 보인다. */}
      <div className="border-t border-secondary p-4">
        <p className="mb-2 text-xs font-semibold text-tertiary">원문</p>
        {evidence}
      </div>
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
