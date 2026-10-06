'use client';

import { useSyncExternalStore } from 'react';
import { freshnessOf } from '../lib/placeFreshness';
import { TYPE_META, type TPlaceEntry } from '../lib/places';

const subscribeNever = () => () => undefined;
/** 하루 단위로 충분하다 — 매 렌더 다른 값을 돌려주면 `useSyncExternalStore` 가 끝없이 다시 그린다. */
const today = () => Math.floor(Date.now() / 86_400_000) * 86_400_000;
/** 정적 HTML 을 그리는 순간에는 지금이 언제인지 모른다(빌드 시각 ≠ 보는 시각). 오래됐는지는 브라우저에서만 묻는다. */
const unknownNow = () => null;

/**
 * 반려동물 이용 카드 맨 아래 한 줄 — "정보는 바뀔 수 있어요" 자리를 **확인 날짜**가 대신한다(docs/todo/10 F3).
 * 날짜가 없으면(확인 기록 없음 · 열린 폐업 제보) 예전 문장 그대로다.
 */
export function PlaceDetailFreshness({ place }: { place: TPlaceEntry }) {
  const now = useSyncExternalStore(subscribeNever, today, unknownNow);
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
