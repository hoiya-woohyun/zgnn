'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle } from '@untitledui/icons';
import { Button } from '@/components/base/button';
import { EmptyState } from '../components/layout/emptyState';
import type { TEligibility } from '../lib/eligibility';
import { loadNaverMaps, onNaverMapsAuthFailure } from '../lib/naverMap';
import { JEJU_CENTER, jejuZoomFor, SAVED_MARKER_COLOR, TYPE_COLOR, TYPE_META, type TPlaceEntry } from '../lib/places';
import type { TPlaceType } from '../types';

/**
 * 핀의 **모양은 네이버 표준을 그대로 따르고**, 우리가 정하는 것은 **색 하나**다.
 *
 * 모양은 추측이 아니라 SDK 가 쓰는 기본 마커 에셋(`marker-default.png`, 22×33)을 받아
 * 픽셀을 재서 옮긴 것이다(2026-09-28). 그 핀의 특징은 셋이다 —
 *  1. 가로:세로가 **2:3**(22×33). 예전 핀은 26×36(1:1.38)이라 더 뭉툭했다.
 *  2. 머리의 **대부분이 흰 원**이다(바깥 반지름 10.5 중 흰 원이 8 — 색 테두리는 2.5뿐).
 *  3. 그 흰 원 안에 **종류 색 역삼각형(▼)** 이 있다. 이게 네이버 핀을 네이버 핀으로 읽히게
 *     하는 부분이라, 흰 ▼ 로 뒤집지 않는다 — 뒤집으면 아무도 네이버 핀으로 보지 않는다.
 *     삼각형은 **무게중심**이 흰 원의 중심에 오게 놓는다(에셋의 구성이 그렇다).
 *
 * 색을 종류별로 남기는 이유는 이 앱에 장소 사진이 없어서다(ADR-002) — 종류를 가르는 신호가
 * 색뿐이라 표준 핀의 파랑 하나로 통일할 수 없다. 색값 자체는 `TYPE_COLOR` 그대로 쓴다.
 *
 * 흰 테두리(`stroke`)는 **표준 에셋에 없는 의도적 이탈**이다. 이 지도는 81곳이 북·동 해안에
 * 몰려 마커가 서로 겹치는데, 표준 핀은 머리가 이미 흰색이라 후광이 없으면 겹친 핀들의
 * 색 테두리끼리 붙어 경계가 뭉갠다. 지우려면 겹치는 구간을 먼저 눈으로 확인할 것.
 *
 * 예전에는 종류마다 원·둥근사각·물방울을 직접 그리고 판정에 따라 테두리를 점선으로 바꾸거나
 * 회색을 입혔는데, 지도 위에서 그 차이는 읽히지 않으면서 코드만 무거웠다. 지금도 지도는
 * "어디에 몇 곳이 있나" 만 답하고, 종류·판정의 자세한 구분은 마커를 눌러 열리는 시트와
 * 목록 화면이 맡는다(→ ADR-008).
 */
const PIN = { width: 24, height: 36 } as const;
const PIN_SELECTED = { width: 32, height: 48 } as const;

/** 판정이 'hard' 인 곳. 숨기지 않고 "갈 수는 있지만 눈에 덜 띄게" 흐린다 — Marker 의 기본 옵션이다. */
const MARKER_HARD_OPACITY = 0.45;

/**
 * 표준 핀의 치수. 에셋(22×33)에서 잰 값을 그대로 쓰되, 흰 테두리가 잘리지 않게 머리를
 * 반지름 10.5 → 10.2 로만 줄였다. `stroke` 는 선 중앙에 걸려 절반(0.75)이 밖으로 나가는데,
 * 10.5 로 두면 좌우가 viewBox 를 0.25 넘어가 **테두리만 납작하게 잘린다**(빌드는 통과한다).
 * 꼬리 끝을 32.2 에 두는 것도 같은 이유다 — 33 에 붙이면 끝이 잘리며 앵커가 어긋나 보인다.
 *
 * 꼬리 끝의 `stroke-linejoin` 을 `round` 로 두는 것도 같은 계산이다. 기본값 miter 면 끝이
 * 뾰족해 획이 꼭짓점 **너머로** 뻗는데(두 접선이 이루는 각 ~77° → 0.75 × 1.61 = 1.21),
 * 32.2 + 1.21 = 33.41 로 viewBox 를 넘어 끝만 잘린다. round 는 0.75 로 끝나 32.95 에 멈춘다.
 * 에셋의 끝도 바늘처럼 뾰족하지 않고 살짝 뭉툭하다.
 */
const PIN_VIEWBOX = { width: 22, height: 33 } as const;

/**
 * 저장한 곳의 핀. 핀은 그대로 두고 **머리 오른쪽 위에 하트 배지**를 얹는다 — 흰 원 안의 ▼ 를
 * 하트로 바꾸지 않는 이유는 위 주석과 같다(▼ 가 네이버 핀을 네이버 핀으로 읽히게 한다).
 *
 * 배지(중심 22.5, 6.5 · 반지름 5.5 · 흰 테두리 1.5)가 핀 viewBox 를 오른쪽·위로 넘으므로 캔버스를
 * 29×35 로 넓히고 핀을 아래로 2 내린다. 오른쪽 끝 22.5+5.5+0.75=28.75, 위 끝 6.5-5.5-0.75=0.25,
 * 꼬리 끝 32.2+2+0.75=34.95 — 모두 안쪽이다. 핀 좌표계의 비율(24/22)은 그대로라, 저장 여부와
 * 무관하게 **핀 몸통의 크기와 앵커(꼬리 끝)는 같은 자리**에 온다.
 */
const SAVED_PIN_VIEWBOX = { width: 29, height: 35 } as const;
const SAVED_PIN_SHIFT_Y = 2;

/** 24 칸 기준 하트(가로 3~21, 세로 4.3~20.5, 중심 12, 12.4). 배지 안에 줄여 넣는다. */
const HEART =
  'M12 20.5C12 20.5 3 15 3 9.2 3 6.3 5.2 4.3 7.7 4.3c1.8 0 3.4 1 4.3 2.5.9-1.5 2.5-2.5 4.3-2.5 2.5 0 4.7 2 4.7 4.9 0 5.8-9 11.3-9 11.3Z';

/** 저장한 곳은 겹쳤을 때 위로 올린다 — 모아 보려고 저장했는데 남의 핀 밑에 깔리면 안 된다. */
const Z_SAVED = 500;
const Z_SELECTED = 1000;

/**
 * 종류 색을 입힌 핀 SVG 를 data URI 로. 외부 이미지를 받지 않아 오프라인에서도 그려진다
 * (이 앱은 글꼴까지 self-host 한다 — 런타임 외부 요청을 늘리지 않는다). 네이버가 내려주는
 * `marker-default.png` 를 그대로 쓰지 않는 이유가 이것이고, 종류별 색도 거기선 못 준다.
 */
function pinSvg(type: TPlaceType, saved: boolean, width: number, height: number): string {
  const color = TYPE_COLOR[type];
  // 물방울: 머리는 중심 (11, 11.4)·반지름 10.2 의 원, 꼬리는 좌우 대칭으로 (11, 32.2) 까지.
  const body =
    'M11 1.2 C5.367 1.2 0.8 5.767 0.8 11.4 c0 7.9 10.2 20.8 10.2 20.8 S21.2 19.3 21.2 11.4 C21.2 5.767 16.633 1.2 11 1.2 Z';
  // 흰 원(r 7.75) 안의 ▼. 에셋에서 잰 밑변 8·높이 5.5 를 머리를 줄인 비율(10.2/10.5)로 옮겼다.
  // 꼭짓점 15 는 무게중심을 맞추려고 고른 값이다 — (9.6+9.6+15)/3 = 11.4 로 원 중심과 **정확히**
  // 겹친다(에셋의 구성이 그렇다). 14.95 로 두면 11.3833 이라 0.017 어긋난다.
  const arrow = 'M7.1 9.6 h7.8 L11 15 Z';
  const pin =
    `<path d="${body}" fill="${color}" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/>` +
    `<circle cx="11" cy="11.4" r="7.75" fill="#fff"/>` +
    `<path d="${arrow}" fill="${color}"/>`;
  const box = saved ? SAVED_PIN_VIEWBOX : PIN_VIEWBOX;
  // width·height 를 박아 둔다 — 없으면 SVG 의 고유 크기가 브라우저 기본값(150 높이)으로 잡힌다.
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${box.width} ${box.height}">` +
    (saved
      ? `<g transform="translate(0 ${SAVED_PIN_SHIFT_Y})">${pin}</g>` +
        `<circle cx="22.5" cy="6.5" r="5.5" fill="${SAVED_MARKER_COLOR}" stroke="#fff" stroke-width="1.5"/>` +
        `<path d="${HEART}" fill="#fff" transform="translate(22.5 6.6) scale(0.34) translate(-12 -12.4)"/>`
      : pin) +
    `</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * 아이콘은 종류 × 선택여부 × 저장여부 12가지뿐이라 한 번 만들어 두고 계속 쓴다.
 * 선택을 옮길 때마다 새 객체를 만들면 SDK 가 이미지를 다시 물어본다.
 */
const PIN_ICONS = new Map<string, naver.maps.ImageIcon>();

function pinIcon(
  maps: typeof naver.maps,
  type: TPlaceType,
  selected: boolean,
  saved: boolean,
): naver.maps.ImageIcon {
  const key = `${type}:${selected}:${saved}`;
  const cached = PIN_ICONS.get(key);
  if (cached) return cached;

  const pin = selected ? PIN_SELECTED : PIN;
  // 핀 좌표계 1칸이 몇 px 인가. 저장 핀은 캔버스만 넓고 이 비율은 같다.
  const scale = pin.width / PIN_VIEWBOX.width;
  const box = saved ? SAVED_PIN_VIEWBOX : PIN_VIEWBOX;
  const width = box.width * scale;
  const height = box.height * scale;
  const icon: naver.maps.ImageIcon = {
    url: pinSvg(type, saved, width, height),
    size: new maps.Size(width, height),
    // 좌표에 맞출 지점은 핀의 **끝**이다 — 가운데로 두면 핀이 장소보다 아래를 가리킨다.
    // Kakao 의 MarkerImage `offset` 과 같은 뜻이고, 원점은 이미지 좌상단이다.
    // 가로는 핀 몸통의 가운데(핀 좌표 11)다 — 저장 핀은 배지 때문에 캔버스 가운데가 아니다.
    anchor: new maps.Point((PIN_VIEWBOX.width / 2) * scale, height),
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
  /** 저장한 장소 id. 핀에 하트 배지를 얹고 위로 올린다. 참조가 바뀌면 마커를 다시 만든다. */
  savedIds: ReadonlySet<string>;
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
  savedIds,
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
