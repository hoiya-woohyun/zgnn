'use client';

import { useToday } from '../hooks/useToday';
import { freshnessOf } from '../lib/placeFreshness';
import type { TPlaceEntry } from '../lib/places';

/**
 * 반려동물 이용 카드 맨 아래 — 모든 상세(원문 공개·블로그 출처)가 같은 자리에 그리는 안내.
 * - 확인 날짜(docs/todo/10 F3): 있을 때만 한 줄. 없으면(확인 기록 없음 · 열린 폐업 제보 · 조건 없음) 줄째 뺀다.
 * - AI 정리 안내: **늘** 그린다. 시드의 조건 원문은 사람이 쓴 것이지만, 장소마다 가르지 않고 같은 안내를 둔다(사용자 결정 2026-10-15).
 *   "방문 전 한 번 더 확인해 주세요" 는 이 줄에만 둔다 — 날짜 줄에도 붙이면 같은 부탁이 두 번 나온다.
 */
export function PlaceDetailFreshness({ place }: { place: TPlaceEntry }) {
  const now = useToday();
  const freshness = freshnessOf(place, now);

  return (
    <div className="mt-3 space-y-0.5 text-xs text-tertiary">
      {freshness && <p>{freshness.text}.</p>}
      <p>AI 로 모아 정리한 정보라 정확하지 않을 수 있어요. 방문 전 한 번 더 확인해 주세요.</p>
    </div>
  );
}
