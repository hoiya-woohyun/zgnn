'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, Heart } from '@untitledui/icons';
import { MapPageCanvas } from './mapPageCanvas';
import { MapPageSheetCard } from './mapPageSheet';
import { useMapPageWideLayout } from './useMapPageWideLayout';
import { BottomSheet } from '@/components/base/bottom-sheet';
import { Button } from '@/components/base/button';
import { EmptyState } from '../components/layout/emptyState';
import { PlaceThumb } from '../components/placeThumb';
import { TownChip } from '../components/townChip';
import { PLACES, PLACE_TYPES, TYPE_COLOR, TYPE_META } from '../lib/places';
import { useSavedPlaces } from '../store/useAppStore';
import { useEligibilityMap } from '../store/useDogEligibility';
import { cx } from '../utils/cx';
import type { TPlaceType } from '../types';

export function MapPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const savedOnly = searchParams.get('saved') === '1';
  const savedPlaces = useSavedPlaces();
  const isWide = useMapPageWideLayout();

  // 판정은 마커 흐리기(hard)와 시트 배지에만 쓴다 — 지도에서 거르지는 않는다.
  const eligibilityMap = useEligibilityMap();

  const [types, setTypes] = useState<TPlaceType[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // 데스크톱 결과 패널에서 고른 항목으로 스크롤하기 위한 참조.
  const itemRefs = useRef(new Map<string, HTMLLIElement>());

  /*
   * 지도의 조건은 종류 하나뿐이다.
   *
   * 읍면·방향은 지도가 이미 하는 일(끌고 확대하기)을 컨트롤로 옮겨 놓은 것이라 뺐고,
   * "어려운 곳 숨기기" 도 뺐다 — 판정을 좁혀 보는 일은 둘러보기 목록이 더 잘한다.
   * 지도는 "숙소·식당·카페가 제주 어디에 있나" 한 가지만 답한다(→ ADR-008).
   */
  const filtered = useMemo(() => {
    const list = savedOnly ? savedPlaces : PLACES;
    return types.length > 0 ? list.filter((place) => types.includes(place.type)) : list;
  }, [savedOnly, savedPlaces, types]);

  const withGeo = useMemo(() => filtered.filter((place) => place.geo), [filtered]);
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

  // 캔버스는 이 참조가 바뀌면 마커를 전부 다시 만든다 — 렌더마다 새 함수를 넘기지 않는다.
  const handleSelect = useCallback((id: string) => setSelectedId(id), []);

  const registerItem = useCallback((id: string, node: HTMLLIElement | null) => {
    if (node) itemRefs.current.set(id, node);
    else itemRefs.current.delete(id);
  }, []);

  const toggleType = (type: TPlaceType) =>
    setTypes((prev) =>
      prev.includes(type) ? prev.filter((value) => value !== type) : [...prev, type],
    );

  const mapEl = (
    <MapPageCanvas
      places={withGeo}
      selectedId={selectedId}
      onSelect={handleSelect}
      eligibilityMap={eligibilityMap}
    />
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
                    <PlaceThumb src={place.cover ?? place.images[0]} type={place.type} variant="compact" />
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

          {/* 지도 위 종류 칩. 네이버 타일·컨트롤보다 위, 시트보다 아래에 온다. 노치 기기에서 상태바에 가리지 않도록 safe-area 만큼 더 내린다. */}
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
                  className="pointer-events-auto inline-flex min-h-11 cursor-pointer items-center rounded-full bg-camellia px-3.5 text-xs font-semibold text-white shadow-sm"
                >
                  저장한 곳만 보는 중
                </button>
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
                  title="필터에 맞는 곳이 없어요"
                  description="종류나 읍면 조건을 조금 줄여보세요."
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
