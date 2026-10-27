import { TOWN_TO_AREA, type TAreaId } from './areaGroups';
import { placesOfType } from './places';
import type { TPlaceType } from '../types';

/**
 * 필터 시트 '지역' 의 읍면 칸(22 D-7). 순수.
 *
 * 읍면 칩을 개수순으로 세우면 종류마다 칸 자리가 바뀌었고(구좌가 숙소에선 맨 앞, 식당에선 셋째), 권역(여럿)과 읍면(하나)이 AND 라
 * '동부 + 애월' 처럼 0곳인 조합을 아무 말 없이 만들 수 있었다. 그래서 칸은 **지도 차례로 고정**하고(제주 시내에서 시계 방향으로 섬을 한 바퀴),
 * 권역을 고르면 그 권역의 읍면만 남긴다.
 */

/** 지도 차례 — 제주 시내에서 동쪽으로 돌아 애월까지. 키는 데이터의 `region.town` 표기 그대로다. 새 읍면은 끝에 붙는다(가나다순). */
export const PLACES_PAGE_TOWN_ORDER: readonly string[] = [
  '제주시',
  '조천읍',
  '구좌읍',
  '우도면',
  '성산읍',
  '표선면',
  '남원읍',
  '서귀포시',
  '안덕면',
  '대정읍',
  '한경면',
  '한림읍',
  '애월읍',
];

/**
 * 고른 권역 안의 읍면인가 — 권역을 안 골랐으면 늘 그렇다. 권역을 바꿔 고른 읍면이 그 밖이 되면 화면이 읍면을 푼다
 * (그대로 두면 칸에서 사라진 읍면이 숨은 조건으로 남아 0곳이다). 읍면 → 권역은 홈 6권역과 같은 매핑이다(`TOWN_TO_AREA`).
 */
export const placesPageTownInAreas = (town: string, areas: readonly TAreaId[]): boolean => {
  const area = TOWN_TO_AREA[town];
  return areas.length === 0 || (area !== undefined && areas.includes(area));
};

const orderOf = (town: string): number => {
  const index = PLACES_PAGE_TOWN_ORDER.indexOf(town);
  return index < 0 ? PLACES_PAGE_TOWN_ORDER.length : index;
};

/**
 * 칸에 세울 읍면 — 이 종류에 곳이 있는 읍면 중 고른 권역 안의 것, 지도 차례로. 지금 조건(검색어·판정 등)으로는 거르지 않는다 — 다른 조건을 누를 때마다
 * 칸이 손가락 밑에서 자리를 바꾸지 않게(14 W261010.33e). **골라 둔 읍면은 늘 선다** — 이 종류에 없는 읍면(숙소에서 고른 읍면을 들고 식당으로, 12 U1.6)도
 * 끌 칸이 있어야 하고, 밖에서 들어와 권역과 어긋난 읍면도 마찬가지다.
 */
export const placesPageTownGrid = ({
  type,
  areas,
  town,
}: {
  type: TPlaceType;
  areas: readonly TAreaId[];
  town: string | null;
}): string[] => {
  const towns = new Set(
    placesOfType(type)
      .filter((place) => placesPageTownInAreas(place.region.town, areas))
      .map((place) => place.region.town),
  );
  if (town !== null) towns.add(town);
  return [...towns].sort((a, b) => orderOf(a) - orderOf(b) || a.localeCompare(b, 'ko'));
};
