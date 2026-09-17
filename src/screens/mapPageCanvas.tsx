'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle } from '@untitledui/icons';
import { Button } from '@/components/base/button';
import { EmptyState } from '../components/layout/emptyState';
import type { TEligibility } from '../lib/eligibility';
import { loadKakaoMaps } from '../lib/kakaoMap';
import { JEJU_CENTER, JEJU_LEVEL, TYPE_COLOR, TYPE_META, type TPlaceEntry } from '../lib/places';
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
 * MarkerImage 는 종류 × 선택여부 6가지뿐이라 한 번 만들어 두고 계속 쓴다.
 * 선택을 옮길 때마다 새 객체를 만들면 SDK 가 이미지를 다시 물어본다.
 */
const PIN_IMAGES = new Map<string, kakao.maps.MarkerImage>();

function pinImage(
  maps: typeof kakao.maps,
  type: TPlaceType,
  selected: boolean,
): kakao.maps.MarkerImage {
  const key = `${type}:${selected}`;
  const cached = PIN_IMAGES.get(key);
  if (cached) return cached;

  const { width, height } = selected ? PIN_SELECTED : PIN;
  const image = new maps.MarkerImage(pinSvg(type, width, height), new maps.Size(width, height), {
    // 좌표에 맞출 지점은 핀의 **끝**이다 — 가운데로 두면 핀이 장소보다 아래를 가리킨다.
    offset: new maps.Point(width / 2, height),
    alt: TYPE_META[type].label,
  });
  PIN_IMAGES.set(key, image);
  return image;
}

type TMarkerEntry = { marker: kakao.maps.Marker; type: TPlaceType };

type TMapPageCanvasProps = {
  /** 좌표가 있는 장소들. 필터가 끝난 뒤의 목록이다. */
  places: TPlaceEntry[];
  selectedId: string | null;
  /** 참조가 안정적이어야 한다 — 바뀌면 마커를 전부 다시 만든다. */
  onSelect: (id: string) => void;
  eligibilityMap: Map<string, TEligibility> | null;
};

/**
 * Kakao 지도와 장소 마커.
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
  const mapRef = useRef<kakao.maps.Map | null>(null);
  const markersRef = useRef(new Map<string, TMarkerEntry>());
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  // 지도 만들기. SDK 는 한 번만 받고, 이 화면을 다시 열면 캐시된 결과를 쓴다.
  useEffect(() => {
    let cancelled = false;
    let settle = 0;

    loadKakaoMaps()
      .then((maps) => {
        if (cancelled || !containerRef.current) return;
        const map = new maps.Map(containerRef.current, {
          center: new maps.LatLng(JEJU_CENTER[0], JEJU_CENTER[1]),
          level: JEJU_LEVEL,
        });
        mapRef.current = map;
        setStatus('ready');

        /*
         * 지도 높이가 100dvh 기준이라 첫 렌더 때 SDK 가 잰 크기와 실제 크기가 어긋난다.
         * 그대로 두면 아래쪽에 타일이 안 깔린 빈 띠가 남는다.
         * window resize 는 SDK 가 알아서 relayout 하므로 리스너는 달지 않는다.
         */
        map.relayout();
        settle = window.setTimeout(() => map.relayout(), 250);
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });

    return () => {
      cancelled = true;
      window.clearTimeout(settle);
      mapRef.current = null;
    };
  }, []);

  // 마커 올리기. 목록이나 판정이 바뀌면 통째로 다시 만든다 — 86곳 규모에서는 차분을 계산하는 것보다 안전하다.
  useEffect(() => {
    const map = mapRef.current;
    const maps = window.kakao?.maps;
    if (status !== 'ready' || !map || !maps) return;

    const markers = markersRef.current;
    for (const entry of markers.values()) entry.marker.setMap(null);
    markers.clear();

    for (const place of places) {
      if (!place.geo) continue;
      const selected = place.id === selectedId;

      const marker = new maps.Marker({
        map,
        position: new maps.LatLng(place.geo.lat, place.geo.lng),
        image: pinImage(maps, place.type, selected),
        title: `${place.name} · ${TYPE_META[place.type].label}`,
        clickable: true,
        zIndex: selected ? 1000 : 0,
        opacity:
          eligibilityMap?.get(place.id)?.level === 'hard' ? MARKER_HARD_OPACITY : 1,
      });
      maps.event.addListener(marker, 'click', () => onSelect(place.id));

      markers.set(place.id, { marker, type: place.type });
    }

    return () => {
      for (const entry of markers.values()) entry.marker.setMap(null);
      markers.clear();
    };
    // selectedId 는 일부러 뺀다 — 선택만 바뀔 때 마커를 다시 만들지 않고 아래 effect 가 핀만 바꾼다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [places, eligibilityMap, onSelect, status]);

  // 선택 표시. 마커를 다시 만들지 않고 핀 이미지와 쌓임 순서만 바꾼다.
  useEffect(() => {
    const maps = window.kakao?.maps;
    if (!maps) return;
    for (const [id, entry] of markersRef.current) {
      const selected = id === selectedId;
      entry.marker.setImage(pinImage(maps, entry.type, selected));
      entry.marker.setZIndex(selected ? 1000 : 0);
    }
  }, [selectedId, places, eligibilityMap, status]);

  /*
   * SDK 를 못 받은 경우. Leaflet 때는 타일만 안 깔리고 마커는 그려졌지만,
   * Kakao 는 지도 자체가 외부 스크립트라 실패하면 보여줄 것이 남지 않는다.
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
