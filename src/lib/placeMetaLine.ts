import { categoryLabel } from './category';
import { distanceLabel } from './distanceSort';
import { TYPE_META, type TPlaceEntry } from './places';

/**
 * 목록 메타 한 줄 — '펜션 · 구좌읍 · 1.2km · 10월 확인'(22 G3.0 · 디자인 감사 A-4 · A-16). 색 없는 글자이고 넘치면 말줄임이다.
 * 읍면은 종류색 칩이었다 — 읍면은 종류와 무관한데 종류색이었고, 칩 하나가 혼자 한 줄을 먹어 메타가 두세 줄로 깨졌다.
 * 목록·근처·저장·지도 시트·지도 패널·줄 목록이 이 하나를 쓴다.
 */
export function placeMetaLine(
  place: Pick<TPlaceEntry, 'category' | 'type' | 'region'>,
  extra: { distanceKm?: number; verified?: string | null } = {},
): string {
  return [
    categoryLabel(place.category, TYPE_META[place.type].label, place.type),
    place.region.town,
    extra.distanceKm !== undefined ? distanceLabel(extra.distanceKm) : null,
    extra.verified,
  ]
    .filter((part): part is string => Boolean(part))
    .join(' · ');
}
