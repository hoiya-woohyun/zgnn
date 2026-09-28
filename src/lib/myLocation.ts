/**
 * 지도의 "내 위치" — 한 번 가져와서 서비스 지역 안이면 옮기고, 밖이면 안내만 한다(ADR-008 v13).
 *
 * 위치는 **저장하지도 보내지도 않는다.** 이 모듈이 돌려준 좌표는 지도 한가운데를 옮기고 점 하나를
 * 찍는 데만 쓰이고 사라진다 — 그래서 ADR-012(개인정보·동의)의 대상이 아니다. 저장하게 되면 그쪽을 먼저 본다.
 */

type TBounds = { south: number; west: number; north: number; east: number };

type TServiceArea = { id: string; label: string; bounds: TBounds };

/**
 * 내 위치로 옮겨 줄 지역들. 지금은 제주 하나다.
 *
 * **목록인 이유는 확장 여지다** — 제주 밖으로 넓히면 여기에 지역을 더하는 것이 첫 단계다. 그러면
 * `outside` 가 줄어들 뿐 버튼·안내 쪽은 바뀌지 않는다. 다만 지역이 늘면 첫 화면 중심(`JEJU_CENTER`)과
 * 줌(`jejuZoomFor`)도 지역을 따라야 한다 — 그건 이 목록만으로는 안 끝난다.
 *
 * 경계는 본섬에 우도(동)·가파도·마라도(남)·차귀도(서)·추자도(북, 33.96°)까지 넉넉히 두른 사각형이다.
 * 바다 위도 안으로 치지만, 바다 위에서 누를 일은 배 위뿐이라 문제 삼지 않는다.
 */
export const SERVICE_AREAS: readonly TServiceArea[] = [
  { id: 'jeju', label: '제주', bounds: { south: 33.1, west: 126.1, north: 34.05, east: 127.0 } },
];

export function serviceAreaOf(lat: number, lng: number): TServiceArea | null {
  return (
    SERVICE_AREAS.find(
      ({ bounds: b }) => lat >= b.south && lat <= b.north && lng >= b.west && lng <= b.east,
    ) ?? null
  );
}

export type TLocateResult =
  | { kind: 'ok'; lat: number; lng: number }
  /** 위치는 받았지만 서비스 지역 밖. 좌표를 돌려주지 않는다 — 쓸 일이 없는 값은 들고 다니지 않는다. */
  | { kind: 'outside' }
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
      ({ coords }) => {
        resolve(
          serviceAreaOf(coords.latitude, coords.longitude)
            ? { kind: 'ok', lat: coords.latitude, lng: coords.longitude }
            : { kind: 'outside' },
        );
      },
      (error) => resolve({ kind: error.code === PERMISSION_DENIED ? 'denied' : 'unavailable' }),
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 10_000 },
    );
  });
}

/** 실패했을 때 지도 위에 띄울 한 줄. 'ok' 는 지도가 옮겨 가는 것 자체가 답이라 문구가 없다. */
export const LOCATE_NOTICE: Record<Exclude<TLocateResult['kind'], 'ok'>, string> = {
  outside: '지금은 제주 밖이에요. 제주에서 누르면 내 위치로 옮겨 드려요.',
  denied: '위치 권한이 꺼져 있어요. 브라우저 설정에서 이 사이트의 위치를 허용해 주세요.',
  unavailable: '위치를 찾지 못했어요. 잠시 뒤 다시 눌러 주세요.',
  unsupported: '이 브라우저에서는 위치를 쓸 수 없어요.',
};
