/**
 * 관광지 이름으로 찾기 — "중문 카페" 의 '중문'. 순수.
 *
 * 지역 태그(`region.town`)는 주소에서 온 읍·면 하나다. 겹치지 않아야 필터·지도 칩·근처 정렬이 선다. 그런데 여행자는
 * "중문 근처", "협재 쪽" 으로 생각하고, 중문은 읍·면이 아니라 서귀포시의 동이라 `남쪽 (서귀포시)` 에 서귀포 시내와 함께 묶인다.
 * 그래서 관광지 이름은 태그로 만들지 않고 **좌표 반경**으로 푼다 — 태그는 하나로 두고, 찾는 길만 하나 더 낸다.
 * 반경은 서로 겹쳐도 된다(태그가 아니므로). 좌표가 없는 장소는 이 길로는 안 걸린다 — 이름·특징에 그 말이 있으면 글자로는 걸린다.
 *
 * 랜드마크를 더하는 것은 이 표에 한 줄이다. 데이터 갱신·재분석·검수가 필요 없다.
 */

import { distanceKm } from './places';
import type { TGeo } from '../types';

export type TLandmark = {
  /** 화면에 보일 이름. */
  name: string;
  /** 검색어로 받을 말들(공백 없이). `name` 도 여기에 넣는다. */
  aliases: readonly string[];
  center: TGeo;
  radiusKm: number;
};

export const LANDMARKS: readonly TLandmark[] = [
  { name: '중문', aliases: ['중문', '중문관광단지'], center: { lat: 33.2496, lng: 126.412 }, radiusKm: 3 },
];

/** 검색어 한 단어(소문자·공백 없음)가 가리키는 랜드마크. 없으면 null. */
export function landmarkOfWord(word: string): TLandmark | null {
  return LANDMARKS.find((landmark) => landmark.aliases.includes(word)) ?? null;
}

/** 장소가 랜드마크 반경 안인가. 좌표가 없으면 false. */
export function isNearLandmark(place: { geo?: TGeo }, landmark: TLandmark): boolean {
  return place.geo !== undefined && distanceKm(landmark.center, place.geo) <= landmark.radiusKm;
}
