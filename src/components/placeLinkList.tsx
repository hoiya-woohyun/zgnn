import Link from 'next/link';
import { Badge } from './base/badges';
import { TownChip } from './townChip';
import { categoryLabel } from '../lib/category';
import { TYPE_META, type TPlaceEntry } from '../lib/places';

type TPlaceLinkListProps = {
  places: TPlaceEntry[];
  /**
   * 줄 끝에 붙일 짧은 표식(없으면 null). 한 목록 안에서 성격이 다른 곳이 섞일 때만 넘긴다 — 홈 히어로 시트의 '야외만'(14 W261013.2).
   * 색은 판정 `cond` 배지와 같은 앰버다(야외만이라는 조건이 남아 있다, `ELIGIBILITY_META`). 안 넘기면 예전 줄 그대로다.
   */
  tagOf?: (place: TPlaceEntry) => string | null;
};

/**
 * 몇 곳만 골라 바로 상세로 잇는 줄 목록 — 이름 · 읍면 · 종류, 행 전체가 링크다.
 *
 * "그 N곳" 을 말하는 자리가 전체 목록으로 보내면 3곳을 찾으러 26곳을 훑게 된다. 그래서 그 곳들만
 * 시트(또는 패널)에 이 줄로 펼친다. 쓰는 곳 셋:
 * - 지도 — 좌표가 없어 마커로 못 그린 곳(14 ↪ 12 U1.7). 모바일 시트와 데스크톱 패널이 같은 줄.
 * - 둘러보기 머리 — 갈 수 있는 곳이 0곳일 때 야외 자리로는 되는 곳(14 W261006.5a).
 * - 홈 히어로 — "갈 수 있는 곳 N곳" 의 그 곳들, 야외 자리만 되는 곳엔 '야외만'(14 W261007.12 · W261013.2).
 */
export function PlaceLinkList({ places, tagOf }: TPlaceLinkListProps) {
  return (
    <ul className="divide-y divide-secondary">
      {places.map((place) => {
        const tag = tagOf?.(place) ?? null;
        return (
          <li key={place.id}>
            <Link href={`/place/${place.id}`} className="flex min-h-11 items-center gap-2 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-primary">{place.name}</span>
                <span className="mt-0.5 flex items-center gap-1.5">
                  <TownChip town={place.region.town} type={place.type} />
                  <span className="truncate text-xs text-tertiary">
                    {categoryLabel(place.category, TYPE_META[place.type].label, place.type)}
                  </span>
                  {tag && (
                    <Badge type="color" size="sm" color="orange" className="shrink-0">
                      {tag}
                    </Badge>
                  )}
                </span>
              </span>
              <span className="shrink-0 text-sm text-tertiary" aria-hidden="true">
                ›
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
