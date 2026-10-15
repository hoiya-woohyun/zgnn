import type { TPlaceEntry } from '../lib/places';
import { roomPhrases } from '../lib/stayEnvironmentView';

/**
 * 판정 카드의 근거 칸 안 — 숙소의 객실 조건(객실 안 · 침대·소파, 14 W261013.11). 원문이 말한 칸이 하나도 없으면 줄째 뺀다.
 * '숙소 환경'(독채·마당) 절이 아니라 여기인 이유: 대형견 보호자가 "갈 수 있어요" 다음에 바로 묻는 말이라("마당만이면 안 가요")
 * 판정 옆에서 읽혀야 한다. 판정 자체는 바꾸지 않는다 — 크기로 갈리는 문장은 이 칸에 오지 않는다(`stayEnvironment.mjs`).
 */
export function PlaceDetailRoomConditions({ place }: { place: TPlaceEntry }) {
  const phrases = roomPhrases(place.environment);
  if (phrases.length === 0) return null;

  return <p className="mt-3 text-sm text-secondary">{phrases.join(' · ')}</p>;
}
