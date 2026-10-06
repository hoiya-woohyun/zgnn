'use client';

import { useToday } from '../hooks/useToday';
import { freshnessOf } from '../lib/placeFreshness';
import { TYPE_META, type TPlaceEntry } from '../lib/places';

/**
 * 반려동물 이용 카드 맨 아래 한 줄 — "정보는 바뀔 수 있어요" 자리를 **확인 날짜**가 대신한다(docs/todo/10 F3).
 * 날짜가 없으면(확인 기록 없음 · 열린 폐업 제보) 예전 문장 그대로다.
 */
export function PlaceDetailFreshness({ place }: { place: TPlaceEntry }) {
  const now = useToday();
  const freshness = freshnessOf(place, now);
  const label = TYPE_META[place.type].label;

  if (!freshness) {
    return <p className="mt-3 text-xs text-tertiary">{label} 정보는 바뀔 수 있어요. 방문 전 한 번 더 확인해 주세요.</p>;
  }
  return (
    <p className="mt-3 text-xs text-tertiary">
      {freshness.text}. {freshness.stale ? '방문 전 한 번 더 확인해 주세요.' : '그래도 바뀔 수 있으니 방문 전 한 번 더 확인해 주세요.'}
    </p>
  );
}
