'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle } from '@untitledui/icons';
import { Button } from '@/components/base/button';
import { EmptyState } from '../components/layout/emptyState';
import type { TEligibility } from '../lib/eligibility';
import { loadNaverMaps, onNaverMapsAuthFailure } from '../lib/naverMap';
import { JEJU_CENTER, jejuZoomFor, TYPE_COLOR, TYPE_META, type TPlaceEntry } from '../lib/places';
import type { TPlaceType } from '../types';

/**
 * 마커는 SDK 가 그리는 평범한 핀이고, 우리가 정하는 것은 **색 하나**다.
 *
 * 예전에는 종류마다 원·둥근사각·물방울을 직접 그리고 판정에 따라 테두리를 점선으로 바꾸거나
 * 회색을 입혔는데, 지도 위에서 그 차이는 읽히지 않으면서 코드만 무거웠다. 지금은 지도가
 * "어디에 몇 곳이 있나" 만 답하고, 종류·판정의 자세한 구분은 마커를 눌러 열리는 시트와
 * 목록 화면이 맡는다.
 *
 * 색을 남기는 이유는 이 앱에 장소 사진이 없어서다(ADR-002) — 종류를 가르는 신호가 색뿐이다.
 */
const PIN = { width: 26, height: 36 } as const;
const PIN_SELECTED = { width: 34, height: 47 } as const;

/** 판정이 'hard' 인 곳. 숨기지 않고 "갈 수는 있지만 눈에 덜 띄게" 흐린다 — Marker 의 기본 옵션이다. */
const MARKER_HARD_OPACITY = 0.45;

/**
 * 종류 색을 입힌 핀 SVG 를 data URI 로. 외부 이미지를 받지 않아 오프라인에서도 그려진다
 * (이 앱은 글꼴까지 self-host 한다 — 런타임 외부 요청을 늘리지 않는다).
 */
function pinSvg(type: TPlaceType, width: number, height: number): string {
  // width·height 를 박아 둔다 — 없으면 SVG 의 고유 크기가 브라우저 기본값(150 높이)으로 잡힌다.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 24 34"><path d="M12 .9C5.9.9.9 5.9.9 12c0 8 11.1 21.1 11.1 21.1S23.1 20 23.1 12C23.1 5.9 18.1.9 12 .9z" fill="${TYPE_COLOR[type]}" stroke="#fff" stroke-width="1.7"/><circle cx="12" cy="12" r="4.1" fill="#fff"/></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * 아이콘은 종류 × 선택여부 6가지뿐이라 한 번 만들어 두고 계속 쓴다.
 * 선택을 옮길 때마다 새 객체를 만들면 SDK 가 이미지를 다시 물어본다.
 */
const PIN_ICONS = new Map<string, naver.maps.ImageIcon>();

function pinIcon(
  maps: typeof naver.maps,
  type: TPlaceType,
  selected: boolean,
): naver.maps.ImageIcon {
  const key = `${type}:${selected}`;
  const cached = PIN_ICONS.get(key);
  if (cached) return cached;

  const { width, height } = selected ? PIN_SELECTED : PIN;
  const icon: naver.maps.ImageIcon = {
    url: pinSvg(type, width, height),
    size: new maps.Size(width, height),
    // 좌표에 맞출 지점은 핀의 **끝**이다 — 가운데로 두면 핀이 장소보다 아래를 가리킨다.
    // Kakao 의 MarkerImage `offset` 과 같은 뜻이고, 원점은 이미지 좌상단이다.
    anchor: new maps.Point(width / 2, height),
  };
  PIN_ICONS.set(key, icon);
  return icon;
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

type TMapPageCanvasProps = {
  /** 좌표가 있는 장소들. 필터가 끝난 뒤의 목록이다. */
  places: TPlaceEntry[];
  selectedId: string | null;
  /** 참조가 안정적이어야 한다 — 바뀌면 마커를 전부 다시 만든다. */
  onSelect: (id: string) => void;
  eligibilityMap: Map<string, TEligibility> | null;
};

/**
 * 네이버 지도와 장소 마커.
 *
 * SDK 가 명령형이라 React 밖에서 지도를 직접 만든다.
 * `MapPage` 는 무엇을 보여줄지만 정하고 이 파일이 그리는 일을 맡는다.
 */
export function MapPageCanvas({
  places,
  selectedId,
  onSelect,
  eligibilityMap,
}: TMapPageCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<naver.maps.Map | null>(null);
  const markersRef = useRef(new Map<string, TMarkerEntry>());
  /*
   * 크기 재측정 타이머. effect 안의 지역 변수가 아니라 ref 인 이유는 **지도 effect 의 deps 가
   * `[]` 이라 그 cleanup 이 언마운트에서만 돌기** 때문이다. `status` 가 'error' 로 넘어가면
   * 아래 폴백이 지도 컨테이너를 DOM 에서 빼는데, 그때 타이머를 꺼 줄 곳이 필요하다.
   */
  const settleRef = useRef<number | undefined>(undefined);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

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
        const map = new maps.Map(containerRef.current, {
          center: new maps.LatLng(JEJU_CENTER[0], JEJU_CENTER[1]),
          // 컨테이너 폭에서 계산한다 — 모바일 390px 는 9, 데스크톱 830px 는 10 이 된다.
          zoom: jejuZoomFor(containerRef.current.clientWidth),
          /*
           * 로고·저작권 표시는 끄지 않는다 — Maps 서비스 이용약관 제7조 ⑩.
           *
           * **끄지 않는 것만으로는 부족해서 위치도 옮긴다**(self-cr 지적). 기본 앵커가
           * `BOTTOM_RIGHT` 인데 이 화면은 하단을 전폭으로 덮는 것이 셋이다 — 빈 상태
           * `EmptyState` 둘(`mapPage.tsx` 의 `inset-x-0 bottom-0 z-[1001]`)과 **바텀시트**.
           * 시트는 마커를 누르면 열리는 기본 상호작용이고 react-aria 가 `document.body` 로
           * 포털해 그려서 `z-index`·`overflow` 로는 피할 수 없다. 즉 정상 경로에서 표시가
           * 사라진다 — 주석이 준수를 주장하는데 화면은 아닌 상태였다.
           * 우상단은 종류 칩(`top-0`)이 있지만 칩이 셋뿐이라 가로로 비어 있다.
           */
          logoControl: true,
          logoControlOptions: { position: maps.Position.TOP_RIGHT },
          mapDataControl: true,
          mapDataControlOptions: { position: maps.Position.TOP_RIGHT },
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
      // 이벤트와 DOM 을 함께 걷어낸다 — Kakao 에는 없던 정리다.
      mapRef.current?.destroy();
      mapRef.current = null;
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

        const marker = new maps.Marker({
          map,
          position: new maps.LatLng(place.geo.lat, place.geo.lng),
          icon: pinIcon(maps, place.type, selected),
          title: `${place.name} · ${TYPE_META[place.type].label}`,
          clickable: true,
          zIndex: selected ? 1000 : 0,
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
    // selectedId 는 일부러 뺀다 — 선택만 바뀔 때 마커를 다시 만들지 않고 아래 effect 가 핀만 바꾼다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [places, eligibilityMap, onSelect, status]);

  // 선택 표시. 마커를 다시 만들지 않고 핀 이미지와 쌓임 순서만 바꾼다.
  useEffect(() => {
    const maps = window.naver?.maps;
    if (!maps) return;
    try {
      for (const [id, entry] of markersRef.current) {
        const selected = id === selectedId;
        entry.marker.setIcon(pinIcon(maps, entry.type, selected));
        entry.marker.setZIndex(selected ? 1000 : 0);
      }
    } catch {
      // 위 effect 와 같은 이유 — 깨진 지도 위에서 SDK 가 던진다. 화면을 깨뜨리지 않는다.
      // effect 본문에서 곧바로 setState 하면 렌더가 연쇄되므로 한 틱 미룬다.
      queueMicrotask(() => setStatus('error'));
    }
  }, [selectedId, places, eligibilityMap, status]);

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
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}
