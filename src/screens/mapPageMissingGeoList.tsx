import Link from 'next/link';
import { TownChip } from '../components/townChip';
import { categoryLabel } from '../lib/category';
import { TYPE_META, type TPlaceEntry } from '../lib/places';

type TMapPageMissingGeoListProps = {
  places: TPlaceEntry[];
};

/**
 * 지도에 좌표가 없어 마커로 못 그린 곳들 — 그 곳들만 바로 상세로 잇는다(14 ↪ 12 U1.7).
 *
 * 예전에는 종류 목록(`/places/<type>`)으로 보내, 3곳을 찾으러 26곳을 훑게 했다. 목록에는 '좌표 없음'
 * 필터가 없고, 빠진 곳은 종류가 섞여 있어 한 목록으로 모이지도 않는다. 모바일 시트와 데스크톱 패널이
 * 같은 줄을 쓴다.
 */
export function MapPageMissingGeoList({ places }: TMapPageMissingGeoListProps) {
  return (
    <ul className="divide-y divide-secondary">
      {places.map((place) => (
        <li key={place.id}>
          <Link href={`/place/${place.id}`} className="flex min-h-11 items-center gap-2 py-2">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-primary">{place.name}</span>
              <span className="mt-0.5 flex items-center gap-1.5">
                <TownChip town={place.region.town} type={place.type} />
                <span className="truncate text-xs text-tertiary">
                  {categoryLabel(place.category, TYPE_META[place.type].label, place.type)}
                </span>
              </span>
            </span>
            <span className="shrink-0 text-sm text-tertiary" aria-hidden="true">
              ›
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
