'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import L from 'leaflet';
import { MapContainer, Marker, TileLayer, useMap } from 'react-leaflet';
import { AlertTriangle, Heart } from '@untitledui/icons';
import { MapPageSheetCard } from './mapPageSheet';
import { useMapPageWideLayout } from './useMapPageWideLayout';
import { BottomSheet } from '@/components/base/bottom-sheet';
import { Button } from '@/components/base/button';
import { Badge } from '@/components/base/badges';
import { EmptyState } from '../components/layout/emptyState';
import { PlaceThumb } from '../components/placeThumb';
import { TownChip } from '../components/townChip';
import { TILE_SOURCE } from '../lib/mapTiles';
import {
  DIRECTIONS,
  DIRECTION_LABEL,
  JEJU_CENTER,
  JEJU_ZOOM,
  PLACES,
  PLACE_TYPES,
  TYPE_COLOR,
  TYPE_META,
} from '../lib/places';
import { useSavedPlaces } from '../store/useAppStore';
import { cx } from '../utils/cx';
import type { TDirection, TPlaceType } from '../types';

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
 * 마커 아이콘은 타입×선택여부 6가지뿐이라 한 번 만들어 두고 계속 쓴다.
 * 렌더마다 새 객체를 넘기면 react-leaflet 이 마커 전체에 setIcon 을 다시 건다.
 */
const MARKER_ICONS = new Map<string, L.DivIcon>();

const markerIcon = (type: TPlaceType, selected: boolean): L.DivIcon => {
  const key = `${type}:${selected}`;
  const cached = MARKER_ICONS.get(key);
  if (cached) return cached;

  const size = selected ? 26 : 18;
  const icon = L.divIcon({
    className: 'zgnn-marker',
    html: `<span style="display:block;width:${size}px;height:${size}px;border-radius:50%;background:${TYPE_COLOR[type]};border:${selected ? 3.5 : 2.5}px solid #fff;box-shadow:0 1px 5px rgba(42,39,36,.45)"></span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
  MARKER_ICONS.set(key, icon);
  return icon;
};

export function MapPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const savedOnly = searchParams.get('saved') === '1';
  const savedPlaces = useSavedPlaces();
  const isWide = useMapPageWideLayout();

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
    return list;
  }, [savedOnly, savedPlaces, types, directions]);

  const withGeo = useMemo(() => filtered.filter((place) => place.geo), [filtered]);
  const missingGeoCount = filtered.length - withGeo.length;
  const selected = withGeo.find((place) => place.id === selectedId) ?? null;

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
      <TileLayer
        url={TILE_SOURCE.url}
        attribution={TILE_SOURCE.attribution}
        maxZoom={TILE_SOURCE.maxZoom}
      />
      {withGeo.map((place) => (
        <Marker
          key={place.id}
          position={[place.geo!.lat, place.geo!.lng]}
          icon={markerIcon(place.type, place.id === selectedId)}
          title={place.name}
          alt={place.name}
          zIndexOffset={place.id === selectedId ? 1000 : 0}
          eventHandlers={{ click: () => setSelectedId(place.id) }}
        />
      ))}
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
            <p className="mt-0.5 text-sm text-tertiary">
              {withGeo.length}곳 표시 중
              {missingGeoCount > 0 && ` · 좌표 없는 ${missingGeoCount}곳 제외`}
            </p>
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

          {/* 지도 위 필터. Leaflet 타일보다 위, 시트보다 아래에 온다. */}
          <div className="pointer-events-none absolute inset-x-0 top-0 z-[1000] space-y-2 pt-3">
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
              {missingGeoCount > 0 && (
                <span className="pointer-events-auto">
                  <Badge size="sm" color="warning">
                    좌표 없는 {missingGeoCount}곳 제외
                  </Badge>
                </span>
              )}
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
                    <Button color="primary" size="lg" href="/places/stay">
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
