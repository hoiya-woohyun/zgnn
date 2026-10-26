'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Expand06 } from '@untitledui/icons';
import { mapFailureCopy } from '../lib/mapFailureCopy';
import { loadNaverMaps, onNaverMapsAuthFailure, watchNaverMapInit } from '../lib/naverMap';
import { pinIcon } from '../lib/naverMapPin';
import { TYPE_META, type TPlaceEntry } from '../lib/places';
import type { TGeo } from '../types';

/**
 * 화면에 들어오기 이만큼 전부터 지도를 부른다 — 스크롤해 닿았을 때 이미 그려져 있게.
 * 너무 크게 잡으면 "안 보고 나간 방문" 도 지도를 만들어 이 파일이 늦게 부르는 이유가 사라진다.
 */
const PRELOAD_MARGIN = '200px 0px';

/**
 * 미니 지도의 확대 수준(클수록 확대 — `JEJU_ZOOM` 주석). 지도 탭이 장소를 가리킬 때의 `PLACE_FOCUS_ZOOM`(14)은 쓰지 않는다 —
 * 176px 높이 판에선 그 단계가 길과 바로 옆 가게 이름만 보여, 이 장소가 어느 동네인지 가늠하는 읍·면 이름이 안 보였다(14 W261019.14e).
 */
const MINI_MAP_ZOOM = 12;

/**
 * 'idle' 은 아직 부르지 않은 판(화면 밖) — 여기서 "불러오는 중" 을 그리면 스크롤 없이 전체 페이지를 찍은 사람에겐 멈춘 지도로 읽힌다
 * (14 W261010.33n, ferry-20 과 같은 판독). 문구 없는 빈 판으로 두고, 'loading' 은 지도 자리가 화면 가까이 와서 SDK 를 부를 때 선다.
 */
type TStatus = 'idle' | 'loading' | 'ready' | 'error';

/**
 * 상세 화면의 "위치" 미니 지도. 그 장소 핀 하나를 가운데 두고, 누르면 지도 탭(`/map/?place=<id>`)으로 가서
 * 주변 장소와 함께 본다.
 *
 * **비용** — 네이버 인증(`/v3/auth`)은 페이지를 한 번 불러오는 동안 처음 지도를 만들 때 한 번만 나간다
 * (2026-09-30 실측, ADR-008 「과금」). 그래서 지도 탭을 이미 본 방문이면 이 지도는 건수를 더하지 않는다.
 * 더하는 경우는 공유 링크로 상세에 바로 들어온 방문뿐이라, 그 방문이 지도 자리까지 **내려왔을 때만**
 * SDK 를 부른다(IntersectionObserver). 위쪽만 읽고 나가면 0건이다.
 *
 * **움직이지 않는다.** 스크롤하던 손가락이 지도에 붙잡히면 페이지가 안 내려간다 — 끌고 확대하는 일은
 * 지도 탭이 한다. 판 전체를 덮은 링크가 그 입구다.
 */
export function PlaceDetailMiniMap({ place, geo }: { place: TPlaceEntry; geo: TGeo }) {
  const slotRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  // IntersectionObserver 가 없는 브라우저는 기다릴 방법이 없으니 바로 부른다. 화면에 그리는 것과 무관한 값이라 하이드레이션이 어긋나지 않는다.
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === 'undefined');
  // 첫 값은 서버(정적 HTML)와 같은 'idle' 이어야 한다 — `visible` 처럼 IntersectionObserver 유무로 정하면 서버엔 그것이 없어 HTML 과 첫 렌더가 갈린다.
  // 그래서 IntersectionObserver 가 없는 브라우저는 'idle' 인 채로 지도를 부른다(빈 판 → 지도. 그런 브라우저는 거의 없다).
  const [status, setStatus] = useState<TStatus>('idle');

  // 지도 자리가 화면 가까이 올 때까지 기다린다. 한 번 보이면 끝이다 — 다시 숨어도 지도를 걷지 않는다.
  useEffect(() => {
    const slot = slotRef.current;
    if (!slot || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          setStatus('loading');
          observer.disconnect();
        }
      },
      { rootMargin: PRELOAD_MARGIN },
    );
    observer.observe(slot);
    return () => observer.disconnect();
  }, []);

  /*
   * 지도 만들기. 실패를 받는 갈래는 지도 화면(`mapPageCanvas`)과 같다 — 인증 실패가 전역 콜백으로 오지 않고
   * SDK 안쪽 예외로 올 수 있어(ADR-008 「인증 실패」) 생성·마커를 모두 감싼다.
   */
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    let map: naver.maps.Map | null = null;
    let marker: naver.maps.Marker | null = null;
    let stopInitWatch: (() => void) | null = null;

    const unsubscribe = onNaverMapsAuthFailure(() => {
      if (!cancelled) setStatus('error');
    });

    loadNaverMaps()
      .then((maps) => {
        if (cancelled || !containerRef.current) return;
        const center = new maps.LatLng(geo.lat, geo.lng);
        map = new maps.Map(containerRef.current, {
          center,
          zoom: MINI_MAP_ZOOM,
          draggable: false,
          pinchZoom: false,
          scrollWheel: false,
          keyboardShortcuts: false,
          disableDoubleClickZoom: true,
          disableDoubleTapZoom: true,
          disableTwoFingerTapZoom: true,
          zoomControl: false,
          scaleControl: false,
          // 로고·저작권 표시는 끄지 않는다 — Maps 서비스 이용약관 제7조 ⑩(지도 화면과 같은 이유).
          logoControl: true,
          logoControlOptions: { position: maps.Position.BOTTOM_LEFT },
          mapDataControl: true,
          mapDataControlOptions: { position: maps.Position.BOTTOM_LEFT },
        });
        // 지도 화면의 "고른 핀" 과 같은 크기 — 이 판의 주인공이 하나뿐이다.
        marker = new maps.Marker({
          map,
          position: center,
          icon: pinIcon(maps, place.type, true, false),
          title: `${place.name} · ${TYPE_META[place.type].label}`,
          clickable: false,
        });
        /*
         * 'ready' 는 지도가 일어선 뒤에(14 W261010.33g) — 만든 것만으로는 스타일·인증이 매달린 빈 판일 수 있다.
         * 그동안 "불러오는 중" 이 남고, 제시간에 안 서면 실패 안내로 넘어간다.
         */
        stopInitWatch = watchNaverMapInit(maps, map, (ready) => {
          if (!cancelled) setStatus(ready ? 'ready' : 'error');
        });
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });

    return () => {
      cancelled = true;
      unsubscribe();
      // 떠난 지도의 시간 초과가 다음 지도까지 실패로 보내지 않게 기다리기부터 끊는다.
      stopInitWatch?.();
      // 지도보다 마커를 먼저 뗀다. 깨진 지도에서는 둘 다 던질 수 있어 각각 감싼다(mapPageCanvas 의 정리와 같다).
      try {
        marker?.setMap(null);
      } catch {
        // 이미 깨진 지도다.
      }
      try {
        map?.destroy();
      } catch {
        // 이미 깨진 지도다.
      }
    };
  }, [visible, geo.lat, geo.lng, place.type, place.name]);

  // 지도 탭과 같은 말(14 W261010.33c) — 'error' 는 마운트 뒤 effect 에서만 서므로 정적 HTML 에선 navigator 를 읽지 않는다.
  const failure = status === 'error' ? mapFailureCopy(navigator.onLine) : null;

  return (
    <div
      ref={slotRef}
      className="relative isolate h-44 overflow-hidden rounded-2xl border border-secondary bg-secondary"
    >
      {/*
       * 두 갈래에 key 를 따로 준다 — 없으면 React 가 지도 컨테이너 div 를 안내 div 로 **재사용**해, SDK 가 그 안에 심은
       * 핀·타일이 안내 위에 남는다(오프라인 실측: 핀이 "지도는 인터넷이 필요해요" 를 가렸고, 늦게 온 'init' 은 타일까지 덮었다).
       * key 가 다르면 컨테이너는 문서에서 떨어져 SDK 가 그 뒤에 무엇을 그려도 안 보인다(14 W261010.33g).
       */}
      {failure ? (
        <div key="failure" className="flex h-full flex-col items-center justify-center gap-1 px-4 text-center text-sm">
          <p className="font-semibold text-secondary">{failure.title}</p>
          <p className="text-tertiary">{failure.description}</p>
        </div>
      ) : (
        <>
          <div key="map" ref={containerRef} className="h-full w-full" data-ev-ignore="" />
          {status === 'loading' && (
            <p className="absolute inset-0 flex items-center justify-center text-sm text-tertiary">
              지도를 불러오는 중이에요
            </p>
          )}
          {/* 판 전체가 입구다. 로고·저작권 표시는 이 투명한 링크 밑에서 그대로 보인다. */}
          <Link
            href={`/map/?place=${encodeURIComponent(place.id)}`}
            aria-label={`${place.name} 지도에서 크게 보기`}
            className="absolute inset-0 flex items-start justify-end p-2"
          >
            <span className="flex items-center gap-1 rounded-full bg-primary/92 px-3 py-1.5 text-xs font-semibold text-secondary shadow-xs">
              <Expand06 size={14} aria-hidden="true" />
              크게 보기
            </span>
          </Link>
        </>
      )}
    </div>
  );
}
