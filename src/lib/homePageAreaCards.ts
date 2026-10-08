/**
 * 홈 「두부랑 갈 동네」 6권역 카드의 수·문장(19 T4). 순수.
 *
 * 셈은 `countByArea`(= 히어로의 `countByLevel`)의 `ok + outdoor` 하나다 — 따로 세면 "홈은 12곳, 눌렀더니 11곳" 이 생긴다.
 * 식당은 머리 숫자에 넣지 않는다: 대부분 '확인이 필요해요' 인데 전화번호가 없어 세면 보증처럼 읽힌다(19 §1).
 *
 * 0칸은 '없다' 가 아니라 '저희가 아직 덜 모았다' 로 말한다. 분모(그 권역에 모은 숙소 수)가 둘을 가른다 —
 * 적게 모았으면 '모른다', 모았는데 0 이면 '어렵다'. "없어요"·"추천" 은 쓰지 않는다.
 */

import { AREAS, LANDMARK_KEY_TO_AREA, type TAreaCounts, type TAreaId } from './areaGroups';
import type { TLevelCounts } from './eligibilityCounts';
import { LANDMARKS_BY_AREA, type TLandmark } from './landmarks';
import { matchesQuery } from './placeSearch';
import type { TPlaceEntry } from './places';
import type { TPlaceType } from '../types';

/** 머리 숫자의 종류 — 식당은 뺀다. */
export const AREA_CARD_TYPES = ['stay', 'cafe'] as const satisfies readonly TPlaceType[];

/** 모은 곳이 이 수 이하면 0칸을 '덜 모았다' 로 읽는다(19 T4). */
export const AREA_THIN_DENOMINATOR = 2;

const total = (counts: TLevelCounts) => Object.values(counts).reduce((sum, n) => sum + n, 0);
const reach = (counts: TLevelCounts) => counts.ok + counts.outdoor;

export type THomePageAreaCardCounts = Record<(typeof AREA_CARD_TYPES)[number], { reach: number; total: number }>;

/** 권역 하나의 카드 수 — 종류마다 갈 수 있는 곳(ok + 야외)과 모은 곳. */
export const homePageAreaCardCounts = (counts: TAreaCounts, area: TAreaId): THomePageAreaCardCounts => ({
  stay: { reach: reach(counts[area].stay), total: total(counts[area].stay) },
  cafe: { reach: reach(counts[area].cafe), total: total(counts[area].cafe) },
});

/**
 * 묵을 곳이 0인 권역에 붙일 "가장 가까운" 권역 — **이 강아지가 묵을 곳이 있는** 권역 중 섬을 도는 순서(`AREAS`, 북부 → 서부로 감긴다)로
 * 가장 가까운 곳. 같은 거리면 묵을 곳이 많은 쪽. 없으면 null(링크를 안 단다).
 */
export const nearestAreaWithStay = (counts: TAreaCounts, from: TAreaId): TAreaId | null => {
  const ids = AREAS.map((area) => area.id);
  const start = ids.indexOf(from);
  for (let step = 1; step <= ids.length / 2; step++) {
    const ring = [ids[(start + step) % ids.length], ids[(start - step + ids.length) % ids.length]];
    const best = ring
      .filter((id) => reach(counts[id].stay) > 0)
      .sort((a, b) => reach(counts[b].stay) - reach(counts[a].stay))[0];
    if (best) return best;
  }
  return null;
};

export type THomePageAreaStayGap = { kind: 'thin' } | { kind: 'hard'; total: number };

/**
 * 묵을 곳이 0일 때 어떤 문장인가. 0이 아니면 null.
 * - `thin`: 모은 숙소가 `AREA_THIN_DENOMINATOR` 이하 — "저희가 모은 숙소 중엔 아직 … 없어요. 아는 곳이 있으면 알려 주세요"
 * - `hard`: 모았는데 이 강아지에겐 어렵다 — "모아 둔 숙소 m곳 중 … 0곳이에요"
 */
export const homePageAreaStayGap = (card: THomePageAreaCardCounts): THomePageAreaStayGap | null => {
  if (card.stay.reach > 0) return null;
  return card.stay.total <= AREA_THIN_DENOMINATOR ? { kind: 'thin' } : { kind: 'hard', total: card.stay.total };
};

/**
 * 그 권역 카드 안에 둘 관광지 칩 — 세 종류 합쳐 0곳인 칩은 뺀다(14 W261007.9: 27개 중 11개가 0곳이라 칩에서 온 사람이
 * "띄어쓰기를 바꾸거나 더 짧게" 를 봤다). 세는 말은 칩이 실제로 거는 검색어(별칭 첫 말)다.
 * 데이터가 빌드 시점이라 화면은 한 번만 부르면 된다. 칩의 자리는 관광지 키 → 권역(`LANDMARK_KEY_TO_AREA`)으로만 정한다 —
 * 반경이 권역 경계를 넘어도 칩은 그 키의 카드에 산다.
 */
export const homePageAreaLandmarks = (
  places: readonly TPlaceEntry[],
): Record<TAreaId, { landmark: TLandmark; count: number }[]> => {
  const byArea = Object.fromEntries(AREAS.map(({ id }) => [id, []])) as unknown as Record<
    TAreaId,
    { landmark: TLandmark; count: number }[]
  >;
  for (const [key, landmarks] of Object.entries(LANDMARKS_BY_AREA) as [
    keyof typeof LANDMARKS_BY_AREA,
    readonly TLandmark[],
  ][]) {
    for (const landmark of landmarks) {
      const count = places.filter((place) => matchesQuery(place, landmark.aliases[0])).length;
      if (count > 0) byArea[LANDMARK_KEY_TO_AREA[key]].push({ landmark, count });
    }
  }
  return byArea;
};
