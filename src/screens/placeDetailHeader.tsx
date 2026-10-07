'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { PLACE_TYPE_ICON } from '../components/icons/placeTypeIcon';
import { PLACE_THUMB, PlaceThumb } from '../components/placeThumb';
import { PlaceDetailNote } from './placeDetailNote';
import { TYPE_COLOR } from '../lib/places';
import {
  morphModeOf,
  offsetInScroller,
  writeMorphMode,
  writeMorphRange,
} from '../components/layout/scrollDrivenMorph';
import { categoryLabel } from '../lib/category';
import { DIRECTION_LABEL, TYPE_COLOR_DEEP, TYPE_META, type TPlaceEntry } from '../lib/places';
import { titleFlight } from '../lib/titleFlight';
import { PlaceDetailAppBar } from './placeDetailAppBar';

const useBeforePaint = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/**
 * 상세 화면의 제목 블록.
 *
 * **색 판을 깔지 않는다**(ADR-010 v4). 예전에는 종류 색의 파스텔 워시 판 위에 이름을 올렸는데,
 * 하위 화면 중 이 화면만 본문이 색 면으로 시작해 헤더(크림) 바로 밑에 다른 색 덩어리가 끼어
 * 있었다 — 끝까지 깔면 가로 경계가, 라운드 판으로 띄우면 "뭔가 올라와 있는" 덩어리가 됐다.
 * 지금은 `/saved`·`/dog` 의 PageHeader 처럼 크림 위에 글자만 두고, 종류는 **목록 카드와 같은
 * 썸네일 타일**(PlaceThumb)로 말한다 — 목록에서 누른 카드의 그 아이콘이 상세 맨 위에 그대로
 * 있어 이어져 보인다. 종류 색은 타일과 읍면 글씨에만 남는다.
 *
 * **타일은 상호명 왼쪽에 한 줄로 선다**(목록 카드와 같은 배치). 그리고 이 줄이 **스크롤을 따라 헤더 안의 제자리로 날아 들어간다** —
 * 홈 헤더(잉크 카드 → 헤더)와 같은 약속이다: 진입하면 지금 모습, 스크롤한 만큼 옮겨 가고, 되돌리면 같은 길로 풀린다.
 * - 줄은 본문과 같이 스크롤되므로 세로는 저절로 맞는다. 줄의 세로 중심이 헤더 가운데에 닿는 스크롤까지, 타일·상호명이 각각
 *   헤더의 아이콘·상호명 자리로 **가로로 옮겨 가며 준다**(`lib/titleFlight.ts`).
 * - **타일은 절반까지 색 판이 빠지고 크기도 다 준다** — 그 뒤로는 종류 글리프만 날아간다. 판이 끝까지 남으면 40px 판이 뒤로가기
 *   화살표 옆을 스치며 지나갔다. 판 위에 같은 글리프를 한 벌 겹쳐 두고 판(`PlaceThumb`)만 투명하게 한다 — 글리프는 끊기지 않는다.
 * - 도착하는 순간(마지막 15%) 헤더 속 같은 자리의 복사본(`placeDetailAppBar`)과 겹쳐 바뀐다. 오른쪽 `구좌읍 · 펜션` 은 절반부터 나타난다.
 * - 줄은 헤더(`z-30`)보다 **위에** 그린다 — 밑이면 헤더에 닿는 순간 가려져 날아 들어가는 것이 안 보인다. 손은 받지 않는다
 *   (`pointer-events-none`) — 옮겨 가는 동안 뒤로가기 버튼 위를 지난다.
 * - 지원하지 않는 브라우저는 줄이 헤더에 닿는 순간 한 번에 옮겨 간다(`snap`, `scrollDrivenMorph.ts`).
 *
 * 이 이름이 폭과 무관하게 이 화면의 유일한 h1 이다. 헤더의 복사본은 `aria-hidden` 이다.
 */
export function PlaceDetailHeader({ place }: { place: TPlaceEntry }) {
  const Glyph = PLACE_TYPE_ICON[place.type];
  const headerRef = useRef<HTMLElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  /** 헤더 쪽 도착점. 포털이라 헤더가 자리를 적은 뒤에야 생긴다 — ref 콜백으로 받아 그때 잰다. */
  const [bar, setBar] = useState<HTMLDivElement | null>(null);

  useBeforePaint(() => {
    const header = headerRef.current;
    const row = rowRef.current;
    const thumb = thumbRef.current;
    const title = titleRef.current;
    const icon = bar?.querySelector<HTMLElement>('[data-flight-target="icon"]');
    const barTitle = bar?.querySelector<HTMLElement>('[data-flight-target="title"]');
    if (!header || !row || !thumb || !title || !bar || !icon || !barTitle) return;

    const mode = morphModeOf();
    let rowTop = 0;
    let rowCenter = 0;
    let barBottom = 0;
    const measure = () => {
      // 본문 쪽은 transform 이 걸려 있을 수 있어 offset*(transform 무시)으로, 헤더 쪽은 움직이지 않으므로 사각형으로 잰다.
      const headerTop = offsetInScroller(header);
      const headerLeft = header.getBoundingClientRect().left;
      rowTop = headerTop + row.offsetTop;
      rowCenter = rowTop + row.offsetHeight / 2;
      const barRow = bar.parentElement?.getBoundingClientRect();
      const iconRect = icon.getBoundingClientRect();
      const barTitleRect = barTitle.getBoundingClientRect();
      barBottom = barRow?.bottom ?? 0;
      const glyph = thumb.querySelector('svg')?.getBoundingClientRect().width ?? 0;
      const tile = thumb.getBoundingClientRect().width;

      const flight = titleFlight({
        rowCenter,
        barCenter: iconRect.top + iconRect.height / 2,
        thumbLeft: headerLeft + row.offsetLeft + thumb.offsetLeft,
        thumbWidth: thumb.offsetWidth,
        glyphRatio: tile > 0 ? glyph / tile : 0.5,
        barIconCenterX: iconRect.left + iconRect.width / 2,
        barIconWidth: iconRect.width,
        titleLeft: headerLeft + row.offsetLeft + title.offsetLeft,
        titleFontSize: parseFloat(getComputedStyle(title).fontSize),
        barTitleLeft: barTitleRect.left,
        barTitleFontSize: parseFloat(getComputedStyle(barTitle).fontSize),
      });
      for (const el of [header, bar]) {
        if (mode === 'scroll') writeMorphRange(el, flight.range);
      }
      header.style.setProperty('--thumb-tx', `${flight.thumb.tx}px`);
      header.style.setProperty('--thumb-scale', String(flight.thumb.scale));
      header.style.setProperty('--title-tx', `${flight.title.tx}px`);
      header.style.setProperty('--title-scale', String(flight.title.scale));
    };

    // snap: 줄의 윗변이 헤더 아랫변에 닿는 순간 한 번에 옮겨 간다.
    let last = -1;
    const onScroll = () => {
      if (mode !== 'snap') return;
      const morph = rowTop - window.scrollY <= barBottom ? 1 : 0;
      if (morph === last) return;
      last = morph;
      header.style.setProperty('--morph', String(morph));
      bar.style.setProperty('--morph', String(morph));
    };

    measure();
    onScroll();
    const clearModes = [writeMorphMode(header, mode), writeMorphMode(bar, mode)];
    const resize = new ResizeObserver(() => {
      measure();
      last = -1;
      onScroll();
    });
    resize.observe(header);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', measure);
    return () => {
      resize.disconnect();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', measure);
      clearModes.forEach((clear) => clear());
    };
  }, [bar, place.id]);

  return (
    <header ref={headerRef} className="relative px-4 pt-2 md:px-6 md:pt-4" style={{ ['--morph' as string]: 0 }}>
      <PlaceDetailAppBar place={place} ref={setBar} />

      <div ref={rowRef} className="pointer-events-none relative z-[31] flex items-center gap-3">
        <div
          ref={thumbRef}
          data-scroll-morph="flight-thumb"
          className="relative shrink-0 origin-left will-change-transform"
          style={{
            transform:
              'translateX(calc(var(--thumb-tx, 0px) * var(--morph))) scale(calc(1 - (1 - var(--thumb-scale, 1)) * var(--morph)))',
            opacity: 'calc(1 - var(--morph))',
          }}
        >
          {/* 판은 절반까지 빠진다. 위에 겹친 글리프는 판 안의 글리프와 같은 크기·색·자리라, 판이 빠져도 아이콘은 그대로 날아간다. */}
          <div data-scroll-morph="tile-out" style={{ opacity: 'calc(1 - var(--morph))' }}>
            <PlaceThumb type={place.type} />
          </div>
          <span aria-hidden="true" className="absolute inset-0 grid place-items-center" style={{ color: TYPE_COLOR[place.type] }}>
            <Glyph className={PLACE_THUMB.primary.icon} />
          </span>
        </div>
        <h1
          ref={titleRef}
          data-scroll-morph="flight-title"
          className="min-w-0 origin-left text-display-xs font-bold text-primary will-change-transform"
          style={{
            transform:
              'translateX(calc(var(--title-tx, 0px) * var(--morph))) scale(calc(1 - (1 - var(--title-scale, 1)) * var(--morph)))',
            opacity: 'calc(1 - var(--morph))',
          }}
        >
          {place.name}
        </h1>
      </div>

      <p className="mt-2 flex flex-wrap items-center gap-1.5 text-sm text-secondary">
        <span className="font-semibold" style={{ color: TYPE_COLOR_DEEP[place.type] }}>
          {DIRECTION_LABEL[place.region.direction]} {place.region.town}
        </span>
        <span className="h-3 w-px bg-quaternary" aria-hidden="true" />
        <span>{categoryLabel(place.category, TYPE_META[place.type].label, place.type)}</span>
      </p>

      {place.address && <p className="mt-1 text-sm text-tertiary">{place.address}</p>}

      {/* 저장 화면에 적은 내 메모 — 목록 카드와 같은 자리(이름 블록 바로 밑). 누르면 바로 고친다(10 F5.1). */}
      <PlaceDetailNote id={place.id} name={place.name} className="mt-3" />
    </header>
  );
}
