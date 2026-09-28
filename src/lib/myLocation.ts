/**
 * 지도의 "내 위치" — 한 번 가져와서 **어디든** 그 자리로 옮긴다(ADR-008 v14).
 *
 * 제주 밖이면 안내만 하던 v13 을 사용자 요청으로 뒤집었다 — 서울에서 누르면 서울로 간다.
 * 판정이 없으니 지역 목록도 두지 않는다. 다른 지역으로 넓히는 일은 ADR-008 「내 위치」 절에 적어 뒀다.
 *
 * 위치는 **저장하지도 보내지도 않는다.** 이 모듈이 돌려준 좌표는 지도 한가운데를 옮기고 점 하나를
 * 찍는 데만 쓰이고 사라진다 — 그래서 ADR-012(개인정보·동의)의 대상이 아니다. 저장하게 되면 그쪽을 먼저 본다.
 */

export type TLocateResult =
  | { kind: 'ok'; lat: number; lng: number }
  /** 사용자가 거절했거나, 브라우저·OS 설정에서 꺼져 있다. 다시 눌러도 묻지 않는다. */
  | { kind: 'denied' }
  /** GPS 를 못 잡았거나 시간이 넘었다. 다시 누르면 될 수 있다. */
  | { kind: 'unavailable' }
  /** 브라우저가 위치를 아예 못 준다 — 오래된 브라우저거나 **HTTPS 가 아닌 주소**(폰에서 LAN IP 로 연 개발 서버). */
  | { kind: 'unsupported' };

/** `GeolocationPositionError.code` 의 1(PERMISSION_DENIED). 상수를 쓰지 않는 것은 테스트 환경에 전역이 없어서다. */
const PERMISSION_DENIED = 1;

/**
 * 한 번만 가져온다(`getCurrentPosition`). 따라다니기(`watchPosition`)는 배터리를 쓰고, 이 앱의 쓰임새
 * ("여기서 가까운 곳이 어디지?")는 누를 때 한 번이면 된다.
 *
 * - `enableHighAccuracy: false` — 동네 단위면 충분하고, 켜면 실내에서 GPS 를 기다리느라 느려진다.
 * - `maximumAge: 60s` — 1분 안에 다시 누르면 브라우저가 들고 있던 값을 곧장 준다.
 * - `timeout: 10s` — 넘으면 'unavailable' 로 끝낸다. 기다리는 동안 버튼은 눌린 상태로 보인다.
 *
 * `geolocation` 을 인자로 받는 것은 테스트 때문이다 — 기본값이 브라우저의 것이다.
 */
export function locateMe(
  geolocation: Geolocation | undefined = typeof navigator === 'undefined'
    ? undefined
    : navigator.geolocation,
): Promise<TLocateResult> {
  if (!geolocation) return Promise.resolve({ kind: 'unsupported' });
  return new Promise((resolve) => {
    geolocation.getCurrentPosition(
      ({ coords }) => resolve({ kind: 'ok', lat: coords.latitude, lng: coords.longitude }),
      (error) => resolve({ kind: error.code === PERMISSION_DENIED ? 'denied' : 'unavailable' }),
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 10_000 },
    );
  });
}

/** 위치는 받았는데 지도가 아직 뜨지 않았거나(SDK 로딩 중) 깨져서 옮길 수 없을 때의 한 줄. */
export const LOCATE_MAP_NOT_READY = '지도가 아직 준비되지 않았어요. 잠시 뒤 다시 눌러 주세요.';

/** 실패했을 때 지도 위에 띄울 한 줄. 'ok' 는 지도가 옮겨 가는 것 자체가 답이라 문구가 없다. */
export const LOCATE_NOTICE: Record<Exclude<TLocateResult['kind'], 'ok'>, string> = {
  denied: '위치 권한이 꺼져 있어요. 브라우저 설정에서 이 사이트의 위치를 허용해 주세요.',
  unavailable: '위치를 찾지 못했어요. 잠시 뒤 다시 눌러 주세요.',
  unsupported: '이 브라우저에서는 위치를 쓸 수 없어요.',
};
