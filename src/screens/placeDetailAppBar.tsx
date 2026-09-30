import type { Ref } from 'react';
import { AppBarSlot } from '../components/layout/appBarSlot';
import { PLACE_TYPE_ICON } from '../components/icons/placeTypeIcon';
import { categoryLabel } from '../lib/category';
import { TYPE_COLOR, TYPE_META, type TPlaceEntry } from '../lib/places';

/** 날아 들어오는 본문 제목 줄(`placeDetailHeader`)이 크기가 바뀔 때마다 재는 헤더 쪽 도착점. */
export type TPlaceDetailAppBarTargets = { icon: HTMLElement; title: HTMLElement; root: HTMLElement };

/**
 * 상세를 내려 읽으면 헤더에 남는 한 줄 — 왼쪽에 종류 아이콘·이름, 오른쪽에 동네·종류.
 *
 * **본문 제목 줄이 날아 들어와 이것이 된다**(`placeDetailHeader`). 본문의 아이콘 타일·상호명이 스크롤을 따라 여기 아이콘·이름
 * 자리로 옮겨 가며 줄고, 도착하는 순간 이 줄과 겹쳐 바뀐다(홈 헤더에서 흰 제목 ↔ 본문색 제목을 두 벌 겹친 것과 같은 장치).
 * 그래서 이 줄은 **움직이지 않고 투명도만** 바뀐다 — 본문 쪽이 여기를 겨냥해 날아오므로 자리가 고정이어야 한다.
 *
 * - **아이콘은 타일 없이 글리프만**, 종류 색으로. 날아오는 타일의 글리프가 이 크기까지 줄고, 도착하면 색 판만 빠진다.
 * - **동네는 읍면까지만**(방위 `동쪽` 은 뺀다) — 헤더에서는 두루뭉술한 쪽이 빨리 읽힌다. 정확한 주소는 본문에 있다.
 * - 이름이 길면 이름이 줄고 오른쪽은 그대로다 — 오른쪽이 짧고 고정된 말이라 잘리면 뜻이 사라진다.
 */
export function PlaceDetailAppBar({ place, ref }: { place: TPlaceEntry; ref: Ref<HTMLDivElement> }) {
  const Icon = PLACE_TYPE_ICON[place.type];
  return (
    <AppBarSlot>
      {/* 구간·진행도 변수를 받는 상자. 상자 자체는 레이아웃에 끼지 않는다 — 헤더 슬롯의 flex 가 아래 셋을 바로 줄 세운다. */}
      <div ref={ref} className="contents">
        <span data-flight-target="icon" data-scroll-morph="hand-off-in" className="shrink-0" style={{ opacity: 'var(--morph)' }}>
          <Icon className="block size-5" style={{ color: TYPE_COLOR[place.type] }} />
        </span>
        <span
          data-flight-target="title"
          data-scroll-morph="hand-off-in"
          className="clamp-1 min-w-0 flex-1 text-md font-bold text-primary"
          style={{ opacity: 'var(--morph)' }}
        >
          {place.name}
        </span>
        <span data-scroll-morph="title-trailing" className="shrink-0 pr-3 text-sm text-tertiary" style={{ opacity: 'var(--morph)' }}>
          {place.region.town} · {categoryLabel(place.category, TYPE_META[place.type].label)}
        </span>
      </div>
    </AppBarSlot>
  );
}
