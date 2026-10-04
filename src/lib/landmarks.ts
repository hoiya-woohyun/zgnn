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

/**
 * 권역 → 랜드마크. 권역은 수집 키워드(`scripts/collect/keywords.json`)와 같은 이름·순서다(서쪽 애월부터 시계 방향).
 * 권역 이름은 묶음일 뿐 판정에 쓰지 않는다 — 읍·면 이름은 지역 태그가 이미 글자로 받으므로(애월 → 애월읍) 여기에 별칭으로 넣지 않는다.
 * 좌표는 OpenStreetMap(Nominatim) 조회값(2026-10-04). 1km 안에 붙은 곳은 하나로 합쳤다(협재·금능 · 탑동·동문시장 · 산방산·사계).
 * 반경: 해변 마을 1.5~2km, 관광단지·공항 2.5~3km. 크게 잡으면 "협재" 에 한림 시내가 섞인다.
 */
export const LANDMARKS_BY_AREA = {
  애월: [
    { name: '한담', aliases: ['한담', '한담해안산책로'], center: { lat: 33.4595, lng: 126.3105 }, radiusKm: 1.5 },
    { name: '곽지', aliases: ['곽지', '곽지해수욕장', '곽지해변'], center: { lat: 33.45, lng: 126.305 }, radiusKm: 1.5 },
  ],
  한림: [
    {
      name: '협재·금능',
      aliases: ['협재', '협재해수욕장', '협재해변', '금능', '금능해수욕장', '금능해변'],
      center: { lat: 33.392, lng: 126.2385 },
      radiusKm: 2,
    },
  ],
  한경: [{ name: '신창', aliases: ['신창', '신창풍차해안', '풍차해안'], center: { lat: 33.345, lng: 126.175 }, radiusKm: 2 }],
  대정: [
    { name: '모슬포', aliases: ['모슬포', '모슬포항'], center: { lat: 33.217, lng: 126.251 }, radiusKm: 2 },
    { name: '송악산', aliases: ['송악산'], center: { lat: 33.1994, lng: 126.29 }, radiusKm: 1.5 },
  ],
  안덕: [
    { name: '산방산·사계', aliases: ['산방산', '용머리해안', '사계', '사계해변'], center: { lat: 33.238, lng: 126.311 }, radiusKm: 2 },
    { name: '화순', aliases: ['화순', '화순금모래해변', '화순금모래해수욕장'], center: { lat: 33.2404, lng: 126.3332 }, radiusKm: 1.5 },
    { name: '오설록', aliases: ['오설록'], center: { lat: 33.3051, lng: 126.2898 }, radiusKm: 1.5 },
  ],
  중문: [
    { name: '중문', aliases: ['중문', '중문관광단지', '대포주상절리', '주상절리'], center: { lat: 33.2496, lng: 126.412 }, radiusKm: 3 },
  ],
  서귀포: [
    { name: '올레시장', aliases: ['올레시장', '매일올레시장', '이중섭거리', '천지연'], center: { lat: 33.2498, lng: 126.564 }, radiusKm: 1.5 },
    { name: '법환', aliases: ['법환', '법환포구'], center: { lat: 33.2372, lng: 126.5161 }, radiusKm: 1.5 },
    { name: '쇠소깍', aliases: ['쇠소깍'], center: { lat: 33.2526, lng: 126.6235 }, radiusKm: 1.5 },
  ],
  남원: [{ name: '위미', aliases: ['위미', '위미항'], center: { lat: 33.2726, lng: 126.6603 }, radiusKm: 2 }],
  표선: [{ name: '성읍', aliases: ['성읍', '성읍민속마을'], center: { lat: 33.3869, lng: 126.8016 }, radiusKm: 1.5 }],
  성산: [
    { name: '성산일출봉', aliases: ['일출봉', '성산일출봉'], center: { lat: 33.4589, lng: 126.9408 }, radiusKm: 2 },
    { name: '섭지코지', aliases: ['섭지코지'], center: { lat: 33.43, lng: 126.927 }, radiusKm: 1.5 },
  ],
  구좌: [
    { name: '김녕', aliases: ['김녕', '김녕해수욕장', '김녕해변'], center: { lat: 33.5565, lng: 126.76 }, radiusKm: 1.5 },
    { name: '월정리', aliases: ['월정', '월정리', '월정리해변', '월정리해수욕장'], center: { lat: 33.556, lng: 126.795 }, radiusKm: 1.5 },
    { name: '세화', aliases: ['세화', '세화해변'], center: { lat: 33.525, lng: 126.8604 }, radiusKm: 1.5 },
    { name: '비자림', aliases: ['비자림'], center: { lat: 33.488, lng: 126.808 }, radiusKm: 2 },
  ],
  조천: [{ name: '함덕', aliases: ['함덕', '함덕해수욕장', '함덕해변', '서우봉'], center: { lat: 33.5432, lng: 126.6699 }, radiusKm: 2 }],
  제주시: [
    { name: '제주공항', aliases: ['공항', '제주공항', '제주국제공항'], center: { lat: 33.5071, lng: 126.4916 }, radiusKm: 2.5 },
    { name: '이호테우', aliases: ['이호', '이호테우', '이호테우해변', '이호테우해수욕장'], center: { lat: 33.4963, lng: 126.4554 }, radiusKm: 1.5 },
    { name: '원도심', aliases: ['원도심', '탑동', '동문시장'], center: { lat: 33.515, lng: 126.526 }, radiusKm: 1.5 },
    { name: '신제주', aliases: ['신제주', '노형', '연동'], center: { lat: 33.484, lng: 126.485 }, radiusKm: 2 },
    { name: '삼양', aliases: ['삼양', '삼양해수욕장', '삼양해변'], center: { lat: 33.5257, lng: 126.5869 }, radiusKm: 1.5 },
  ],
} as const satisfies Record<string, readonly TLandmark[]>;

export const LANDMARKS: readonly TLandmark[] = Object.values(LANDMARKS_BY_AREA).flat();

/** 검색어 한 단어(소문자·공백 없음)가 가리키는 랜드마크. 없으면 null. */
export function landmarkOfWord(word: string): TLandmark | null {
  return LANDMARKS.find((landmark) => landmark.aliases.includes(word)) ?? null;
}

/** 장소가 랜드마크 반경 안인가. 좌표가 없으면 false. */
export function isNearLandmark(place: { geo?: TGeo }, landmark: TLandmark): boolean {
  return place.geo !== undefined && distanceKm(landmark.center, place.geo) <= landmark.radiusKm;
}
