'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import L from 'leaflet';
import { MapContainer, Marker, TileLayer, useMap } from 'react-leaflet';
import { AlertTriangle, Heart } from '@untitledui/icons';
import { MapPageSheetCard } from './mapPageSheet';
import { useMapPageWideLayout } from './useMapPageWideLayout';
import { BottomSheet } from '@/components/base/bottom-sheet';
import { Button } from '@/components/base/button';
import { Select } from '@/components/base/select';
import { ELIGIBILITY_META } from '../components/eligibilityBadge';
import { EmptyState } from '../components/layout/emptyState';
import { PlaceThumb } from '../components/placeThumb';
import { TownChip } from '../components/townChip';
import type { TEligibilityLevel } from '../lib/eligibility';
import { TILE_SOURCE } from '../lib/mapTiles';
import {
  DIRECTIONS,
  DIRECTION_LABEL,
  JEJU_CENTER,
  JEJU_ZOOM,
  PLACES,
  PLACE_TYPES,
  TOWN_OPTIONS,
  TYPE_COLOR,
  TYPE_META,
} from '../lib/places';
import { useAppStore, useDog, useSavedPlaces } from '../store/useAppStore';
import { useEligibilityMap } from '../store/useDogEligibility';
import { cx } from '../utils/cx';
import type { TDirection, TGeo, TPlaceType } from '../types';

/** 읍면 선택 시 그 읍면 마커들로 지도 시야를 맞춘다. 종류·방향·"어려움 숨기기" 가 바뀌어 같은 읍면 안 마커가 줄어도 다시 맞춘다. */
function MapPageFitTown({ town, points }: { town: string | null; points: TGeo[] }) {
  const map = useMap();
  useEffect(() => {
    if (!town || points.length === 0) return;
    const bounds = L.latLngBounds(points.map((point) => [point.lat, point.lng]));
    map.fitBounds(bounds, { padding: [48, 48], maxZoom: 14 });
  }, [town, points, map]);
  return null;
}

/**
 * 지도 높이가 100dvh 기준이라 첫 렌더 때 Leaflet 이 잰 크기와 실제 크기가 어긋난다.
 * 그대로 두면 아래쪽에 타일이 안 깔린 빈 띠가 남는다.
 */
function MapPageAutoResize() {
  const map = useMap();
  useEffect(() => {
    map.invalidateSize();
    const settle = window.setTimeout(() => map.invalidateSize(), 250);
    const onResize = () => map.invalidateSize();
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.clearTimeout(settle);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, [map]);
  return null;
}

/**
 * 마커 아이콘은 타입×선택여부×판정레벨 뿐이라 한 번 만들어 두고 계속 쓴다.
 * 렌더마다 새 객체를 넘기면 react-leaflet 이 마커 전체에 setIcon 을 다시 건다.
 *
 * 아이콘 자체는 타입별로 같은 모양(원/둥근사각/물방울)을 쓰므로 캐시 키에 장소별 정보(이름 등)를
 * 넣지 않는다 — aria-label 처럼 장소마다 다른 값은 Marker 의 eventHandlers.add 에서 DOM 에 직접 얹는다.
 * 판정레벨은 캐시 키에 넣는다 — 우리 강아지 프로필이 있으면 테두리·투명도로 판정을 구분하기 때문이다
 * (2026-09-15 리뷰 후속 B3). 프로필이 없으면 level 은 항상 undefined → 캐시 키가 이전과 같아
 * v0 마커 모양이 그대로 나온다.
 */
const MARKER_ICONS = new Map<string, L.DivIcon>();

/** 색만으로 구분하기 어려운 베이지 바탕에서도 모양으로 타입을 가르기 위한 CSS. */
const MARKER_SHAPE_STYLE: Record<TPlaceType, string> = {
  stay: 'border-radius:50%',
  restaurant: 'border-radius:28%',
  // 물방울(핀) 모양 — 정사각형을 45도 돌리고 한쪽 모서리만 각지게 남긴다.
  cafe: 'border-radius:50% 50% 50% 0;transform:rotate(-45deg)',
};

/** 정보 없음 마커의 테두리 색. 팔레트의 중립 회색(neutral-400) — 배지의 '정보 없음' 톤과 같은 계열. */
const MARKER_UNKNOWN_BORDER = 'var(--color-neutral-400, #a69d93)';

/** 어려움 마커의 투명도. 아예 숨기지 않고 "갈 수는 있지만 눈에 덜 띄게"로 낮춘다. */
const MARKER_HARD_OPACITY = 0.45;

const markerIcon = (type: TPlaceType, selected: boolean, level?: TEligibilityLevel): L.DivIcon => {
  const key = `${type}:${selected}:${level ?? 'none'}`;
  const cached = MARKER_ICONS.get(key);
  if (cached) return cached;

  const size = selected ? 26 : 18;
  const border = selected ? 3 : 2;
  const borderStyle = level === 'cond' ? 'dashed' : 'solid';
  const borderColor = level === 'unknown' ? MARKER_UNKNOWN_BORDER : '#fff';
  const opacity = level === 'hard' ? MARKER_HARD_OPACITY : 1;
  const icon = L.divIcon({
    className: 'zgnn-marker',
    html: `<span style="display:block;width:${size}px;height:${size}px;background:${TYPE_COLOR[type]};border:${border}px ${borderStyle} ${borderColor};box-shadow:0 1px 5px rgba(46,35,39,.45);opacity:${opacity};${MARKER_SHAPE_STYLE[type]}"></span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
  MARKER_ICONS.set(key, icon);
  return icon;
};

/** 지도 마커를 키보드로도 열 수 있게 한다 — role/tabindex/aria-label 은 장소별로 다르므로 DOM 에 직접 얹는다. */
const makeMarkerAddHandler =
  (label: string, onActivate: () => void) =>
  (event: L.LeafletEvent) => {
    const el = (event.target as L.Marker).getElement();
    if (!el) return;
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
    el.setAttribute('aria-label', label);
    el.addEventListener('keydown', (keyEvent: KeyboardEvent) => {
      if (keyEvent.key !== 'Enter' && keyEvent.key !== ' ') return;
      keyEvent.preventDefault();
      onActivate();
    });
  };

export function MapPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const savedOnly = searchParams.get('saved') === '1';
  const savedPlaces = useSavedPlaces();
  const isWide = useMapPageWideLayout();

  // 둘러보기·근처 장소와 공유하는 읍면 필터. 여기서 고르면 그쪽에도 유지된다.
  const town = useAppStore((state) => state.town);
  const setTown = useAppStore((state) => state.setTown);

  const dog = useDog();
  const eligibilityMap = useEligibilityMap();
  // 화면 로컬 상태 — 프로필이 없으면 토글 자체가 보이지 않는다(v0 화면 유지).
  const [hideHard, setHideHard] = useState(false);

  const [types, setTypes] = useState<TPlaceType[]>([]);
  const [directions, setDirections] = useState<TDirection[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // 데스크톱 결과 패널에서 고른 항목으로 스크롤하기 위한 참조.
  const itemRefs = useRef(new Map<string, HTMLLIElement>());

  const filtered = useMemo(() => {
    let list = savedOnly ? savedPlaces : PLACES;
    if (types.length > 0) list = list.filter((place) => types.includes(place.type));
    if (directions.length > 0) {
      list = list.filter((place) => directions.includes(place.region.direction));
    }
    if (town) list = list.filter((place) => place.region.town === town);
    if (hideHard && eligibilityMap) {
      list = list.filter((place) => eligibilityMap.get(place.id)?.level !== 'hard');
    }
    return list;
  }, [savedOnly, savedPlaces, types, directions, town, hideHard, eligibilityMap]);

  const withGeo = useMemo(() => filtered.filter((place) => place.geo), [filtered]);
  const townPoints = useMemo(() => withGeo.map((place) => place.geo!), [withGeo]);
  const missingGeoCount = filtered.length - withGeo.length;
  const selected = withGeo.find((place) => place.id === selectedId) ?? null;

  /*
   * "좌표 없는 N곳 제외" 는 지도만 보는 사용자에게 무슨 뜻인지 안 와닿는다(2026-09-15 리뷰 P2).
   * 종류별로 몇 곳이 빠졌는지 세어, 그 종류의 목록 페이지로 바로 갈 수 있게 한다.
   */
  const missingByType = useMemo(() => {
    const counts = new Map<TPlaceType, number>();
    for (const place of filtered) {
      if (place.geo) continue;
      counts.set(place.type, (counts.get(place.type) ?? 0) + 1);
    }
    return PLACE_TYPES.filter((type) => counts.has(type)).map((type) => ({
      type,
      count: counts.get(type)!,
    }));
  }, [filtered]);

  /*
   * 조건에 걸러진 장소의 선택은 남겨 두지 않는다.
   * 남겨 두면 조건을 되돌렸을 때 닫았던 시트가 저절로 다시 열린다.
   *
   * 이 정리는 effect 가 아니라 렌더 중에 한다 — effect 로 하면 선택이 남은 채로
   * 한 프레임이 먼저 그려지고, 그 뒤 setState 가 렌더를 한 번 더 돌린다.
   * 렌더 중 같은 컴포넌트의 setState 는 React 가 커밋 전에 흡수한다.
   */
  const [lastWithGeo, setLastWithGeo] = useState(withGeo);
  if (lastWithGeo !== withGeo) {
    setLastWithGeo(withGeo);
    if (selectedId !== null && !withGeo.some((place) => place.id === selectedId)) {
      setSelectedId(null);
    }
  }

  // 마커를 누르면 데스크톱 패널에서도 그 항목이 보이도록 끌어온다.
  useEffect(() => {
    if (!selectedId) return;
    itemRefs.current.get(selectedId)?.scrollIntoView({ block: 'nearest' });
  }, [selectedId]);

  const registerItem = useCallback((id: string, node: HTMLLIElement | null) => {
    if (node) itemRefs.current.set(id, node);
    else itemRefs.current.delete(id);
  }, []);

  const toggleType = (type: TPlaceType) =>
    setTypes((prev) =>
      prev.includes(type) ? prev.filter((value) => value !== type) : [...prev, type],
    );

  const toggleDirection = (direction: TDirection) =>
    setDirections((prev) =>
      prev.includes(direction) ? prev.filter((value) => value !== direction) : [...prev, direction],
    );

  const mapEl = (
    <MapContainer
      center={JEJU_CENTER}
      zoom={JEJU_ZOOM}
      zoomControl={false}
      className="h-full w-full"
    >
      <MapPageAutoResize />
      <MapPageFitTown town={town} points={townPoints} />
      <TileLayer
        url={TILE_SOURCE.url}
        attribution={TILE_SOURCE.attribution}
        maxZoom={TILE_SOURCE.maxZoom}
      />
      {withGeo.map((place) => {
        const level = eligibilityMap?.get(place.id)?.level;
        const label = level
          ? `${place.name}, ${TYPE_META[place.type].label}, ${ELIGIBILITY_META[level].label}`
          : `${place.name}, ${TYPE_META[place.type].label}`;
        return (
          <Marker
            key={place.id}
            position={[place.geo!.lat, place.geo!.lng]}
            icon={markerIcon(place.type, place.id === selectedId, level)}
            title={place.name}
            alt={place.name}
            zIndexOffset={place.id === selectedId ? 1000 : 0}
            eventHandlers={{
              click: () => setSelectedId(place.id),
              add: makeMarkerAddHandler(label, () => setSelectedId(place.id)),
            }}
          />
        );
      })}
    </MapContainer>
  );

  return (
    // 모바일에는 하단 탭바가 있어 그만큼 빼고, 탭바가 사라지는 md 이상에서는 화면을 꽉 채운다.
    <div className="relative h-[calc(100dvh-60px-env(safe-area-inset-bottom,0px))] overflow-hidden md:h-dvh">
      <div className="flex h-full">
        {/* 데스크톱 2단 — 좌측 결과 패널. lg 미만에서는 지도만 보인다. */}
        <aside className="hidden w-[360px] shrink-0 flex-col border-r border-secondary bg-primary lg:flex">
          <div className="border-b border-secondary px-4 py-3">
            <h1 className="text-lg font-bold text-primary">지도</h1>
            <p className="mt-0.5 text-sm text-tertiary">{withGeo.length}곳 표시 중</p>
            {missingByType.length > 0 && (
              <p className="mt-1 text-xs text-tertiary">
                지도에 없는 {missingGeoCount}곳은 목록에서 보기:{' '}
                {missingByType.map(({ type, count }, index) => (
                  <span key={type}>
                    {index > 0 && ', '}
                    <Link href={`/places/${type}`} className="text-brand-secondary underline">
                      {TYPE_META[type].label} {count}곳
                    </Link>
                  </span>
                ))}
              </p>
            )}
          </div>

          <ul className="flex-1 overflow-y-auto p-2">
            {withGeo.map((place) => {
              const active = place.id === selectedId;
              return (
                <li key={place.id} ref={(node) => registerItem(place.id, node)}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(place.id)}
                    aria-pressed={active}
                    className={cx(
                      'flex w-full items-start gap-3 rounded-xl p-2.5 text-left transition-colors',
                      active ? 'bg-brand-primary' : 'hover:bg-secondary',
                    )}
                  >
                    <PlaceThumb src={place.cover ?? place.images[0]} type={place.type} size={40} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-primary">
                        {place.name}
                      </span>
                      <span className="mt-1 flex items-center gap-1.5">
                        <TownChip town={place.region.town} type={place.type} />
                        <span className="truncate text-xs text-tertiary">
                          {TYPE_META[place.type].label}
                        </span>
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {/* 고른 장소의 미니 카드. 데스크톱에서는 시트 대신 패널 아래에 붙인다. */}
          {selected && (
            <div className="max-h-[52%] overflow-y-auto border-t border-secondary p-3">
              <MapPageSheetCard place={selected} />
            </div>
          )}
        </aside>

        <div className="relative min-w-0 flex-1">
          {mapEl}

          {/* 지도 위 필터. Leaflet 타일보다 위, 시트보다 아래에 온다. 노치 기기에서 상태바에 가리지 않도록 safe-area 만큼 더 내린다. */}
          <div
            className="pointer-events-none absolute inset-x-0 top-0 z-[1000] space-y-2"
            style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)' }}
          >
            <div
              className="no-scrollbar pointer-events-auto flex gap-2 overflow-x-auto px-3"
              role="group"
              aria-label="장소 종류"
            >
              {PLACE_TYPES.map((type) => {
                const active = types.includes(type);
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => toggleType(type)}
                    aria-pressed={active}
                    className={cx(
                      'flex h-11 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold shadow-sm backdrop-blur transition-colors',
                      active
                        ? 'border-brand bg-brand-solid text-white'
                        : 'border-secondary bg-primary/92 text-secondary',
                    )}
                  >
                    <span
                      className="size-2 rounded-full"
                      style={{ background: active ? 'currentColor' : TYPE_COLOR[type] }}
                      aria-hidden="true"
                    />
                    {TYPE_META[type].label}
                  </button>
                );
              })}

              <span className="my-2 w-px shrink-0 bg-secondary" aria-hidden="true" />

              {DIRECTIONS.map((direction) => {
                const active = directions.includes(direction);
                return (
                  <button
                    key={direction}
                    type="button"
                    onClick={() => toggleDirection(direction)}
                    aria-pressed={active}
                    className={cx(
                      'h-11 shrink-0 rounded-full border px-3.5 text-sm font-semibold shadow-sm backdrop-blur transition-colors',
                      active
                        ? 'border-brand bg-brand-solid text-white'
                        : 'border-secondary bg-primary/92 text-secondary',
                    )}
                  >
                    {DIRECTION_LABEL[direction]}
                  </button>
                );
              })}
            </div>

            {/*
              읍면은 목록이 길어(20여 곳) 가로 스크롤 칩보다 Select 가 낫다. 둘러보기·근처 장소와
              같은 스토어 값을 쓰므로, 여기서 고른 읍면이 그쪽에도 그대로 남는다.
            */}
            <div className="pointer-events-auto px-3">
              <Select
                aria-label="읍면"
                size="sm"
                selectedKey={town ?? 'all'}
                onSelectionChange={(key) => setTown(key === 'all' ? null : String(key))}
                className="w-40"
              >
                <Select.Item id="all">읍면 전체</Select.Item>
                {TOWN_OPTIONS.map((option) => (
                  <Select.Item key={option} id={option}>
                    {option}
                  </Select.Item>
                ))}
              </Select>
            </div>

            {/* 프로필이 없으면 "어려움" 개념이 없어 토글 자체를 그리지 않는다(v0 화면 유지). */}
            {dog && (
              <div className="pointer-events-auto px-3">
                <button
                  type="button"
                  onClick={() => setHideHard((value) => !value)}
                  aria-pressed={hideHard}
                  className={cx(
                    'flex h-11 items-center rounded-full border px-3.5 text-sm font-semibold shadow-sm backdrop-blur transition-colors',
                    hideHard
                      ? 'border-brand bg-brand-solid text-white'
                      : 'border-secondary bg-primary/92 text-secondary',
                  )}
                >
                  어려움 숨기기
                </button>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 px-3 lg:hidden">
              <span className="pointer-events-auto rounded-full bg-primary/92 px-3 py-1 text-xs font-semibold text-secondary shadow-sm backdrop-blur">
                {withGeo.length}곳 표시 중
              </span>
              {savedOnly && (
                <button
                  type="button"
                  onClick={() => router.replace('/map')}
                  aria-label="전체 장소 보기"
                  className="pointer-events-auto rounded-full bg-camellia px-3 py-1 text-xs font-semibold text-white shadow-sm"
                >
                  저장한 곳만 보는 중
                </button>
              )}
              {missingByType.map(({ type, count }) => (
                <Link
                  key={type}
                  href={`/places/${type}`}
                  className="pointer-events-auto rounded-full bg-primary/92 px-3 py-1 text-xs font-semibold text-brand-secondary underline shadow-sm backdrop-blur"
                >
                  지도에 없는 {TYPE_META[type].label} {count}곳 보기
                </Link>
              ))}
            </div>
          </div>

          {savedOnly && savedPlaces.length === 0 && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[1001] p-3">
              <div className="pointer-events-auto">
                <EmptyState
                  Icon={Heart}
                  title="저장한 곳이 아직 없어요"
                  description="마음에 드는 곳의 하트를 누르면 여기에 모여요."
                  action={
                    <Button color="primary" size="lg" href="/places/stay/">
                      장소 둘러보기
                    </Button>
                  }
                />
              </div>
            </div>
          )}

          {withGeo.length === 0 && !(savedOnly && savedPlaces.length === 0) && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[1001] p-3 lg:hidden">
              <div className="pointer-events-auto">
                <EmptyState
                  Icon={AlertTriangle}
                  title="조건에 맞는 곳이 없어요"
                  description="종류나 방향 조건을 조금 줄여보세요."
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/*
        고른 장소는 모바일에서만 시트로 띄운다. 데스크톱(lg 이상)에서는 좌측 패널이
        이미 같은 카드를 보여주고 있어서, 시트까지 열면 같은 내용이 두 번 뜬다.

        여기서 CSS 로 숨기지 않고 마운트 자체를 막는 이유: 시트는 react-aria 가
        document.body 로 포털해서 그리기 때문에, 감싸는 div 에 `lg:hidden` 을 걸어도
        시트는 그 바깥에 그려져 그대로 열린다.
      */}
      {!isWide && (
        <BottomSheet
          isOpen={selected !== null}
          onOpenChange={(open) => {
            if (!open) setSelectedId(null);
          }}
          label={selected ? `${selected.name} 정보` : '장소 정보'}
        >
          {selected && <MapPageSheetCard place={selected} />}
        </BottomSheet>
      )}
    </div>
  );
}
