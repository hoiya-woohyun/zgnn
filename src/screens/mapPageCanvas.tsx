'use client';

import { type Ref, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { AlertTriangle } from '@untitledui/icons';
import { Button } from '@/components/base/button';
import { EmptyState } from '../components/layout/emptyState';
import type { TEligibility } from '../lib/eligibility';
import { mapFailureCopy } from '../lib/mapFailureCopy';
import { mapPageCanvasMarkerLabel } from '../lib/mapPageCanvasMarkerLabel';
import { mapPageMarkerClusterIcon, mapPageMarkerIcon } from '../lib/mapPageMarkerIcon';
import {
  MAP_PAGE_MARKER_NOTHING_SHOWN,
  mapPageMarkerDot,
  type TMapPageMarkerDot,
  type TMapPageMarkerShown,
} from '../lib/mapPageMarkerVerdict';
import {
  mapPageMarkerClusterLabel,
  mapPageMarkerClusterSummary,
  mapPageMarkerClusterZoom,
  mapPageMarkerLayout,
  mapPageMarkerTabOrder,
} from '../lib/mapPageMarkerLayout';
import { loadNaverMaps, onNaverMapsAuthFailure, watchNaverMapInit } from '../lib/naverMap';
import { CHIP_ROW_HEIGHT, mapPageFirstView } from '../lib/mapPageFirstView';
import { mapPageRevealPin } from '../lib/mapPageRevealPin';
import { mapPageViewMemoOf, withMapPageViewMemo } from '../lib/mapPageViewMemo';
import { normalizeRoute } from '../lib/appRoutes';
import { MY_LOCATION_COLOR, PLACE_FOCUS_ZOOM, type TPlaceEntry } from '../lib/places';
import type { TGeo, TPlaceType } from '../types';

/**
 * 판정이 'hard' 인 곳. 숨기지 않고 "갈 수는 있지만 눈에 덜 띄게" 흐린다. 확인 필요·야외만·정보 없음은 흐리지 않고
 * 원에 점을 단다(`mapPageMarkerVerdict`) — 판정 표시가 둘이고, 범례는 둘 다 그려진 것을 센다.
 *
 * **마커 바깥 요소에 직접 건다 — 네이버 `Marker` 에는 `opacity` 옵션도 `setOpacity` 도 없다.** 옵션으로 넘기면
 * 조용히 버려지고 핀은 1.0 으로 그려진다(2026-10-08 실측, 14 W261007.1). Kakao 시절의 옵션을 그대로 옮겨 적어
 * 빌드·테스트가 통과한 채 지도에서만 판정이 사라져 있었다. `setIcon` 은 안쪽 그림만 바꾸므로 이 스타일은 남는다.
 */
export const MARKER_HARD_OPACITY = '0.45';

/** 고른 핀을 시트 위로 올릴 때 시트 윗변과 핀 사이에 두는 틈(px). */
const REVEAL_MARGIN = 12;
/** 확대가 끝난('idle') 뒤에도 마커가 아직 0×0 이면 더 기다리는 프레임 수 — 마커는 'idle' 보다 한두 프레임 늦게 다시 선다(headless 실측). */
const REVEAL_RETRY_FRAMES = 10;

/** 저장한 곳은 겹쳤을 때 위로 올린다 — 모아 보려고 저장했는데 남의 핀 밑에 깔리면 안 된다. */
const Z_SAVED = 500;
/** 묶음 원은 서로·마커와 겹치지 않게 세므로 층이 거의 상관없다 — 고른 핀(묶음에서 꺼낸다)만 그 위에 온다. */
const Z_CLUSTER = 600;
const Z_SELECTED = 1000;
/** Tab 순서를 셀 때 묶음 원의 열쇠 앞머리 — 장소 id 와 겹치지 않는다(장소 id 에 콜론이 없다). */
const CLUSTER_KEY = 'cluster:';

/** 내 위치 점의 크기(px). 후광까지 포함한 캔버스이고, 가운데가 좌표다. */
const MY_LOCATION_SIZE = 28;

/** 장소 핀보다 위다 — 내 위치가 핀 밑에 깔리면 "여기서 가까운 곳" 을 가늠할 기준이 사라진다. */
const Z_MY_LOCATION = 2000;

/**
 * 내 위치로 옮길 때의 줌. 동네 하나(보이는 경도 약 0.03°, 3km 안팎)가 드는 단계다 — "여기서 가까운 곳"
 * 을 보려고 누르는 버튼이라서다. **이미 더 당겨 보고 있어도 이 단계로 맞춘다** — 500m 축척까지 들어간 채
 * 눌렀더니 카페 1곳만 보였다(14 W261019.14d). 더 멀리서 보고 있으면 이 단계까지만 들어온다.
 */
const MY_LOCATION_ZOOM = 14;

/**
 * 저장 모드의 이름표(14 W261013.12) — 저장 핀 셋에 이름이 없어 어느 곳인지 하나씩 눌러 봐야 했다(minji-22 · junhyuk-24b).
 * 원 **밑 가운데**에 단다: 오른쪽에 달면 섬 동쪽 끝(성산)의 저장 곳 이름이 390px 화면 밖으로 잘린다.
 * 원(중심에서 12.5)보다 3.5 아래에서 시작하고, 폭은 상한까지 늘다가 말줄임이다.
 * **저장 모드에서만** 단다 — 묶기(`mapPageMarkerLayout`)는 원끼리 36px 간격만 지켜 주고, 폭 112px 이름표는 그 간격의
 * 이웃 원을 덮어 탭을 가로챈다. 저장한 곳은 몇 곳뿐이고 범위를 맞춰 펼쳐 보여 주므로 거기서만.
 */
const NAME_LABEL_TOP = 16;
const NAME_LABEL_HEIGHT = 20;
const NAME_LABEL_MAX_WIDTH = 112;
/** 이름표는 원보다 아래 층 — 옆 저장 원을 덮지 않는다. 이름표끼리 겹치는 것은 받아들인다. */
const Z_NAME_LABEL = 499;

/** 저장 모드가 범위를 맞출 때 가장자리 여백(px). 위는 지도 위에 뜬 칩 줄 높이만큼 더 띄운다. */
const FIT_EDGE = 40;
const FIT_MARGIN: naver.maps.Margin = { top: 88, right: FIT_EDGE, bottom: FIT_EDGE, left: FIT_EDGE };
/**
 * 이름표를 달 때 — 아래만 이름표 키만큼 더 둔다(맨 아래 곳의 이름이 잘리지 않게).
 * 좌우는 늘리지 않는다: 이름표 반 폭(56)씩 더 두면 390px 폰에서 동서 끝 저장 곳(신창 ↔ 성산)이 줌 한 단계 밖으로 밀려
 * 섬이 반 크기가 됐다(2026-10-14 실측). 줌은 단계로 끊겨 맞춘 뒤 좌우에 남는 틈이 이름표 반 폭을 대개 받아 준다.
 */
const FIT_MARGIN_NAMED: naver.maps.Margin = { ...FIT_MARGIN, bottom: FIT_EDGE + NAME_LABEL_TOP + NAME_LABEL_HEIGHT };

/**
 * 이름표 요소. 폭 0 상자를 좌표에 앵커하고 안의 알약을 `translateX(-50%)` 로 가운데에 앉힌다 — 글자 폭을 모르는 채로
 * 가운데를 맞추는 방법이다. 이름은 `textContent` 로만 넣는다(블로그·운영자 입력에서 온 문자열이다).
 * 스크린리더에는 숨긴다 — 마커 버튼의 이름(`mapPageCanvasMarkerLabel`)이 이미 말한다.
 */
function nameLabelContent(name: string): HTMLElement {
  const anchor = document.createElement('div');
  anchor.setAttribute('aria-hidden', 'true');
  anchor.style.cssText = 'position:relative;width:0;height:0';
  const label = document.createElement('span');
  label.textContent = name;
  // 떠 있는 판이라 흰 면(ADR-010 v4) — 지도 위 칩·'지도에 없는 N곳' 과 같은 반투명 흰색. 크기는 마커처럼 px 고정(ADR-006 의 축 밖).
  label.className = 'truncate rounded-lg border border-secondary bg-primary/92 font-semibold text-primary shadow-sm';
  label.style.cssText =
    `position:absolute;left:0;top:${NAME_LABEL_TOP}px;transform:translateX(-50%);` +
    `max-width:${NAME_LABEL_MAX_WIDTH}px;height:${NAME_LABEL_HEIGHT}px;padding:0 6px;font-size:12px;line-height:18px;cursor:pointer`;
  anchor.appendChild(label);
  return anchor;
}

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
  /** 묶기가 화면 픽셀로 바꿔 세는 좌표. */
  position: naver.maps.LatLng;
  /** 판정이 '어려움' 인가 — 흐림, 그리고 묶음이 모두 어려운지 셀 때. */
  hard: boolean;
  /** 원 오른쪽 아래의 판정 점(확인 필요·야외만 · 정보 없음). 판정이 바뀌면 마커를 통째로 다시 만들어 엔트리 동안 그대로다. */
  dot: TMapPageMarkerDot | null;
  /** 최대 확대의 고리가 그림을 옮긴 픽셀(평소 0). */
  offset: { dx: number; dy: number };
  /** 지금 걸린 아이콘(선택·저장·옮김) — 같으면 `setIcon` 을 건너뛴다. HTML 아이콘이라 바꿀 때마다 SDK 가 DOM 을 새로 만든다. */
  iconKey: string;
  listener: naver.maps.MapEventListener;
  /** 키보드 리스너를 뗀다. SDK 밖에서 마커 요소에 직접 건 것이라 `removeListener` 가 모른다. */
  detachKeys: () => void;
  /** 저장 모드의 이름표와 그 클릭 리스너. 마커와 같은 엔트리에 둬야 `clearMarkers` 의 두 길(재생성·지도 파괴 전)이 함께 뗀다. */
  label: { marker: naver.maps.Marker; listener: naver.maps.MapEventListener; content: HTMLElement } | null;
};

/** 묶음 원 하나. 다시 셀 때마다 통째로 떼고 새로 만든다(마커 수가 이 정도면 차분보다 안전하다). */
type TClusterEntry = {
  marker: naver.maps.Marker;
  ids: string[];
  /** 모두 '어려움' 이라 흐린 원인가. */
  allHard: boolean;
  listener: naver.maps.MapEventListener;
  detachKeys: () => void;
};

/**
 * 마커 요소를 버튼으로 읽히게 한다(14 W261006.11) — SDK 는 `title` 붙은 div 하나라 스크린리더가 지나치고
 * 키보드로는 닿지 않았다. 이름엔 판정까지 넣는다: 흐린 핀(어려움)은 눈으로만 구분됐다.
 *
 * 히트 영역은 44px 다 — 그림(28px)을 44px 투명 상자로 감쌌다(`mapPageMarkerIcon`). 그렇게 넓혀도 되는 것은 묶기 덕이다:
 * 묶기 전엔 중심 36px 안에 겹치는 쌍이 많아(390px 첫 화면에서도) 위에 깔린 원의 여백이 **아래 원의 보이는 몸통**을 덮어
 * 누른 것과 다른 곳이 열렸다. 묶은 뒤엔 보이는 것끼리 36px(= 44/2 + 28/2) 이상 떨어져 여백이 이웃 몸통에 닿지 않는다.
 * 묶음 원도 같은 함수로 버튼이 된다.
 */
function makeMarkerButton(element: HTMLElement, label: string, onActivate: () => void): () => void {
  element.setAttribute('role', 'button');
  element.setAttribute('tabindex', '0');
  element.setAttribute('aria-label', label);
  element.style.borderRadius = '9999px'; // 전역 :focus-visible 테두리가 원을 따라가게
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault(); // 스페이스가 페이지를 내리지 않게
    onActivate();
  };
  element.addEventListener('keydown', onKeyDown);
  return () => element.removeEventListener('keydown', onKeyDown);
}

/**
 * 마커 요소를 주어진 순서(`mapPageMarkerTabOrder` — 읽는 순서)로 DOM 에 다시 꽂는다(14 W261006.11a). Tab 은 DOM 순서를 따르는데
 * SDK 는 만든 순서로 꽂아, 키보드가 섬을 이리저리 뛰고 묶음은 맨 뒤에 몰렸다. 그림은 left/top 과 z-index 로 서므로 순서를 바꿔도
 * 안 움직인다(같은 z-index 끼리의 겹침 순서만 바뀌는데, 묶은 뒤엔 보이는 것끼리 겹치지 않는다).
 *
 * 모두 한 판(SDK 의 오버레이 칸) 안에 있을 때만 한다 — 아니면 손대지 않는다. 이미 그 순서면 건드리지 않는다.
 * 옮기기는 떼었다 붙이기라 포커스가 풀린다 — 든 요소였으면 되돌린다(스크롤 없이).
 */
function reorderMarkersForTab(elements: HTMLElement[]) {
  const parent = elements[0]?.parentElement;
  if (!parent || elements.some((element) => element.parentElement !== parent)) return;
  const wanted = new Set<Element>(elements);
  const current = [...parent.children].filter((child) => wanted.has(child));
  if (current.every((child, index) => child === elements[index])) return;
  const active = document.activeElement;
  for (const element of elements) parent.appendChild(element);
  if (active instanceof HTMLElement && wanted.has(active) && document.activeElement !== active) active.focus({ preventScroll: true });
}

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
      if (maps && entry.label) maps.Event.removeListener(entry.label.listener);
    } catch {
      // 리스너를 못 떼어도 마커는 떼어 본다.
    }
    entry.detachKeys();
    try {
      entry.marker.setMap(null);
    } catch {
      // 지도가 이미 깨졌다는 뜻. 남은 엔트리 정리를 멈추지 않는다.
    }
    try {
      entry.label?.marker.setMap(null);
    } catch {
      // 위와 같다.
    }
  }
  markers.clear();
}

/** 묶음 원을 뗀다. `clearMarkers` 와 같은 이유로 엔트리마다 감싸고, 지도를 파괴하기 **전에** 불러야 한다. */
function clearClusters(clusters: TClusterEntry[]) {
  const maps = window.naver?.maps;
  for (const entry of clusters) {
    try {
      if (maps) maps.Event.removeListener(entry.listener);
    } catch {
      // 리스너를 못 떼어도 마커는 떼어 본다.
    }
    entry.detachKeys();
    try {
      entry.marker.setMap(null);
    } catch {
      // 지도가 이미 깨졌다는 뜻.
    }
  }
  clusters.length = 0;
}

/** 선택·저장·고리 옮김이 바뀐 마커에만 아이콘을 다시 건다. */
function applyMarkerIcon(maps: typeof naver.maps, entry: TMarkerEntry, selected: boolean, saved: boolean) {
  const key = `${selected}:${saved}:${entry.offset.dx}:${entry.offset.dy}`;
  if (entry.iconKey === key) return;
  entry.iconKey = key;
  entry.marker.setIcon(mapPageMarkerIcon(maps, entry.type, selected, saved, entry.dot, entry.offset));
}

/** 키보드로 묶음을 연 뒤 — 그 줌보다 깊이 다시 셌을 때 무리의 첫 곳(혼자 섰으면 그 마커, 아니면 그것이 든 묶음)으로 포커스. */
type TFocusAfter = { ids: string[]; fromZoom: number };

type TLayoutInput = {
  map: naver.maps.Map;
  maps: typeof naver.maps;
  markers: Map<string, TMarkerEntry>;
  clusters: TClusterEntry[];
  selectedId: string | null;
  savedIds: ReadonlySet<string>;
  focusAfter: { current: TFocusAfter | null };
  /** SDK 가 던졌을 때 — 폴백으로 넘긴다. 묶음 클릭은 SDK 이벤트라 effect 의 try 밖이다. */
  onBroken: () => void;
  /** 센 결과 그려진 판정 표시(흐림 · 점 · 묶음 속에 숨은 것) — 화면의 범례가 이것을 따른다. */
  onShown: (shown: TMapPageMarkerShown) => void;
};

/**
 * 묶음을 누르면 — 그 무리가 다 들어오되 다 갈라지는 데서 멈추는 줌(`mapPageMarkerClusterZoom`)으로 날아간다.
 * 확대가 끝나면 'idle' 이 다시 센다.
 */
function zoomIntoCluster({ map, maps, markers, onBroken }: TLayoutInput, ids: string[]) {
  try {
    const projection = map.getProjection();
    const members = ids.flatMap((id) => {
      const entry = markers.get(id);
      return entry ? [{ id, position: entry.position }] : [];
    });
    if (members.length === 0) return;
    const lats = members.map((member) => member.position.lat());
    const lngs = members.map((member) => member.position.lng());
    const fit = map.getFitZoomAndCenter(
      new maps.LatLngBounds(
        new maps.LatLng(Math.min(...lats), Math.min(...lngs)),
        new maps.LatLng(Math.max(...lats), Math.max(...lngs)),
      ),
      FIT_MARGIN,
    );
    const zoom = mapPageMarkerClusterZoom({
      points: members.map(({ id, position }) => {
        const { x, y } = projection.fromCoordToOffset(position);
        return { id, x, y };
      }),
      zoom: map.getZoom(),
      maxZoom: map.getMaxZoom(),
      fitZoom: fit.zoom,
    });
    map.morph(fit.center, zoom);
  } catch {
    onBroken();
  }
}

/**
 * 마커를 묶고 편다(14 W261006.11) — 지금 줌의 화면 픽셀로 세어(`mapPageMarkerLayout`) 묶음에 든 마커는 숨기고
 * (`setVisible(false)` 는 `display:none` 이라 Tab 에서도 빠진다) 묶음 원은 통째로 다시 만든다.
 * 묶는 대상은 지금 지도에 올라간 마커뿐이다 — 종류 칩·저장 모드가 거른 뒤의 목록이다.
 *
 * 돌려주는 값은 센 줌 — 'idle' 은 줌이 같으면 다시 세지 않는다(끌기만 해서는 점 사이 거리가 그대로다).
 */
function layoutMarkers(input: TLayoutInput): number {
  const { map, maps, markers, clusters, selectedId, savedIds, focusAfter } = input;
  clearClusters(clusters);
  const projection = map.getProjection();
  const zoom = map.getZoom();
  const points = [...markers].map(([id, entry]) => {
    const { x, y } = projection.fromCoordToOffset(entry.position);
    return { id, x, y };
  });
  const layout = mapPageMarkerLayout(points, { pinnedId: selectedId, spread: zoom >= map.getMaxZoom() });

  const hidden = new Set(layout.clusters.flatMap((cluster) => cluster.ids));
  for (const [id, entry] of markers) {
    entry.marker.setVisible(!hidden.has(id));
    entry.label?.marker.setVisible(!hidden.has(id));
  }
  for (const { id, dx, dy } of layout.singles) {
    const entry = markers.get(id);
    if (!entry || (entry.offset.dx === dx && entry.offset.dy === dy)) continue;
    entry.offset = { dx, dy };
    applyMarkerIcon(maps, entry, id === selectedId, savedIds.has(id));
    entry.label?.marker.setIcon({ content: entry.label.content, anchor: new maps.Point(-dx, -dy) });
  }
  for (const { ids, x, y } of layout.clusters) {
    const summary = mapPageMarkerClusterSummary(
      ids.map((id) => {
        const entry = markers.get(id) as TMarkerEntry;
        return { type: entry.type, saved: savedIds.has(id), hard: entry.hard };
      }),
    );
    const marker = new maps.Marker({
      map,
      position: projection.fromOffsetToCoord(new maps.Point(x, y)),
      icon: mapPageMarkerClusterIcon(maps, summary),
      clickable: true,
      zIndex: Z_CLUSTER,
    });
    // 모두 어려운 묶음만 흐린다 — 하나라도 갈 수 있는 곳이 들어 있으면 흐리지 않는다.
    if (summary.allHard) marker.getElement().style.opacity = MARKER_HARD_OPACITY;
    const listener = maps.Event.addListener(marker, 'click', () => zoomIntoCluster(input, ids));
    const detachKeys = makeMarkerButton(marker.getElement(), mapPageMarkerClusterLabel(summary), () => {
      focusAfter.current = { ids, fromZoom: zoom };
      zoomIntoCluster(input, ids);
    });
    clusters.push({ marker, ids, listener, detachKeys, allHard: summary.allHard });
  }
  // 고른 핀은 점을 달지 않으므로(`pinIcon`) 점으로 세지 않는다. 묶음 속은 흐림·점이 될 곳이 하나라도 있으면 "숨어 있다".
  input.onShown({
    dim: layout.singles.some(({ id }) => markers.get(id)?.hard) || clusters.some((cluster) => cluster.allHard),
    dot: layout.singles.some(({ id }) => id !== selectedId && markers.get(id)?.dot),
    hidden: clusters.some((cluster) =>
      cluster.ids.some((id) => {
        const entry = markers.get(id);
        return entry?.hard || entry?.dot;
      }),
    ),
  });

  // Tab 을 화면 순서로(14 W261006.11a) — 보이는 것(혼자 선 원 · 묶음 원)만 센다. 묶음은 `clusters` 에 배치 순서대로 들어갔다.
  const pointOf = new Map(points.map((point) => [point.id, point]));
  const tabPoints = [
    ...layout.singles.flatMap(({ id, dx, dy }) => {
      const point = pointOf.get(id);
      return point ? [{ id, x: point.x + dx, y: point.y + dy }] : [];
    }),
    ...layout.clusters.map(({ x, y }, index) => ({ id: `${CLUSTER_KEY}${index}`, x, y })),
  ];
  reorderMarkersForTab(
    mapPageMarkerTabOrder(tabPoints).flatMap((key) => {
      const element = key.startsWith(CLUSTER_KEY)
        ? clusters[Number(key.slice(CLUSTER_KEY.length))]?.marker.getElement()
        : markers.get(key)?.marker.getElement();
      return element ? [element] : [];
    }),
  );

  // 키보드로 연 묶음이면 갈라진 자리로 포커스를 데려간다 — 누른 원이 사라지면 포커스가 body 로 떨어진다.
  const pending = focusAfter.current;
  if (pending && zoom > pending.fromZoom) {
    focusAfter.current = null;
    const [first] = pending.ids;
    const element = hidden.has(first)
      ? clusters.find((cluster) => cluster.ids.includes(first))?.marker.getElement()
      : markers.get(first)?.marker.getElement();
    element?.focus({ preventScroll: true });
  }
  return zoom;
}

/** `MapPage` 가 내 위치 버튼에서 부른다. 지도가 아직 없거나 깨졌으면 false 를 돌려준다. */
export type TMapPageCanvasHandle = {
  showMyLocation: (lat: number, lng: number) => boolean;
  /**
   * 그 장소의 마커에 포커스 — 묶음 속이면 그 묶음 원에(14 W261019.15d, 시트를 닫은 뒤). 마커가 없거나(종류 칩이 걸렀다) 지도가 아직이면 false.
   * 화면 밖·덮인 마커면 focusin 의 `bringIntoView` 가 데려온다(v34).
   */
  focusPlace: (id: string) => boolean;
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
   * 없으면 섬 전체가 드는 줌으로 연다. 지도를 만든 뒤에 바뀌면 그 자리로 옮긴다. 핀을 고를 때 화면이 주소에 남기는 `?place=` 는
   * 여기로 넘어오지 않는다(`MapPage`) — 넘어오면 고를 때마다 그 자리로 확대해 날아간다. 떠날 때의 시야가 history 에 있으면 그쪽이 먼저다.
   */
  focus?: TGeo | null;
  /**
   * 값이 바뀔 때마다 `places` 가 다 들어오게 시야를 맞춘다(null 이면 맞추지 않는다). 저장 모드가 쓴다 —
   * 섬 전체 줌으로 열면 성산 저장 2곳이 390px 화면 오른쪽 밖에 있었다(14 W261006.12). 열쇠로 받는 이유는
   * **하트를 뺄 때마다 지도가 튀지 않게** 다: 목록이 줄어도 열쇠가 같으면 보던 자리를 둔다.
   */
  fitKey?: string | null;
  /** 원 밑에 이름표를 단다(저장 모드). 범위를 맞출 때 여백도 이름표 몫만큼 넓힌다. */
  showNames?: boolean;
  /**
   * 지금 그려진 판정 표시 — 흐린 것(혼자 선 '어려움' 원 · 모두 어려운 묶음) · 점이 붙은 원 · 묶음 속에 숨은 것. 다시 셀 때마다 부른다
   * (같은 값이어도 — 거르는 것은 받는 쪽). 범례가 따른다: 묶은 뒤엔 어려운 곳이 있어도 모두 섞인 묶음(안 흐림) 속이면 흐린 것이
   * 하나도 없다(14 W261006.11, 6kg 줌 10 실측).
   */
  onMarkerShownChange?: (shown: TMapPageMarkerShown) => void;
  /**
   * 화면 아래에서 지도를 덮고 있는 시트의 높이(px, 없으면 0 — 넓은 화면은 시트가 옆 패널이라 늘 0). 고른 핀이 그 밑에
   * 깔리면 보이는 자리로 지도를 민다(14 W261019.14a).
   */
  coveredBottom?: number;
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
  fitKey = null,
  showNames = false,
  onMarkerShownChange,
  coveredBottom = 0,
}: TMapPageCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<naver.maps.Map | null>(null);
  const markersRef = useRef(new Map<string, TMarkerEntry>());
  /** 지금 지도에 선 묶음 원들. 마커 effect·선택 effect·'idle' 이 다시 셀 때마다 갈아 끼운다. */
  const clustersRef = useRef<TClusterEntry[]>([]);
  /** 마지막으로 묶음을 센 줌 — 'idle' 이 이것과 같으면(끌기만 했으면) 다시 세지 않는다. */
  const laidOutZoomRef = useRef<number | null>(null);
  const focusAfterRef = useRef<TFocusAfter | null>(null);
  /** 'idle' 리스너가 읽는 지금의 선택·저장 — 리스너는 지도가 설 때 한 번 걸어 props 를 직접 못 본다. 선택 effect 가 적는다. */
  const selectedRef = useRef(selectedId);
  const savedRef = useRef(savedIds);
  /** 범례 알림 — 'idle' 리스너도 부르므로 ref 로 든다. 아래 effect 가 다른 effect 들보다 먼저 적는다. */
  const onMarkerShownRef = useRef(onMarkerShownChange);
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
  /*
   * `fitKey` 를 맞춘 열쇠(아래 맞춤 effect). 떠날 때의 시야로 되살려 열면(`mapPageViewMemo`) 마운트 때의 열쇠를 이미 맞춘 것으로 친다 —
   * 안 그러면 저장 모드에서 상세에 갔다 올 때 저장한 곳 전체로 다시 맞춰 보던 자리를 잃는다. 마운트 때 값은 `fitKeyAtMountRef` 가 붙잡는다.
   */
  const appliedFitKeyRef = useRef<string | null>(null);
  const fitKeyAtMountRef = useRef(fitKey);

  useEffect(() => {
    onMarkerShownRef.current = onMarkerShownChange;
  }, [onMarkerShownChange]);

  // 지도가 깨지면 그려진 것도 없다 — 폴백 위에 범례가 남지 않게.
  useEffect(() => {
    if (status === 'error') onMarkerShownRef.current?.(MAP_PAGE_MARKER_NOTHING_SHOWN);
  }, [status]);

  // 지도 만들기. SDK 는 한 번만 받고, 이 화면을 다시 열면 캐시된 결과를 쓴다.
  useEffect(() => {
    let cancelled = false;
    // cleanup 에서 ref 를 다시 읽지 않도록 지금 붙잡아 둔다(useRef 가 만든 Map·배열은 재할당되지 않는다).
    const markers = markersRef.current;
    const clusters = clustersRef.current;
    let stopInitWatch: (() => void) | null = null;

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
        // 상세에 갔다가 뒤로 온 것이면 떠날 때의 시야로 연다(아래 떠남 effect 가 이 history 항목에 적어 둔 것) — 고른 곳(`focus`)보다 먼저다.
        const remembered = mapPageViewMemoOf(window.history.state);
        if (remembered) appliedFitKeyRef.current = fitKeyAtMountRef.current;
        const firstView = mapPageFirstView(containerRef.current.clientWidth, containerRef.current.clientHeight);
        const map = new maps.Map(containerRef.current, {
          // 장소 하나를 가리키며 들어왔으면 그 자리에서 연다 — 섬 전체를 먼저 그렸다가 날아가지 않게.
          center: remembered
            ? new maps.LatLng(remembered.lat, remembered.lng)
            : initialFocus
              ? new maps.LatLng(initialFocus.lat, initialFocus.lng)
              : new maps.LatLng(firstView.center[0], firstView.center[1]),
          // 섬이 칸의 보이는 자리에 드는 줌에서 한 단계 당긴다 — 모바일 390px 는 10, 데스크톱 830px 는 11(ADR-008 v12 · v36).
          zoom: remembered ? remembered.zoom : initialFocus ? PLACE_FOCUS_ZOOM : firstView.zoom,
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
        /*
         * 'ready'(마커·초점·맞춤 effect 의 문)는 지도가 일어선 뒤에(14 W261010.33g). 서비스워커 사본으로 SDK 가 와도
         * 스타일·인증이 매달리면 `'init'` 이 영영 안 와, 만들자마자 'ready' 면 안내 없는 빈 판이 남는다. 평소엔 약 40ms 늦어질 뿐이다.
         */
        stopInitWatch = watchNaverMapInit(maps, map, (ready) => {
          if (!cancelled) setStatus(ready ? 'ready' : 'error');
        });

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
      // 떠난 지도의 시간 초과가 다음 지도까지 실패로 보내지 않게 기다리기부터 끊는다.
      stopInitWatch?.();
      if (settleRef.current !== undefined) window.clearTimeout(settleRef.current);
      settleRef.current = undefined;
      // 지도를 파괴하기 전에 마커부터 비운다 — 이 cleanup 이 마커 effect 의 것보다 먼저 돈다. 묶음 원도 같다.
      clearMarkers(markers);
      clearClusters(clusters);
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
    const clusters = clustersRef.current;
    clearMarkers(markers);
    clearClusters(clusters);

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

        const position = new maps.LatLng(place.geo.lat, place.geo.lng);
        const eligibility = eligibilityMap?.get(place.id);
        const hard = eligibility?.level === 'hard';
        const dot = mapPageMarkerDot(eligibility);
        const marker = new maps.Marker({
          map,
          position,
          icon: mapPageMarkerIcon(maps, place.type, selected, saved, dot),
          clickable: true,
          zIndex: selected ? Z_SELECTED : saved ? Z_SAVED : 0,
        });
        const listener = maps.Event.addListener(marker, 'click', () => onSelect(place.id));
        if (hard) marker.getElement().style.opacity = MARKER_HARD_OPACITY;
        const detachKeys = makeMarkerButton(marker.getElement(), mapPageCanvasMarkerLabel(place, eligibility), () => onSelect(place.id));

        // 이름을 누르는 손이 많아 이름표도 그 곳을 연다. 흐림도 원과 같이 — 이름만 진하면 어려운 곳이 다시 눈에 띈다.
        let label: TMarkerEntry['label'] = null;
        if (showNames) {
          const content = nameLabelContent(place.name);
          const labelMarker = new maps.Marker({
            map,
            position,
            icon: { content, anchor: new maps.Point(0, 0) },
            clickable: true,
            zIndex: Z_NAME_LABEL,
          });
          if (hard) labelMarker.getElement().style.opacity = MARKER_HARD_OPACITY;
          label = { marker: labelMarker, listener: maps.Event.addListener(labelMarker, 'click', () => onSelect(place.id)), content };
        }

        markers.set(place.id, {
          marker,
          type: place.type,
          position,
          hard,
          dot,
          offset: { dx: 0, dy: 0 },
          iconKey: `${selected}:${saved}:0:0`,
          listener,
          detachKeys,
          label,
        });
      }
      laidOutZoomRef.current = layoutMarkers({
        map,
        maps,
        markers,
        clusters,
        selectedId,
        savedIds,
        focusAfter: focusAfterRef,
        onBroken: () => queueMicrotask(() => setStatus('error')),
        onShown: (shown) => onMarkerShownRef.current?.(shown),
      });
    } catch {
      clearMarkers(markers);
      clearClusters(clusters);
      queueMicrotask(() => setStatus('error'));
    }

    return () => {
      clearMarkers(markers);
      clearClusters(clusters);
    };
    // selectedId·savedIds 는 일부러 뺀다 — 선택이 옮겨 가거나 하트 하나를 누를 때마다 핀 86개를 다시 만들 이유가
    // 없다. 처음 그릴 때의 값만 읽고, 바뀐 뒤에는 아래 effect 가 핀 이미지와 쌓임 순서만 바꾼다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [places, eligibilityMap, onSelect, status, showNames]);

  /*
   * 선택·저장 표시. 마커를 다시 만들지 않고 핀 이미지와 쌓임 순서만 바꾼다. 그리고 다시 센다 — 고른 곳은 묶음에서 꺼내고
   * (줌을 물려 고른 곳이 무리에 들어가도 핀이 보이게), 하트를 누르면 묶음 원의 하트 배지가 따라온다.
   */
  useEffect(() => {
    const map = mapRef.current;
    const maps = window.naver?.maps;
    selectedRef.current = selectedId;
    savedRef.current = savedIds;
    if (!maps) return;
    try {
      for (const [id, entry] of markersRef.current) {
        const selected = id === selectedId;
        const saved = savedIds.has(id);
        applyMarkerIcon(maps, entry, selected, saved);
        entry.marker.setZIndex(selected ? Z_SELECTED : saved ? Z_SAVED : 0);
      }
      if (status === 'ready' && map)
        laidOutZoomRef.current = layoutMarkers({
          map,
          maps,
          markers: markersRef.current,
          clusters: clustersRef.current,
          selectedId,
          savedIds,
          focusAfter: focusAfterRef,
          onBroken: () => queueMicrotask(() => setStatus('error')),
          onShown: (shown) => onMarkerShownRef.current?.(shown),
        });
    } catch {
      // 위 effect 와 같은 이유 — 깨진 지도 위에서 SDK 가 던진다. 화면을 깨뜨리지 않는다.
      // effect 본문에서 곧바로 setState 하면 렌더가 연쇄되므로 한 틱 미룬다.
      queueMicrotask(() => setStatus('error'));
    }
  }, [selectedId, places, eligibilityMap, savedIds, status]);

  /*
   * 줌이 바뀌면 다시 센다 — 확대·축소가 **끝난 뒤**('idle')에. 손가락으로 벌리는 동안은 묶음이 그대로 커졌다 작아지고,
   * 놓으면 한 번에 갈라진다. 'zoom_changed' 는 애니메이션 도중에도 와서 쓰지 않는다. 끌기만 했으면(줌이 같으면) 건너뛴다.
   */
  useEffect(() => {
    const map = mapRef.current;
    const maps = window.naver?.maps;
    if (status !== 'ready' || !map || !maps) return;
    const listener = maps.Event.addListener(map, 'idle', () => {
      try {
        if (map.getZoom() === laidOutZoomRef.current) return;
        laidOutZoomRef.current = layoutMarkers({
          map,
          maps,
          markers: markersRef.current,
          clusters: clustersRef.current,
          selectedId: selectedRef.current,
          savedIds: savedRef.current,
          focusAfter: focusAfterRef,
          onBroken: () => queueMicrotask(() => setStatus('error')),
          onShown: (shown) => onMarkerShownRef.current?.(shown),
        });
      } catch {
        // SDK 이벤트 안이라 어떤 effect 의 try 도 덮지 못한다 — 깨진 지도다, 폴백으로.
        queueMicrotask(() => setStatus('error'));
      }
    });
    return () => {
      // 언마운트면 지도 effect 의 cleanup 이 먼저 돌아 지도가 이미 파괴됐다 — 떼는 쪽도 던질 수 있다.
      try {
        maps.Event.removeListener(listener);
      } catch {
        // 지도와 함께 이미 사라졌다.
      }
    };
  }, [status]);

  /*
   * 고른 핀이 시트 밑에 가려지면 지도를 밀어 시트 위로 올린다(14 W261019.14a, haeun-11a) — 무엇을 골랐는지 안 보였다.
   * 이미 보이면 안 민다(`mapPageRevealPin` 이 0). 줌은 그대로, 핀 자리는 마커 요소의 화면 좌표로 잰다. 시트가 올라오며 높이가
   * 바뀌어도(`coveredBottom`) 다시 본다. 선택 effect 가 아이콘을 바꾼 뒤에 재도록 한 프레임 미룬다.
   *
   * **확대가 도는 동안엔 재지 않는다**(14 W261019.14b). 그동안 SDK 는 마커를 0×0 으로 숨겨, 재면 dy 0 으로 끝나고 확대가 끝난 핀이
   * 시트 밑에 남았다(headless: 휠 확대 도중에 고르면 핀 밑끝 776 · 띠 549). 0×0 이면 지도가 멈출 때('idle')를 한 번 기다렸다 다시 잰다.
   * 늘 'idle' 을 기다리지는 않는다 — 평소엔 지도가 이미 서 있고, `panBy` 는 같은 틱에 'idle' 을 내서 걸어 둔 채 밀면 민 뒤를 또 잰다.
   */
  useEffect(() => {
    const map = mapRef.current;
    const maps = window.naver?.maps;
    const container = containerRef.current;
    if (status !== 'ready' || !map || !maps || !container || !selectedId || coveredBottom <= 0) return;
    let frame = 0;
    let idle: naver.maps.MapEventListener | null = null;
    let afterIdle = false;
    let retries = 0;
    const stopWaiting = () => {
      if (!idle) return;
      try {
        maps.Event.removeListener(idle);
      } catch {
        // 지도와 함께 이미 사라졌다.
      }
      idle = null;
    };
    const reveal = () => {
      const element = markersRef.current.get(selectedId)?.marker.getElement();
      if (!element) return;
      const pin = element.getBoundingClientRect();
      if (pin.height === 0) {
        if (!afterIdle && !idle) {
          idle = maps.Event.addListener(map, 'idle', () => {
            stopWaiting();
            afterIdle = true;
            frame = window.requestAnimationFrame(reveal);
          });
        } else if (afterIdle && retries < REVEAL_RETRY_FRAMES) {
          retries += 1;
          frame = window.requestAnimationFrame(reveal);
        }
        return;
      }
      const view = container.getBoundingClientRect();
      const dy = mapPageRevealPin({
        mapTop: view.top,
        mapBottom: view.bottom,
        topInset: CHIP_ROW_HEIGHT,
        sheetHeight: coveredBottom,
        viewportBottom: window.innerHeight,
        pinTop: pin.top,
        pinBottom: pin.bottom,
        margin: REVEAL_MARGIN,
      });
      if (dy === 0) return;
      try {
        map.panBy(new maps.Point(0, dy));
      } catch {
        setStatus('error');
      }
    };
    frame = window.requestAnimationFrame(reveal);
    return () => {
      window.cancelAnimationFrame(frame);
      stopWaiting();
    };
  }, [selectedId, coveredBottom, status]);

  /*
   * Tab 이 화면 밖 마커에 닿으면 — 브라우저는 그 마커를 보이려고 지도 칸(`overflow:hidden`)을 **스크롤**한다. 지도는 그걸 모르고
   * 타일·마커가 통째로 밀린 채 남았다(2026-10-16 headless 실측 scrollTop 1796, 마커를 버튼으로 만든 v22 부터). 스크롤은 되돌리고
   * 대신 지도를 그 마커로 옮긴다(줌은 그대로). 스크롤 이벤트는 한 박자 늦게 오므로 focusin 에서 먼저 되돌린다.
   */
  useEffect(() => {
    const map = mapRef.current;
    const container = containerRef.current;
    if (status !== 'ready' || !map || !container) return;
    const unscroll = () => {
      if (container.scrollTop !== 0) container.scrollTop = 0;
      if (container.scrollLeft !== 0) container.scrollLeft = 0;
    };
    const bringIntoView = (event: FocusEvent) => {
      unscroll();
      const target = event.target;
      const entry = [...markersRef.current.values(), ...clustersRef.current].find((item) => item.marker.getElement() === target);
      if (!entry || !(target instanceof HTMLElement)) return;
      const rect = target.getBoundingClientRect();
      const view = container.getBoundingClientRect();
      const inside = rect.left >= view.left && rect.right <= view.right && rect.top >= view.top && rect.bottom <= view.bottom;
      /*
       * 칸 안이어도 **가운데가 남에게 덮였으면** 화면 밖과 같다(14 W261006.11a) — 지도 위에 뜬 칩 줄(위 88px 안팎)·고른 곳 시트·내 위치 버튼 밑에
       * 깔린 마커는 칸 안이라 "보인다" 로 쳐서 안 옮겼고, 포커스 테두리가 칩 뒤에 숨었다. 가운데 점에서 맨 위에 맞는 것이 이 마커(또는 그 안)인지 본다 —
       * 칩 줄의 빈 오른쪽처럼 `pointer-events: none` 인 자리는 맞지 않으니 덮인 것으로 치지 않는다(실제로 보인다).
       */
      const hit = inside ? document.elementFromPoint((rect.left + rect.right) / 2, (rect.top + rect.bottom) / 2) : null;
      if (hit && target.contains(hit)) return;
      /*
       * 덮은 것이 지도 화면(`<main>`) 밖이면 옮기지 않는다 — 고른 곳 시트의 모달 오버레이(body 포털)다(14 W261019.14b). 마커를 누르면
       * 선택 effect 가 마커를 다시 꽂으며(`reorderMarkersForTab`) 포커스를 되돌리는데, 그때 막 열린 오버레이가 핀 가운데를 덮어 "가려짐" 으로
       * 읽혔다 — 고를 때마다 약 1초짜리 `panTo` 가 핀을 지도 한가운데로 끌고 갔다(관성처럼 보인 움직임). 시트가 덮는 것은 위 reveal 의 몫이고,
       * 모달이 열린 동안 마커엔 Tab 이 닿지 않는다.
       */
      if (hit && !(container.closest('main') ?? document.body).contains(hit)) return;
      try {
        map.panTo(entry.marker.getPosition());
      } catch {
        queueMicrotask(() => setStatus('error'));
      }
    };
    container.addEventListener('focusin', bringIntoView);
    container.addEventListener('scroll', unscroll);
    return () => {
      container.removeEventListener('focusin', bringIntoView);
      container.removeEventListener('scroll', unscroll);
    };
  }, [status]);

  /*
   * 떠남 — 링크를 누르면 지금 시야를 이 history 항목에 적는다(`mapPageViewMemo`, 14 W261019.15b). 시트 카드로 상세에 갔다가 뒤로 오면
   * 지도 화면은 새로 마운트되고, 고른 곳은 주소(`?place=`)가 되살리는데 시야는 없어 고른 곳으로 확대해 열렸다(미니 지도에서 온 것과 같은 화면).
   * 위 지도 effect 가 적힌 시야로 연다. 'idle' 마다가 아니라 떠날 때 한 번 적는다 — 브라우저는 짧은 사이의 replaceState 를 수로 막는다(Safari 는 던진다).
   * click capture 라 Next 가 새 항목을 쌓기 전, 아직 지도의 항목일 때 적힌다. 탭바처럼 갈아 끼우는 링크면 그 항목과 함께 버려진다.
   */
  useEffect(() => {
    const map = mapRef.current;
    if (status !== 'ready' || !map) return;
    const remember = (event: MouseEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest('a[href]')) return;
      if (normalizeRoute(window.location.pathname) !== '/map') return;
      try {
        const center = map.getCenter();
        const view = { lat: center.lat(), lng: center.lng(), zoom: map.getZoom() };
        window.history.replaceState(withMapPageViewMemo(window.history.state, view), '');
      } catch {
        // 깨진 지도거나 history 가 막혔다 — 돌아오면 고른 곳으로 열 뿐이다.
      }
    };
    document.addEventListener('click', remember, true);
    return () => document.removeEventListener('click', remember, true);
  }, [status]);

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
   * `fitKey` 가 바뀌면 `places` 가 다 들어오게 맞춘다. 맞춘 열쇠는 `appliedFitKeyRef` 에 남겨 같은 열쇠로 두 번 옮기지
   * 않는다(하트를 빼 목록이 줄어도 그대로). 목록이 비어 있으면 맞춘 것으로 치지 않는다 — 저장 목록은 마운트 뒤에
   * 읽히므로(`skipHydration`) 첫 렌더엔 0곳이고, 그때 열쇠를 써 버리면 정작 저장한 곳이 들어왔을 때 안 맞춘다.
   * `?place=` 로 한 곳을 가리키며 들어왔으면 그쪽이 더 구체적인 뜻이라 맞추지 않는다.
   */
  useEffect(() => {
    const map = mapRef.current;
    const maps = window.naver?.maps;
    if (status !== 'ready' || !map || !maps || !fitKey || focus || places.length === 0) return;
    if (appliedFitKeyRef.current === fitKey) return;
    appliedFitKeyRef.current = fitKey;
    try {
      if (places.length === 1) {
        const { lat, lng } = places[0].geo as TGeo;
        map.morph(new maps.LatLng(lat, lng), PLACE_FOCUS_ZOOM);
        return;
      }
      const lats = places.map((place) => (place.geo as TGeo).lat);
      const lngs = places.map((place) => (place.geo as TGeo).lng);
      map.fitBounds(
        new maps.LatLngBounds(
          new maps.LatLng(Math.min(...lats), Math.min(...lngs)),
          new maps.LatLng(Math.max(...lats), Math.max(...lngs)),
        ),
        showNames ? FIT_MARGIN_NAMED : FIT_MARGIN,
      );
      // 저장한 곳이 한 동네에 모여 있으면 fitBounds 가 골목까지 확대한다 — 한 곳을 가리킬 때의 줌에서 멈춘다.
      if (map.getZoom() > PLACE_FOCUS_ZOOM) map.setZoom(PLACE_FOCUS_ZOOM);
    } catch {
      queueMicrotask(() => setStatus('error'));
    }
  }, [fitKey, focus, places, status, showNames]);

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
          map.morph(position, MY_LOCATION_ZOOM);
          return true;
        } catch {
          // 마커 effect 와 같은 이유 — 깨진 지도 위에서 SDK 가 던진다. 폴백으로 넘긴다.
          queueMicrotask(() => setStatus('error'));
          return false;
        }
      },
      focusPlace(id) {
        if (status !== 'ready') return false;
        // 묶음에 든 마커는 `display:none` 이라 포커스를 못 받는다 — 그 무리의 원이 대신 받는다(키보드로 묶음을 연 뒤와 같은 규칙).
        const cluster = clustersRef.current.find((entry) => entry.ids.includes(id));
        const element = cluster ? cluster.marker.getElement() : markersRef.current.get(id)?.marker.getElement();
        if (!element?.isConnected) return false;
        element.focus({ preventScroll: true });
        return element.ownerDocument.activeElement === element;
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
    /*
     * 지도에서 한 종류만 골랐으면(`places` 가 한 종류뿐) 목록도 그 종류로 연다 — 식당을 고르고 눌렀는데
     * 숙소 목록이 열리던 것(14 W261010.16). 여러 종류가 섞였으면 첫 종류(숙소)가 기본이다.
     */
    const types = new Set(places.map((place) => place.type));
    const listType: TPlaceType = types.size === 1 ? [...types][0] : 'stay';
    // 상세 미니 지도와 같은 말 — 오프라인일 때만 인터넷을 탓한다(14 W261010.33c). 'error' 는 클라이언트에서만 서므로 navigator 가 있다.
    const copy = mapFailureCopy(navigator.onLine);
    return (
      <div className="flex h-full w-full items-center justify-center bg-secondary p-4">
        <EmptyState
          Icon={AlertTriangle}
          title={copy.title}
          description={copy.description}
          action={
            <Button color="primary" size="lg" href={`/places/${listType}/`}>
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
      <div ref={containerRef} className="naver-map h-full w-full" data-ev-ignore="" />
    </div>
  );
}
