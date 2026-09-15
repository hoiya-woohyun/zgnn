import placesJson from '../data/places.json';
import itemsJson from '../data/items.json';
import metaJson from '../data/meta.json';
import type { TDirection, TItem, TMeta, TPlace, TPlaceType } from '../types';
import { parsePetPolicy, type TPetPolicy } from './petPolicy';

/** 장소 한 건 + 미리 파싱해 둔 반려동물 이용 조건. */
export type TPlaceEntry = TPlace & { policy: TPetPolicy };

// JSON 은 구조만 맞고 타입 리터럴(예: direction)까지는 좁혀지지 않아 한 번만 단언한다.
const rawPlaces = placesJson as unknown as TPlace[];

export const PLACES: TPlaceEntry[] = rawPlaces.map((place) => ({
  ...place,
  policy: parsePetPolicy(place.petPolicyText),
}));

export const PLACES_BY_ID = new Map(PLACES.map((place) => [place.id, place]));

export const ITEMS = itemsJson as TItem[];
export const META = metaJson as TMeta;

export const getPlace = (id: string | undefined) => (id ? PLACES_BY_ID.get(id) : undefined);

export const placesOfType = (type: TPlaceType) => PLACES.filter((place) => place.type === type);

/**
 * 저장한 id 중 실제로 존재하는 장소만 골라 PLACES 순서로 돌려준다.
 *
 * 탭바 배지·저장 화면·홈의 '저장한 곳 N' 은 반드시 이 함수 하나만 쓴다.
 * 예전 데이터의 id 가 localStorage 에 남아 있으면 id 를 그냥 세는 쪽과 장소를 찾아 세는 쪽이
 * 서로 다른 숫자를 보여주기 때문이다.
 */
export const selectSavedPlaces = (savedIds: string[]): TPlaceEntry[] =>
  PLACES.filter((place) => savedIds.includes(place.id));

export const countByType: Record<TPlaceType, number> = {
  stay: placesOfType('stay').length,
  restaurant: placesOfType('restaurant').length,
  cafe: placesOfType('cafe').length,
};

// ─────────────────────────────────────────────────────────────────────────────
// 분류 라벨과 색
// ─────────────────────────────────────────────────────────────────────────────

export const PLACE_TYPES: TPlaceType[] = ['stay', 'restaurant', 'cafe'];

export const TYPE_META: Record<TPlaceType, { label: string; blurb: string }> = {
  stay: { label: '숙소', blurb: '반려견과 함께 묵을 수 있는 곳' },
  restaurant: { label: '식당', blurb: '동반 입장이 되는 밥집' },
  cafe: { label: '카페', blurb: '커피 마시며 쉬어 갈 곳' },
};

/**
 * 숙소=바다, 식당=감귤, 카페=현무암. 저장 하트만 동백 붉은색을 따로 쓴다.
 * 장소 사진이 없는 것이 기본이라 이 색이 화면에서 타입을 구분하는 주된 신호다.
 */
export const TYPE_COLOR: Record<TPlaceType, string> = {
  stay: '#0c7a80',
  restaurant: '#ee6f0c',
  cafe: '#5a4f45',
};

/**
 * 흰 글씨를 얹는 면에 쓰는 진한 쪽. 셋 다 흰색 대비 7:1 이상이다.
 * 카페는 현무암 회색 그대로 진하게 하면 앱 기본 텍스트색과 구분이 안 돼서 갈색 쪽으로 틀었다.
 */
export const TYPE_COLOR_DEEP: Record<TPlaceType, string> = {
  stay: '#075055',
  restaurant: '#a04806',
  cafe: '#4a3a2b',
};

/** 상세 제목 판의 바탕. 평평한 색 한 장보다 깊이가 생긴다. */
export const typeHeaderBackground = (type: TPlaceType) =>
  `linear-gradient(152deg, ${TYPE_COLOR_DEEP[type]}, color-mix(in oklab, ${TYPE_COLOR_DEEP[type]} 78%, ${TYPE_COLOR[type]}))`;

/** 타입 색을 흰색에 섞어 만든 옅은 바탕. 글씨는 ink 계열만 올린다. */
export const typeTint = (type: TPlaceType, percent: number) =>
  `color-mix(in oklab, ${TYPE_COLOR[type]} ${percent}%, #fff)`;

/** 해당 타입에서 장소가 가장 많은 읍면 몇 곳. 홈 섹션 카드의 칩으로 쓴다. */
export const topTowns = (type: TPlaceType, limit = 3): { town: string; count: number }[] => {
  const counts = new Map<string, number>();
  for (const place of placesOfType(type)) {
    counts.set(place.region.town, (counts.get(place.region.town) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([town, count]) => ({ town, count }))
    .sort((a, b) => b.count - a.count || a.town.localeCompare(b.town, 'ko'))
    .slice(0, limit);
};

export const isPlaceType = (value: string | undefined): value is TPlaceType =>
  value === 'stay' || value === 'restaurant' || value === 'cafe';

export const DIRECTION_LABEL: Record<TDirection, string> = {
  east: '동쪽',
  west: '서쪽',
  south: '남쪽',
  north: '북쪽',
  udo: '우도',
  unknown: '기타',
};

/** 필터에 노출할 방향. 데이터에 실제로 존재하는 것만 쓴다. */
export const DIRECTIONS: TDirection[] = ['east', 'west', 'south', 'north', 'udo'];

// ─────────────────────────────────────────────────────────────────────────────
// 거리
// ─────────────────────────────────────────────────────────────────────────────

const EARTH_RADIUS_KM = 6371;
const toRad = (deg: number) => (deg * Math.PI) / 180;

export const distanceKm = (
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number => {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
};

/** 좌표가 있는 장소 중 가까운 순으로. 좌표가 없는 장소는 빈 배열을 돌려준다. */
export const nearbyPlaces = (place: TPlaceEntry, limit = 3): { place: TPlaceEntry; km: number }[] => {
  const origin = place.geo;
  if (!origin) return [];
  return PLACES.filter((other) => other.id !== place.id && other.geo)
    .map((other) => ({ place: other, km: distanceKm(origin, other.geo!) }))
    .sort((a, b) => a.km - b.km)
    .slice(0, limit);
};

export const JEJU_CENTER: [number, number] = [33.38, 126.55];
export const JEJU_ZOOM = 10;
