import Link from 'next/link';
import { VerdictText } from './verdictLine';
import type { TEligibility } from '../lib/eligibility';
import { placeMetaLine } from '../lib/placeMetaLine';
import type { TPlaceEntry } from '../lib/places';

type TPlaceLinkListProps = {
  places: TPlaceEntry[];
  /**
   * 줄 끝에 붙일 짧은 표식(없으면 null). 한 목록 안에서 성격이 다른 곳이 섞일 때만 넘긴다 — 홈 히어로 시트의 '야외만'(14 W261013.2).
   * 조건이라 색 없는 글자다(판정 줄의 '갈 수 있어요 · 야외 자리만' 과 같은 말, 22 G3.0). 안 넘기면 예전 줄 그대로다.
   */
  tagOf?: (place: TPlaceEntry) => string | null;
  /**
   * 넘기면 줄 끝에 판정 글자(목록·지도 시트와 같은 `VerdictText`). 판정이 섞여 있는 목록만 넘긴다 — 지도의 '지도에 위치가 없는 N곳'
   * (14 W261007.19: 옆 패널 줄엔 배지가 있는데 맨 위 이 줄에만 없었다). 둘러보기 야외 차선·홈 히어로는 전부 같은 판정이라 넘기지 않는다.
   * 강아지가 없으면 null 이 와서 예전 줄 그대로다.
   */
  eligibilityMap?: ReadonlyMap<string, TEligibility> | null;
};

/**
 * 몇 곳만 골라 바로 상세로 잇는 줄 목록 — 이름 · 읍면 · 종류, 행 전체가 링크다.
 *
 * "그 N곳" 을 말하는 자리가 전체 목록으로 보내면 3곳을 찾으러 26곳을 훑게 된다. 그래서 그 곳들만
 * 시트(또는 패널)에 이 줄로 펼친다. 쓰는 곳 셋:
 * - 지도 — 좌표가 없어 마커로 못 그린 곳(14 ↪ 12 U1.7). 모바일 시트와 데스크톱 패널이 같은 줄, 판정 배지까지(14 W261007.19).
 * - 둘러보기 머리 — 갈 수 있는 곳이 0곳일 때 야외 자리로는 되는 곳(14 W261006.5a).
 * - 홈 히어로 — "갈 수 있는 곳 N곳" 의 그 곳들, 야외 자리만 되는 곳엔 '야외만'(14 W261007.12 · W261013.2).
 */
export function PlaceLinkList({ places, tagOf, eligibilityMap }: TPlaceLinkListProps) {
  return (
    <ul className="divide-y divide-secondary">
      {places.map((place) => {
        const tag = tagOf?.(place) ?? null;
        const eligibility = eligibilityMap?.get(place.id);
        return (
          <li key={place.id}>
            <Link href={`/place/${place.id}`} className="flex min-h-11 items-center gap-2 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-primary">{place.name}</span>
                {/* 메타·표식·판정이 한 줄 — 줄을 꺾지 않고 메타 글자가 줄어든다. 지도 패널 머리 칸이라 줄이 높아지면 아래 목록이 그만큼 밀린다. */}
                <span className="mt-0.5 flex min-w-0 items-baseline gap-1.5 text-xs text-tertiary">
                  <span className="min-w-0 truncate">{placeMetaLine(place)}</span>
                  {tag && <span className="shrink-0">· {tag}</span>}
                  {eligibility && <VerdictText eligibility={eligibility} className="shrink-0" />}
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
