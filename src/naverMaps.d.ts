/**
 * 네이버 지도 SDK(NCP Maps JavaScript API v3)의 최소 타입.
 *
 * `@types/navermaps` 를 받아 쓸 수도 있지만, 이 앱이 실제로 만지는 면은
 * 지도 1개 · Marker · Event 셋뿐이라 의존성을 하나 더 늘리는 대신 쓰는 만큼만 손으로 적었다.
 * SDK 를 더 쓰게 되면 여기에 더한다.
 *
 * `export` 가 없어야 전역 선언으로 읽힌다 — import/export 를 하나라도 넣으면
 * 이 파일이 모듈이 되어 `window.naver` 보강이 사라진다.
 */
declare namespace naver.maps {
  class LatLng {
    constructor(lat: number, lng: number);
    lat(): number;
    lng(): number;
  }

  class Size {
    constructor(width: number, height: number);
  }

  class Point {
    constructor(x: number, y: number);
  }

  interface MapOptions {
    center: LatLng;
    /**
     * 확대 수준. **클수록 확대**다(기본값 11) — leaflet 의 zoom 과 같은 방향이고
     * Kakao 의 level 과는 반대다. 옛 `JEJU_LEVEL` 숫자를 그대로 옮겨 쓰면 안 된다.
     */
    zoom?: number;
    minZoom?: number;
    maxZoom?: number;
    draggable?: boolean;
    scrollWheel?: boolean;
    pinchZoom?: boolean;
    /** NAVER 로고. 약관 제7조 ⑩ 이 표시 게재를 요구할 수 있어 끄지 않는다. */
    logoControl?: boolean;
    /** 지도 데이터 저작권 표시. 로고와 같은 이유로 끄지 않는다. */
    mapDataControl?: boolean;
    scaleControl?: boolean;
    zoomControl?: boolean;
  }

  class Map {
    constructor(container: HTMLElement | string, options: MapOptions);
    setCenter(latlng: LatLng): void;
    getZoom(): number;
    setZoom(zoom: number): void;
    /**
     * 컨테이너 크기를 바꾼 뒤 부른다. Kakao 의 `relayout()` 자리 — 네이버엔 `relayout` 이 없다.
     * @param noEffect 페이드 인 효과를 건너뛸지(기본 false)
     */
    refresh(noEffect?: boolean): void;
    /** 모든 이벤트와 DOM 을 함께 걷어낸다. 언마운트에서 부른다. */
    destroy(): void;
  }

  /** 이미지 아이콘. Kakao 의 `MarkerImage` 자리. */
  interface ImageIcon {
    url: string;
    /** 지도 위 표시 크기. */
    size?: Size;
    /** 원본 이미지 크기. 레티나 대응에 쓴다. */
    scaledSize?: Size;
    /** 스프라이트 시작점(기본 0,0). */
    origin?: Point;
    /** 좌표에 맞출 이미지 안의 지점. **Kakao 의 `offset` 과 같은 뜻**이고 원점은 이미지 좌상단이다. */
    anchor?: Point;
  }

  interface MarkerOptions {
    map?: Map | null;
    position: LatLng;
    /** 없으면 SDK 기본 마커가 쓰인다. 문자열 URL · ImageIcon · HtmlIcon · SymbolIcon 을 받는다. */
    icon?: ImageIcon | string;
    /** 마커 엘리먼트의 title 속성(툴팁). */
    title?: string;
    clickable?: boolean;
    zIndex?: number;
    /** 0~1. 판정이 'hard' 인 곳을 눈에 덜 띄게 할 때 쓴다 — Kakao 와 마찬가지로 기본 옵션이다. */
    opacity?: number;
    visible?: boolean;
  }

  class Marker {
    constructor(options: MarkerOptions);
    setMap(map: Map | null): void;
    setIcon(icon: ImageIcon | string): void;
    setZIndex(zIndex: number): void;
    setOpacity(opacity: number): void;
  }

  /** `Event.addListener` 가 돌려주는 핸들. `removeListener` 에 그대로 넘긴다. */
  interface MapEventListener {
    readonly eventName: string;
  }

  /**
   * 대문자 `Event` 다(Kakao 는 소문자 `event`).
   * 그리고 **등록이 핸들을 돌려주고, 그 핸들을 `removeListener` 로 풀어야 한다** — Kakao 엔 없던 정리 의무다.
   */
  namespace Event {
    function addListener(
      target: object,
      eventName: string,
      listener: (...args: unknown[]) => void,
    ): MapEventListener;
    function removeListener(listeners: MapEventListener | MapEventListener[]): void;
    function clearInstanceListeners(target: object): void;
  }
}

interface Window {
  naver?: { maps: typeof naver.maps };
  /**
   * SDK 가 인증에 실패하면(클라이언트 아이디 오류 · 등록 안 된 출처) 이 전역 함수를 부른다.
   * Kakao 에는 이런 통로가 없어서 지도 자리가 조용히 비었는데, 네이버는 실패를 알려 준다 —
   * 로더가 이걸 잡아 "지도는 인터넷이 필요해요" 폴백으로 넘긴다.
   */
  navermap_authFailure?: () => void;
}
