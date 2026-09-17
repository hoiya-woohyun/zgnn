/**
 * Kakao 지도 SDK 의 최소 타입.
 *
 * `@types/kakao.maps.d.ts` 를 받아 쓸 수도 있지만, 이 앱이 실제로 만지는 면은
 * 지도 1개 · CustomOverlay · LatLngBounds 셋뿐이라 의존성을 하나 더 늘리는 대신
 * 쓰는 만큼만 손으로 적었다. SDK 를 더 쓰게 되면 여기에 더한다.
 *
 * `export` 가 없어야 전역 선언으로 읽힌다 — import/export 를 하나라도 넣으면
 * 이 파일이 모듈이 되어 `window.kakao` 보강이 사라진다.
 */
declare namespace kakao.maps {
  class LatLng {
    constructor(lat: number, lng: number);
    getLat(): number;
    getLng(): number;
  }

  /** 인자 없이 만들고 `extend` 로 넓힐 수 있다 — 코너를 미리 구할 필요가 없다. */
  class LatLngBounds {
    constructor(sw?: LatLng, ne?: LatLng);
    extend(latlng: LatLng): void;
    isEmpty(): boolean;
  }

  interface MapOptions {
    center: LatLng;
    /** 확대 수준. ROADMAP 은 1~14 이고 **작을수록 확대**다(기본값 3). */
    level?: number;
    draggable?: boolean;
    scrollwheel?: boolean;
  }

  class Map {
    constructor(container: HTMLElement, options: MapOptions);
    setCenter(latlng: LatLng): void;
    getLevel(): number;
    setLevel(level: number): void;
    /** 2번째 인자부터 top·right·bottom·left. 생략하면 상하좌우 32 가 붙는다. */
    setBounds(
      bounds: LatLngBounds,
      paddingTop?: number,
      paddingRight?: number,
      paddingBottom?: number,
      paddingLeft?: number,
    ): void;
    /** 컨테이너 크기를 바꾼 뒤 반드시 부른다. window resize 에 대해서는 SDK 가 알아서 부른다. */
    relayout(): void;
  }

  class Size {
    constructor(width: number, height: number);
  }

  class Point {
    constructor(x: number, y: number);
  }

  interface MarkerImageOptions {
    /** 좌표에 맞출 이미지 안의 지점. 기본값은 가운데 아래 — 핀은 끝을 맞춘다. */
    offset?: Point;
    alt?: string;
  }

  class MarkerImage {
    constructor(src: string, size: Size, options?: MarkerImageOptions);
  }

  interface MarkerOptions {
    map?: Map | null;
    position: LatLng;
    /** 없으면 SDK 기본 마커가 쓰인다. */
    image?: MarkerImage;
    /** 마커 엘리먼트의 title 속성(툴팁). */
    title?: string;
    clickable?: boolean;
    zIndex?: number;
    /** 0~1. 판정이 'hard' 인 곳을 눈에 덜 띄게 할 때 쓴다. */
    opacity?: number;
  }

  class Marker {
    constructor(options: MarkerOptions);
    setMap(map: Map | null): void;
    setImage(image: MarkerImage): void;
    setZIndex(zIndex: number): void;
  }

  namespace event {
    function addListener(target: object, type: string, handler: () => void): void;
  }

  /** `autoload=false` 로 받은 SDK 를 실제로 초기화한다. */
  function load(callback: () => void): void;
}

interface Window {
  kakao?: { maps: typeof kakao.maps };
}
