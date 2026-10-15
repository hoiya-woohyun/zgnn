import { naverPlaceUrlOf } from './naverPlaceLink';
import type { TPlaceEntry } from './places';

/**
 * 상세가 이 곳의 위치를 얼마나 아는가 — 머리의 주소 줄·근처 장소 절이 이 하나를 읽는다(14 W261013.7).
 *
 * - `full` — 주소와 좌표가 다 있다(대부분).
 * - `noAddress` — 좌표는 있고 주소가 없다. 미니 지도·길찾기·근처 장소는 그대로 선다 — 모르는 것은 **주소 글자뿐**이다.
 * - `noGeo` — 좌표가 없다(주소는 있을 수도 없을 수도). 미니 지도·근처 장소가 빠지고, 액션 줄의 '길찾기' 칸이
 *   빠진다(네이버로 나가는 칸은 '네이버 플레이스' 하나) — 그 칸은 `naverDirectionsUrl` 이 좌표로 가르므로 같은 축이다.
 *
 * 좌표가 축인 이유: 화면에서 사라지는 것(지도·근처·길찾기)이 전부 좌표에 매여 있다. 주소는 글자 한 줄이다.
 */
export type TPlaceDetailLocation = 'full' | 'noAddress' | 'noGeo';

export function placeDetailLocationOf(place: Pick<TPlaceEntry, 'address' | 'geo'>): TPlaceDetailLocation {
  if (!place.geo) return 'noGeo';
  return place.address ? 'full' : 'noAddress';
}

/**
 * 주소 줄 자리에 서는 한 줄 — 비었을 때 **비었다고** 말한다(다른 곳엔 다 있는 줄이 말없이 빠지면 "여기만 왜" 가 된다).
 *
 * 좌표가 없는 곳은 바로 밑 액션 줄에 '길찾기' 가 없고 '네이버 플레이스' 만 있는 이유를 이 문장이 함께 말한다 — 칸 밑에 설명을
 * 달면 칸 폭을 나누는 격자가 깨지고, 이 줄이 액션 줄 바로 위다. '네이버 플레이스로' 는 그 칸이 설 때(`naverPlaceUrlOf`)만 말한다.
 */
export function placeDetailAddressNote(
  place: Pick<TPlaceEntry, 'address' | 'geo' | 'naverPlaceId' | 'naverUrl'>,
): string | null {
  const location = placeDetailLocationOf(place);
  if (location === 'full') return null;
  if (location === 'noAddress') return '주소는 아직 확인하지 못했어요 · 위치는 아래 지도에서 볼 수 있어요';
  const unknown = place.address ? '지도 위치를' : '주소와 위치를';
  return naverPlaceUrlOf(place)
    ? `${unknown} 아직 확인하지 못해 길찾기 대신 네이버 플레이스로 이어 드려요`
    : `${unknown} 아직 확인하지 못했어요`;
}

/** 근처 장소 절이 좌표 없는 곳에서 서는 한 줄. 같은 섬에 다른 곳이 없어 빈 것(우도·추자)은 이 말이 아니다 — 절째 뺀다. */
export const PLACE_DETAIL_NEARBY_NO_GEO = '위치를 몰라 주변 장소를 보여 드릴 수 없어요.';
