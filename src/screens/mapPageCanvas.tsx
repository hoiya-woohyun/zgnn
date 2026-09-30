'use client';

import { type Ref, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { AlertTriangle } from '@untitledui/icons';
import { Button } from '@/components/base/button';
import { EmptyState } from '../components/layout/emptyState';
import type { TEligibility } from '../lib/eligibility';
import { loadNaverMaps, onNaverMapsAuthFailure } from '../lib/naverMap';
import { pinIcon } from '../lib/naverMapPin';
import { JEJU_CENTER, jejuZoomFor, MY_LOCATION_COLOR, PLACE_FOCUS_ZOOM, TYPE_META, type TPlaceEntry } from '../lib/places';
import type { TGeo, TPlaceType } from '../types';

/** 판정이 'hard' 인 곳. 숨기지 않고 "갈 수는 있지만 눈에 덜 띄게" 흐린다 — Marker 의 기본 옵션이다. */
const MARKER_HARD_OPACITY = 0.45;

/** 저장한 곳은 겹쳤을 때 위로 올린다 — 모아 보려고 저장했는데 남의 핀 밑에 깔리면 안 된다. */
const Z_SAVED = 500;
const Z_SELECTED = 1000;

/** 내 위치 점의 크기(px). 후광까지 포함한 캔버스이고, 가운데가 좌표다. */
const MY_LOCATION_SIZE = 28;

/** 장소 핀보다 위다 — 내 위치가 핀 밑에 깔리면 "여기서 가까운 곳" 을 가늠할 기준이 사라진다. */
const Z_MY_LOCATION = 2000;

/**
 * 내 위치로 옮길 때의 줌. 동네 하나(보이는 경도 약 0.03°, 3km 안팎)가 드는 단계다 — "여기서 가까운 곳"
 * 을 보려고 누르는 버튼이라서다. 사용자가 이미 더 당겨 보고 있으면 그대로 둔다.
 */
const MY_LOCATION_ZOOM = 14;

/** 내 위치 점 — 옅은 후광 + 흰 테두리 파란 점. 핀과 같은 이유로 data URI 로 만든다(오프라인). */
function myLocationIcon(maps: typeof naver.maps): naver.maps.ImageIcon {
  const size = MY_LOCATION_SIZE;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 28 28">` +
    `<circle cx="14" cy="14" r="13" fill="${MY_LOCATION_COLOR}" fill-opacity="0.18"/>` +
    `<circle cx="14" cy="14" r="7" fill="${MY_LOCATION_COLOR}" stroke="#fff" stroke-width="2.5"/>` +
    `</svg>`;
  return {
    url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    size: new maps.Size(size, size),
    anchor: new maps.Point(size / 2, size / 2),
  };
}

/**
 * 마커와 그 마커에 건 리스너 핸들을 함께 들고 있는다.
 *
 * **Kakao 에 없던 정리 의무다.** `naver.maps.Event.addListener` 는 핸들을 돌려주고,
 * `setMap(null)` 만으로는 그 리스너가 풀리지 않는다 — 목록이 바뀔 때마다 마커를 다시 만드는
 * 이 화면에서는 그대로 두면 리스너가 쌓인다.
 */
type TMarkerEntry = {
  marker: naver.maps.Marker;
  type: TPlaceType;
  listener: naver.maps.MapEventListener;
};

/**
 * 마커를 지도에서 떼고 리스너를 푼다. 여러 번 불러도 안전하다.
 *
 * 두 effect 가 모두 이걸 부르는 이유는 **정리 순서** 때문이다. React 는 cleanup 을 effect
 * 선언 순서로 돌리므로 언마운트에서 지도 effect 의 `map.destroy()` 가 마커 effect 의 정리보다
 * **먼저** 간다. 파괴된 지도의 마커를 그 뒤에 건드리지 않도록, 지도를 파괴하기 전에 여기서 비운다.
 */
function clearMarkers(markers: Map<string, TMarkerEntry>) {
  const maps = window.naver?.maps;
  for (const entry of markers.values()) {
    /*
     * 엔트리마다 따로 감싼다 — **떼어내는 쪽도 던진다.** 마커를 *올릴* 때 SDK 가 던지는 건
     * 실측했고(아래 마커 effect 주석), 그 지도는 이미 깨져 있으므로 `setMap(null)` 이라고
     * 무사할 이유가 없다. 이게 심각한 이유는 재진입이다: 루프가 중간에 끊기면 아래
     * `markers.clear()` 에 닿지 못해 죽은 엔트리가 그대로 남고, 다음 호출이 같은 자리에서
     * 또 던진다 — 한 번의 실패가 영구 고장이 된다. 정리는 실패해도 계속 진행해야 한다.
     */
    try {
      if (maps) maps.Event.removeListener(entry.listener);
    } catch {
      // 리스너를 못 떼어도 마커는 떼어 본다.
    }
    try {
      entry.marker.setMap(null);
    } catch {
      // 지도가 이미 깨졌다는 뜻. 남은 엔트리 정리를 멈추지 않는다.
    }
  }
  markers.clear();
}

/** `MapPage` 가 내 위치 버튼에서 부른다. 지도가 아직 없거나 깨졌으면 false 를 돌려준다. */
export type TMapPageCanvasHandle = {
  showMyLocation: (lat: number, lng: number) => boolean;
};

type TMapPageCanvasProps = {
  ref?: Ref<TMapPageCanvasHandle>;
  /** 좌표가 있는 장소들. 필터가 끝난 뒤의 목록이다. */
  places: TPlaceEntry[];
  selectedId: string | null;
  /** 참조가 안정적이어야 한다 — 바뀌면 마커를 전부 다시 만든다. */
  onSelect: (id: string) => void;
  eligibilityMap: Map<string, TEligibility> | null;
  /** 저장한 장소 id. 핀에 하트 배지를 얹고 위로 올린다. 참조가 바뀌면 마커를 다시 만든다. */
  savedIds: ReadonlySet<string>;
  /**
   * 첫 화면을 이 좌표에 맞춘다(`/map/?place=<id>` — 상세 화면의 미니 지도에서 넘어올 때).
   * 없으면 섬 전체가 드는 줌으로 연다. 지도를 만든 뒤에 바뀌면 그 자리로 옮긴다.
   */
  focus?: TGeo | null;
};

/**
 * 네이버 지도와 장소 마커.
 *
 * SDK 가 명령형이라 React 밖에서 지도를 직접 만든다.
 * `MapPage` 는 무엇을 보여줄지만 정하고 이 파일이 그리는 일을 맡는다.
 */
export function MapPageCanvas({
  ref,
  places,
  selectedId,
  onSelect,
  eligibilityMap,
  savedIds,
  focus = null,
}: TMapPageCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<naver.maps.Map | null>(null);
  const markersRef = useRef(new Map<string, TMarkerEntry>());
  /** 내 위치 점. 처음 누를 때 만들고, 다시 누르면 자리만 옮긴다. */
  const myLocationRef = useRef<naver.maps.Marker | null>(null);
  /*
   * 크기 재측정 타이머. effect 안의 지역 변수가 아니라 ref 인 이유는 **지도 effect 의 deps 가
   * `[]` 이라 그 cleanup 이 언마운트에서만 돌기** 때문이다. `status` 가 'error' 로 넘어가면
   * 아래 폴백이 지도 컨테이너를 DOM 에서 빼는데, 그때 타이머를 꺼 줄 곳이 필요하다.
   */
  const settleRef = useRef<number | undefined>(undefined);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  /*
   * 지도 effect 의 deps 가 `[]` 라 **마운트 때의** `focus` 를 ref 에 붙잡아 만들 때 읽는다. 그 뒤의 변화는
   * 아래 focus effect 가 맡는다. `appliedFocusRef` 는 마지막으로 시야를 맞춘 좌표 — 그 effect 가
   * **같은 좌표로 두 번 옮기지 않게**(만들 때 이미 맞췄다) 한다.
   */
  const focusRef = useRef(focus);
  const appliedFocusRef = useRef<TGeo | null>(null);

  // 지도 만들기. SDK 는 한 번만 받고, 이 화면을 다시 열면 캐시된 결과를 쓴다.
  useEffect(() => {
    let cancelled = false;
    // cleanup 에서 ref 를 다시 읽지 않도록 지금 붙잡아 둔다(useRef 가 만든 Map 은 재할당되지 않는다).
    const markers = markersRef.current;

    /*
     * 인증 실패는 스크립트 load 보다 **늦게** 온다 — SDK 가 지도를 만들며 `/v3/auth` 를 부르고
     * 그 응답을 보고 판정하기 때문이다. 그래서 아래 then 이 이미 'ready' 로 바꾼 뒤에도 실패가
     * 올 수 있고, 그때 지도는 떠 있지만 타일이 안 깔린다. 구독해서 폴백으로 넘긴다.
     */
    const unsubscribe = onNaverMapsAuthFailure(() => {
      if (!cancelled) setStatus('error');
    });

    loadNaverMaps()
      .then((maps) => {
        if (cancelled || !containerRef.current) return;
        /*
         * 여기서 던지면 **이 `.then()` 이 반환한 promise 가 reject 되어 아래 `.catch` 가 받는다**
         * — try 블록이 아니다(예전 주석이 try 를 설명했는데 이 자리엔 try 가 없었다).
         *
         * 받아야 하는 이유 — **인증 실패가 `navermap_authFailure` 로 오지 않을 수 있다.**
         * 2026-09-23 실측: 등록 안 된 출처에서 `/v3/auth` 가 401 을 냈을 때 그 전역 콜백은
         * 불리지 않았고, 대신 SDK 안에서 `Cannot read properties of null (reading 'capitalize')`
         * 이 `Marker.setMap` 까지 타고 올라왔다. 콜백만 믿으면 그 경우 폴백이 안 뜨고
         * 깨진 지도가 그대로 남는다 — 이 앱이 가장 피하려던 화면이다(ADR-008).
         */
        const initialFocus = focusRef.current;
        appliedFocusRef.current = initialFocus;
        const map = new maps.Map(containerRef.current, {
          // 장소 하나를 가리키며 들어왔으면 그 자리에서 연다 — 섬 전체를 먼저 그렸다가 날아가지 않게.
          center: initialFocus
            ? new maps.LatLng(initialFocus.lat, initialFocus.lng)
            : new maps.LatLng(JEJU_CENTER[0], JEJU_CENTER[1]),
          // 컨테이너 폭에서 계산한다 — 모바일 390px 는 10, 데스크톱 830px 는 11 이 된다.
          zoom: initialFocus ? PLACE_FOCUS_ZOOM : jejuZoomFor(containerRef.current.clientWidth),
          /*
           * 로고·저작권 표시는 끄지 않는다 — Maps 서비스 이용약관 제7조 ⑩.
           *
           * 자리는 좌하단이다(ADR-008 v9, 사용자 요청 — 우상단은 종류 칩 옆에서 눈에 걸렸다).
           * 축척 막대는 기본값(우하단)에 남고, 좁은 폭에서 둘이 부딪히는 것은 globals.css 가 푼다.
           *
           * **하단이라 덮는 것이 있다** — 빈 상태 `EmptyState` 둘은 아래 여백
           * (`above-map-attribution`)으로 비켜 가지만, `sm` 미만의 **바텀시트**와 낮은 화면(가로로 든 폰,
           * 높이 약 415px 이하)의 **가운데 대화상자**는 열려 있는 동안 이 줄을 가린다 — 대화상자에 최대
           * 높이가 없어 불투명한 판이 화면 아래 끝까지 닿는다.
           * react-aria 가 `document.body` 로 포털해 그려 `z-index`·`overflow` 로는 못 피한다.
           * 시트는 모달이라 그동안 지도 조작도 막혀 있고, 닫으면 돌아온다 — 이 가려짐은
           * 알고 받아들인 것이다(2026-09-23 에 한 번 거절했던 것을 09-28 에 번복).
           */
          logoControl: true,
          logoControlOptions: { position: maps.Position.BOTTOM_LEFT },
          mapDataControl: true,
          mapDataControlOptions: { position: maps.Position.BOTTOM_LEFT },
        });
        mapRef.current = map;
        setStatus('ready');

        /*
         * 지도 높이가 100dvh 기준이라 첫 렌더 때 SDK 가 잰 크기와 실제 크기가 어긋난다.
         * 그대로 두면 아래쪽에 타일이 안 깔린 빈 띠가 남는다.
         * Kakao 의 `relayout()` 자리이고, 네이버는 `refresh()` 다(`relayout` 은 없다).
         * 인자 true 는 페이드 인을 건너뛴다 — 크기만 다시 재는 자리라 효과가 필요 없다.
         */
        map.refresh(true);
        settleRef.current = window.setTimeout(() => {
          settleRef.current = undefined;
          // 타이머 콜백은 effect 바깥이라 어떤 try/catch 도 덮지 못한다 — 여기서 직접 받는다.
          // 아래 'error' effect 가 먼저 꺼 주지만, 그 사이에 지도가 깨질 수도 있다.
          try {
            map.refresh(true);
          } catch {
            // 인증이 거부됐거나 컨테이너가 떨어져 나간 뒤다. 폴백은 마커 effect 가 띄운다.
          }
        }, 250);
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });

    return () => {
      cancelled = true;
      unsubscribe();
      if (settleRef.current !== undefined) window.clearTimeout(settleRef.current);
      settleRef.current = undefined;
      // 지도를 파괴하기 전에 마커부터 비운다 — 이 cleanup 이 마커 effect 의 것보다 먼저 돈다.
      clearMarkers(markers);
      // 내 위치 점도 같은 이유로 지도보다 먼저 뗀다.
      try {
        myLocationRef.current?.setMap(null);
      } catch {
        // 이미 깨진 지도다.
      } finally {
        myLocationRef.current = null;
      }
      /*
       * 이벤트와 DOM 을 함께 걷어낸다 — Kakao 에는 없던 정리다.
       * `clearMarkers` 와 **같은 이유로 감싼다**: `setMap(null)` 이 깨진 지도에서 던질 수 있다고
       * 봤다면 `destroy()` 는 더 그렇다(같은 인스턴스를 더 크게 해체한다). 여기서 던지면
       * passive cleanup 이라 React 19 가 에러 경계까지 올려 — **폴백은 떴는데 지도 화면을
       * 떠나는 순간 앱이 깨진다.** finally 로 참조도 반드시 끊는다(안 그러면 파괴된 map 이 남는다).
       */
      try {
        mapRef.current?.destroy();
      } catch {
        // 이미 깨진 지도다. 참조만 끊고 넘어간다.
      } finally {
        mapRef.current = null;
      }
    };
  }, []);

  /*
   * 'error' 로 넘어가면 아래 폴백이 지도 컨테이너를 DOM 에서 뺀다. 떼어낸 컨테이너에
   * `refresh()` 를 때리면 SDK 가 던지는데, **타이머 콜백이라 effect 의 try/catch 밖**이다.
   * 지도 effect 의 deps 가 `[]` 이라 그 cleanup 은 언마운트에서만 도는 것이 문제의 핵심 —
   * 여기서 `status` 를 보고 끈다.
   */
  useEffect(() => {
    if (status !== 'error' || settleRef.current === undefined) return;
    window.clearTimeout(settleRef.current);
    settleRef.current = undefined;
  }, [status]);

  /*
   * 지도가 'error' 로 넘어가면 내 위치 점도 뗀다 — 장소 마커는 마커 effect 의 cleanup 이 같은 순간에 떼지만,
   * 이 점은 버튼이 만들어 그 effect 밖에 있다. 떼지 않으면 버려진 지도를 붙잡은 채 남는다.
   */
  useEffect(() => {
    if (status !== 'error' || !myLocationRef.current) return;
    try {
      myLocationRef.current.setMap(null);
    } catch {
      // 이미 깨진 지도다.
    } finally {
      myLocationRef.current = null;
    }
  }, [status]);

  // 마커 올리기. 목록이나 판정이 바뀌면 통째로 다시 만든다 — 86곳 규모에서는 차분을 계산하는 것보다 안전하다.
  useEffect(() => {
    const map = mapRef.current;
    const maps = window.naver?.maps;
    if (status !== 'ready' || !map || !maps) return;

    const markers = markersRef.current;
    clearMarkers(markers);

    /*
     * 마커 만들기를 try 로 감싼다 — **인증이 거부된 지도 위에서 `setMap` 이 터진다.**
     * 2026-09-23 실측: 등록 안 된 출처에서 SDK 안쪽이 `Cannot read properties of null
     * (reading 'capitalize')` 을 던졌고, 그게 여기서 React 커밋까지 올라가 화면 전체를 깼다.
     * `navermap_authFailure` 는 그 경우 불리지 않았다 — 즉 **콜백만으로는 폴백이 안 뜬다.**
     * 지도 생성(위 effect)은 promise 의 catch 가 덮지만 이 effect 는 그 바깥이라 여기서 받는다.
     */
    try {
      for (const place of places) {
        if (!place.geo) continue;
        const selected = place.id === selectedId;
        const saved = savedIds.has(place.id);

        const marker = new maps.Marker({
          map,
          position: new maps.LatLng(place.geo.lat, place.geo.lng),
          icon: pinIcon(maps, place.type, selected, saved),
          title: `${place.name} · ${TYPE_META[place.type].label}`,
          clickable: true,
          zIndex: selected ? Z_SELECTED : saved ? Z_SAVED : 0,
          opacity:
            eligibilityMap?.get(place.id)?.level === 'hard' ? MARKER_HARD_OPACITY : 1,
        });
        const listener = maps.Event.addListener(marker, 'click', () => onSelect(place.id));

        markers.set(place.id, { marker, type: place.type, listener });
      }
    } catch {
      clearMarkers(markers);
      queueMicrotask(() => setStatus('error'));
    }

    return () => clearMarkers(markers);
    // selectedId·savedIds 는 일부러 뺀다 — 선택이 옮겨 가거나 하트 하나를 누를 때마다 핀 86개를 다시 만들 이유가
    // 없다. 처음 그릴 때의 값만 읽고, 바뀐 뒤에는 아래 effect 가 핀 이미지와 쌓임 순서만 바꾼다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [places, eligibilityMap, onSelect, status]);

  // 선택·저장 표시. 마커를 다시 만들지 않고 핀 이미지와 쌓임 순서만 바꾼다.
  useEffect(() => {
    const maps = window.naver?.maps;
    if (!maps) return;
    try {
      for (const [id, entry] of markersRef.current) {
        const selected = id === selectedId;
        const saved = savedIds.has(id);
        entry.marker.setIcon(pinIcon(maps, entry.type, selected, saved));
        entry.marker.setZIndex(selected ? Z_SELECTED : saved ? Z_SAVED : 0);
      }
    } catch {
      // 위 effect 와 같은 이유 — 깨진 지도 위에서 SDK 가 던진다. 화면을 깨뜨리지 않는다.
      // effect 본문에서 곧바로 setState 하면 렌더가 연쇄되므로 한 틱 미룬다.
      queueMicrotask(() => setStatus('error'));
    }
  }, [selectedId, places, eligibilityMap, savedIds, status]);

  /*
   * 지도를 만든 뒤에 `focus` 가 바뀐 경우(지도 화면에 머문 채 주소의 `?place=` 만 바뀜). 만들 때 맞춘
   * 좌표와 같으면 건너뛴다. `focus` 가 사라지는 것(저장 칩이 주소를 `/map/` 으로 바꿀 때)은 시야를
   * 되돌릴 이유가 아니다 — 사용자가 보던 자리를 그대로 둔다.
   */
  const focusLat = focus?.lat;
  const focusLng = focus?.lng;
  useEffect(() => {
    const map = mapRef.current;
    const maps = window.naver?.maps;
    if (status !== 'ready' || !map || !maps || focusLat === undefined || focusLng === undefined) return;
    const applied = appliedFocusRef.current;
    if (applied && applied.lat === focusLat && applied.lng === focusLng) return;
    appliedFocusRef.current = { lat: focusLat, lng: focusLng };
    try {
      map.morph(new maps.LatLng(focusLat, focusLng), Math.max(map.getZoom(), PLACE_FOCUS_ZOOM));
    } catch {
      queueMicrotask(() => setStatus('error'));
    }
  }, [focusLat, focusLng, status]);

  /*
   * 내 위치로 옮기고 점을 찍는다. 옮기는 것은 누를 때 한 번뿐이다 — 따라다니지 않으므로(ADR-008 v13·v14)
   * 그 뒤에 사용자가 지도를 끌어도 되돌리지 않는다.
   */
  useImperativeHandle(
    ref,
    () => ({
      showMyLocation(lat, lng) {
        const map = mapRef.current;
        const maps = window.naver?.maps;
        if (status !== 'ready' || !map || !maps) return false;
        try {
          const position = new maps.LatLng(lat, lng);
          if (myLocationRef.current) myLocationRef.current.setPosition(position);
          else
            myLocationRef.current = new maps.Marker({
              map,
              position,
              icon: myLocationIcon(maps),
              title: '내 위치',
              clickable: false,
              zIndex: Z_MY_LOCATION,
            });
          map.morph(position, Math.max(map.getZoom(), MY_LOCATION_ZOOM));
          return true;
        } catch {
          // 마커 effect 와 같은 이유 — 깨진 지도 위에서 SDK 가 던진다. 폴백으로 넘긴다.
          queueMicrotask(() => setStatus('error'));
          return false;
        }
      },
    }),
    [status],
  );

  /*
   * SDK 를 못 받았거나 인증이 거부된 경우. Leaflet 때는 타일만 안 깔리고 마커는 그려졌지만,
   * 네이버는 지도 자체가 외부 스크립트라 실패하면 보여줄 것이 남지 않는다.
   * 이 앱은 오프라인으로도 쓰는 것이 전제라(ADR-001) 빈 화면 대신 목록으로 안내한다.
   */
  if (status === 'error') {
    return (
      <div className="flex h-full w-full items-center justify-center bg-secondary p-4">
        <EmptyState
          Icon={AlertTriangle}
          title="지도는 인터넷이 필요해요"
          description="연결이 없어도 저장한 곳과 장소 목록은 그대로 볼 수 있어요."
          action={
            <Button color="primary" size="lg" href="/places/stay/">
              장소 목록으로 보기
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="h-full w-full bg-secondary">
      {/* `naver-map` 은 스타일이 아니라 **선택자**다 — SDK 가 클래스 없이 심는 컨트롤 그룹을
          globals.css 가 이 클래스 밑에서만 고른다(모서리 여백). 지우면 여백이 조용히 사라진다. */}
      <div ref={containerRef} className="naver-map h-full w-full" />
    </div>
  );
}
