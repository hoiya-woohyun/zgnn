'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, Heart, NavigationPointer01 } from '@untitledui/icons';
import { MapPageCanvas, type TMapPageCanvasHandle } from './mapPageCanvas';
import { MapPageSheetCard } from './mapPageSheet';
import { useMapPageWideLayout } from './useMapPageWideLayout';
import { BottomSheet } from '@/components/base/bottom-sheet';
import { Button } from '@/components/base/button';
import { EmptyState } from '../components/layout/emptyState';
import { PlaceThumb } from '../components/placeThumb';
import { TownChip } from '../components/townChip';
import { LOCATE_MAP_NOT_READY, LOCATE_NOTICE, locateMe } from '../lib/myLocation';
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
  const savedIds = useMemo(() => new Set(savedPlaces.map((place) => place.id)), [savedPlaces]);
  const isWide = useMapPageWideLayout();

  // 판정은 마커 흐리기(hard)와 시트 배지에만 쓴다 — 지도에서 거르지는 않는다.
  const eligibilityMap = useEligibilityMap();

  /*
   * 칩은 "고른 종류" 가 아니라 **보이는 종류** 다 — 처음엔 셋 다 켜져 있고, 누르면 그 종류를 끈다.
   * "빈 선택 = 전체" 로 두면 칩이 전부 꺼진 모양인데 마커는 다 보이고, 하나를 켜면 오히려 줄어든다.
   * 칩에 마커 색 점이 붙어 있어 범례 겸 스위치로 읽히니, 칩 모양과 지도를 일치시킨다.
   */
  const [types, setTypes] = useState<TPlaceType[]>(PLACE_TYPES);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  /*
   * 내 위치 — 누를 때 한 번 가져온다(ADR-008 v13·v14). 실패하면 지도 위에 한 줄을 띄우고 잠시 뒤 지운다.
   * 권한 거절도 버튼을 숨기지 않는다: 숨기면 설정에서 허용한 뒤 다시 누를 곳이 없다.
   */
  const canvasRef = useRef<TMapPageCanvasHandle>(null);
  const [locating, setLocating] = useState(false);
  const [locateNotice, setLocateNotice] = useState<string | null>(null);

  const handleLocate = async () => {
    if (locating) return;
    setLocating(true);
    setLocateNotice(null);
    const result = await locateMe();
    setLocating(false);
    if (result.kind === 'ok') {
      // 위치가 SDK 보다 먼저 올 수 있다(느린 연결 + 캐시된 위치). 조용히 넘기면 버튼이 먹통처럼 보인다.
      const moved = canvasRef.current?.showMyLocation(result.lat, result.lng) ?? false;
      if (!moved) setLocateNotice(LOCATE_MAP_NOT_READY);
    } else {
      setLocateNotice(LOCATE_NOTICE[result.kind]);
    }
  };

  // 안내는 6초 뒤 지운다. 새 안내가 오면 타이머를 다시 건다.
  useEffect(() => {
    if (!locateNotice) return;
    const timer = window.setTimeout(() => setLocateNotice(null), 6000);
    return () => window.clearTimeout(timer);
  }, [locateNotice]);

  // 데스크톱 결과 패널에서 고른 항목으로 스크롤하기 위한 참조.
  const itemRefs = useRef(new Map<string, HTMLLIElement>());

  /*
   * 지도의 조건은 종류 하나뿐이다.
   *
   * 읍면·방향은 지도가 이미 하는 일(끌고 확대하기)을 컨트롤로 옮겨 놓은 것이라 뺐고,
   * "어려운 곳 숨기기" 도 뺐다 — 판정을 좁혀 보는 일은 둘러보기 목록이 더 잘한다.
   * 지도는 "숙소·식당·카페가 제주 어디에 있나" 한 가지만 답한다(→ ADR-008).
   */
  // 원본을 먼저 고른다 — 저장 칩이 꺼져 있을 때 하트를 눌러도 목록 참조가 바뀌어 마커가 다시 만들어지지 않게.
  const source = savedOnly ? savedPlaces : PLACES;
  const filtered = useMemo(
    () => source.filter((place) => types.includes(place.type)),
    [source, types],
  );

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

  // 마지막 하나는 끄지 않는다 — 다 끄면 필터 때문에 빈 지도가 된다.
  const toggleType = (type: TPlaceType) =>
    setTypes((prev) => {
      if (!prev.includes(type)) return [...prev, type];
      return prev.length > 1 ? prev.filter((value) => value !== type) : prev;
    });

  /*
   * 저장 칩은 종류 칩과 달리 **주소(`?saved=1`)가 쥔다** — 저장 화면·홈의 "지도에서 보기" 가 같은
   * 주소로 들어오고, 뒤로가기·새로고침에도 그 상태로 돌아와야 해서다. replace 라 칩을 몇 번 눌러도
   * 방문 기록은 쌓이지 않는다. 종류 칩과는 AND 로 겹친다(저장 ∩ 카페).
   */
  const toggleSavedOnly = () =>
    router.replace(savedOnly ? '/map/' : '/map/?saved=1', { scroll: false });

  const mapEl = (
    <MapPageCanvas
      ref={canvasRef}
      places={withGeo}
      selectedId={selectedId}
      onSelect={handleSelect}
      eligibilityMap={eligibilityMap}
      savedIds={savedIds}
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
            <p className="mt-0.5 text-sm text-tertiary">
              {savedOnly ? `저장한 곳 중 ${withGeo.length}곳 표시 중` : `${withGeo.length}곳 표시 중`}
            </p>
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

        {/*
          지도 칸. `@container/map` 은 스타일이 아니라 **잣대**다 — globals.css 가 저작권 줄과 빈 상태 카드의
          자리를 뷰포트가 아니라 이 칸의 폭으로 고른다(`lg` 에서는 옆 패널 때문에 둘이 다르다). 지우면
          좁은 칸의 값이 모든 폭에 걸린다.
        */}
        <div className="@container/map relative min-w-0 flex-1">
          {mapEl}

          {/*
            지도 위 종류 칩. 네이버 타일·컨트롤보다 위, 시트보다 아래에 온다. 노치 기기에서 상태바에 가리지 않도록 safe-area 만큼 더 내린다.
            빈 상태 카드(`z-[1001]`)보다도 위다 — 낮은 가로 화면에서 카드가 칩 줄까지 올라오면, 카드가
            "조건을 줄여 보라" 고 하면서 그 칩을 덮어 버린다. 겹친 자리는 칩이 카드 윗부분을 가린다.
          */}
          <div
            className="pointer-events-none absolute inset-x-0 top-0 z-[1002] space-y-2"
            style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)' }}
          >
            <div
              /*
               * `w-fit max-w-full` 이 없으면 이 띠는 전폭 절대배치 부모 안의 블록 요소라
               * **칩 개수와 무관하게 `width: 100%`** 가 된다. `pointer-events-auto` 가 걸려 있으니
               * 칩 오른쪽의 빈 구간이 투명한 클릭 차단막이 되어 그 자리의 지도 끌기를 먹는다
               * (로고가 우상단에 있던 v6 에는 로고 링크의 탭까지 먹었다 — 보이는 픽셀만 비어 있었다).
               * `pointer-events-auto` 를 버튼으로 내리면 터치 드래그 스크롤이 죽으므로 폭을 줄인다.
               */
              className="no-scrollbar pointer-events-auto flex w-fit max-w-full gap-2 overflow-x-auto px-3"
              role="group"
              aria-label="보이는 장소"
            >
              {/*
                맨 앞의 저장 칩. "현장에서 내가 저장한 곳 중 근처는?" 을 지도 안에서 한 번에 답하려고
                둔다 — 예전에는 설정 → 저장한 곳 → 지도에서 보기, 세 번을 거쳐야 켤 수 있었다.
                camellia 는 브랜드색과 같은 값이라(theme.css) 켜진 모습만으로는 종류 칩과 안 갈린다 —
                "무엇을 거르나" 가 다른 축이라는 것은 하트와 뒤따르는 세로 구분선이 말한다.
              */}
              <button
                type="button"
                onClick={toggleSavedOnly}
                aria-pressed={savedOnly}
                className={cx(
                  'flex h-11 shrink-0 items-center gap-1.5 rounded-xl border px-3.5 text-sm font-semibold shadow-sm backdrop-blur transition-colors',
                  savedOnly
                    ? 'border-camellia bg-camellia text-white'
                    : 'border-secondary bg-primary/92 text-secondary',
                )}
              >
                <Heart
                  size={16}
                  aria-hidden="true"
                  className={savedOnly ? 'fill-white' : 'fill-camellia text-camellia'}
                />
                저장 {savedPlaces.length}
              </button>
              <span aria-hidden="true" className="my-1.5 w-0.5 shrink-0 rounded-full bg-primary/92 shadow-sm" />

              {PLACE_TYPES.map((type) => {
                const active = types.includes(type);
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => toggleType(type)}
                    aria-pressed={active}
                    className={cx(
                      'flex h-11 shrink-0 items-center gap-1.5 rounded-xl border px-3.5 text-sm font-semibold shadow-sm backdrop-blur transition-colors',
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

            <div className="flex items-start gap-2 px-3">
              <span className="pointer-events-auto rounded-md bg-primary/92 px-2 py-1 text-xs font-semibold text-secondary shadow-sm backdrop-blur lg:hidden">
                {withGeo.length}곳 표시 중
              </span>
              {/*
                내 위치 버튼. 위쪽 오른편에 두는 이유는 **아래쪽이 이미 차 있어서다** — 좌하단은 로고·저작권,
                우하단은 축척 막대, 가운데 아래는 빈 상태 카드와 모바일 바텀시트가 쓴다(ADR-008 v9).
              */}
              <button
                type="button"
                onClick={handleLocate}
                aria-label="내 위치로 이동"
                aria-busy={locating}
                className="pointer-events-auto ml-auto flex size-11 shrink-0 items-center justify-center rounded-full border border-secondary bg-primary/92 text-secondary shadow-sm backdrop-blur transition-colors hover:text-primary"
              >
                <NavigationPointer01
                  size={20}
                  aria-hidden="true"
                  className={cx(locating && 'animate-pulse text-brand-secondary')}
                />
              </button>
            </div>

            {/* 스크린 리더가 새 안내를 읽도록 틀은 늘 둔다 — 안내가 생길 때 틀째 끼우면 읽지 않는다. */}
            <div role="status" aria-live="polite" className="px-3">
              {locateNotice && (
                <p className="pointer-events-auto ml-auto w-fit max-w-sm rounded-xl border border-secondary bg-primary/95 px-3.5 py-2.5 text-sm text-secondary shadow-sm backdrop-blur">
                  {locateNotice}
                </p>
              )}
            </div>
          </div>

          {savedOnly && savedPlaces.length === 0 && (
            // 아래 여백은 저작권 줄(좌하단) 위로 비켜 앉는 몫이다 — 값은 globals.css 가 쥔다.
            <div className="above-map-attribution pointer-events-none absolute inset-x-0 bottom-0 z-[1001] px-3 pt-3">
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
            <div className="above-map-attribution pointer-events-none absolute inset-x-0 bottom-0 z-[1001] px-3 pt-3 lg:hidden">
              <div className="pointer-events-auto">
                <EmptyState
                  Icon={AlertTriangle}
                  title="켜 둔 종류에 표시할 곳이 없어요"
                  description="위에서 다른 종류를 켜 보세요."
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
