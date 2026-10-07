/**
 * 걸린 장소의 대안(docs/todo/16 T2.2) — "여기가 어렵다면 대신 어디". 순수.
 *
 * 상세의 「근처 장소」 와 같은 `nearbyPlaces` 로 거리순 후보를 받고, **판정으로 거른다**:
 *  - 같은 종류 · 같은 읍면만 — 하루 동선에서 "카페 대신 카페" 여야 바꿔 끼울 수 있다. 읍면이 다르면 대안이 아니라 다른 하루다.
 *  - `judgeEligibility` 가 'ok' 인 곳만 — 대안이 다시 '확인이 필요해요' 면 걸린 것을 다른 걸린 것으로 바꿀 뿐이다.
 *    판정 입력(프로필 · `needsIndoor`)은 묶음 판정(`tripEligibility`)과 같다 — 둘이 다른 강아지를 보면 "대신" 이 또 걸린다.
 *  - `excludeIds` — 이미 그 하루에 있는 곳은 대안으로 내지 않는다.
 * 상세와 달리 `sortNearby` 의 같은 읍면 당김은 쓰지 않는다 — 이미 같은 읍면만 남아 순수한 거리순이 된다.
 */

import { judgeEligibility } from './eligibility';
import { nearbyPlaces, type TPlaceEntry } from './places';
import type { TDogProfile } from '../types';

/** 대안은 많아야 셋 — 하루 줄 옆에 "대신 △△" 로 붙는 자리라 그 이상은 고르는 일이 된다. */
export const TRIP_ALTERNATIVES_LIMIT = 3;

export function tripAlternatives(
  blocked: TPlaceEntry,
  dog: TDogProfile,
  opts: { needsIndoor?: boolean; excludeIds?: ReadonlySet<string> } = {},
): { place: TPlaceEntry; km: number }[] {
  const town = blocked.region.town;
  if (!town) return []; // 읍면을 모르면 "같은 동네" 를 말할 수 없다
  return nearbyPlaces(blocked, Infinity)
    .filter(
      ({ place }) =>
        place.type === blocked.type &&
        place.region.town === town &&
        !opts.excludeIds?.has(place.id) &&
        judgeEligibility(dog, place.policy, { needsIndoor: opts.needsIndoor }).level === 'ok',
    )
    .slice(0, TRIP_ALTERNATIVES_LIMIT);
}
