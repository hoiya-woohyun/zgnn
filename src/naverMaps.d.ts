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

  /** 남서·북동 두 모서리로 정한 범위. 저장 모드가 저장한 곳이 다 들어오게 맞출 때 쓴다(`Map.fitBounds`). */
  class LatLngBounds {
    constructor(sw: LatLng, ne: LatLng);
  }

  /** 화면 가장자리에서 띄울 픽셀. 칩 줄·탭바에 핀이 가리지 않게 한다. */
  interface Margin {
    top?: number;
    right?: number;
    bottom?: number;
    left?: number;
  }

  class Size {
    constructor(width: number, height: number);
  }

  class Point {
    constructor(x: number, y: number);
  }

  /**
   * 지도 위 컨트롤의 앵커. 이 앱은 로고·저작권 표시를 좌하단에 둔다(ADR-008 v9 — v6~v8 은
   * 바텀시트를 피해 우상단이었다).
   *
   * 멤버 이름과 순서는 **2026-09-23 브라우저 실측**이다(`localhost:7727` 정적 빌드에서
   * `Object.keys(naver.maps.Position)`). 13개이고 `CENTER` 가 0 으로 **맨 앞**이다 —
   * `TOP_RIGHT` 는 3, 이 앱이 쓰는 `BOTTOM_LEFT` 는 10(2026-09-28 재실측).
   *
   * ⚠️ **`const enum` 으로 바꾸지 말 것.** ambient enum 의 **초기화자 없는** 멤버는
   * computed 로 취급되어 인라인되지 않고, 번들에 `naver.maps.Position.BOTTOM_LEFT` 라는
   * **살아 있는 속성 접근**으로 남는다(번들에서 확인). 그래서 여기 적힌 순서가 틀려도
   * 런타임은 SDK 의 진짜 값을 읽는다. `const enum` 이거나 멤버에 숫자를 직접 박으면
   * TS 가 그 숫자를 인라인해 버리고, SDK 값과 다르면 **엉뚱한 위치로 조용히 가거나
   * 무시된다 — 빌드·타입·테스트가 전부 통과한 채로.** 값을 적지 않는 것이 안전장치다.
   */
  enum Position {
    CENTER,
    TOP_LEFT,
    TOP_CENTER,
    TOP_RIGHT,
    LEFT_CENTER,
    LEFT_TOP,
    LEFT_BOTTOM,
    RIGHT_TOP,
    RIGHT_CENTER,
    RIGHT_BOTTOM,
    BOTTOM_LEFT,
    BOTTOM_CENTER,
    BOTTOM_RIGHT,
  }

  interface ControlOptions {
    position?: Position;
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
    keyboardShortcuts?: boolean;
    disableDoubleClickZoom?: boolean;
    disableDoubleTapZoom?: boolean;
    disableTwoFingerTapZoom?: boolean;
    /** NAVER 로고. 약관 제7조 ⑩ 이 표시 게재를 요구할 수 있어 끄지 않는다. */
    logoControl?: boolean;
    /** 로고의 위치. 이 앱은 좌하단(`BOTTOM_LEFT`)에 둔다 — 아래 mapDataControlOptions 와 같은 그룹으로 묶인다. */
    logoControlOptions?: ControlOptions;
    /** 지도 데이터 저작권 표시. 로고와 같은 이유로 끄지 않는다. */
    mapDataControl?: boolean;
    /** 저작권 표시의 위치. 로고와 같은 앵커여야 한 그룹이 되어 globals.css 의 여백이 둘 다에 걸린다(ADR-008 v9). */
    mapDataControlOptions?: ControlOptions;
    scaleControl?: boolean;
    zoomControl?: boolean;
  }

  /** 상세 화면의 미니 지도는 이 옵션들로 **움직이지 않는 그림**이 된다(스크롤하던 손가락이 지도에 붙잡히지 않게). */
  class Map {
    constructor(container: HTMLElement | string, options: MapOptions);
    setCenter(latlng: LatLng): void;
    getZoom(): number;
    setZoom(zoom: number): void;
    /**
     * 중심과 줌을 함께 옮기며 부드럽게 날아간다. 내 위치 버튼이 쓴다 — `setCenter` + `setZoom` 을
     * 따로 부르면 두 번 튄다. `zoom` 을 빼면 지금 줌을 유지한다.
     */
    morph(coord: LatLng, zoom?: number): void;
    /** 범위가 다 들어오는 중심·줌으로 옮긴다. 핀이 가까이 모이면 끝까지 확대하므로 부른 뒤 줌을 눌러 준다. */
    fitBounds(bounds: LatLngBounds, margin?: Margin): void;
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
    setPosition(position: LatLng): void;
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
