'use client';

import { Check } from '@untitledui/icons';
import { ListBox as AriaListBox, ListBoxItem as AriaListBoxItem } from 'react-aria-components';
import { BottomSheet } from '../components/base/bottom-sheet';
import { placesPageSortLabel, placesPageSortOptions } from '../lib/placesPageFilter';
import type { TPlaceSort } from '../lib/placeFilters';
import { cx } from '../utils/cx';
import type { TPlaceType } from '../types';

type TPlacesPageSortSheetProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  type: TPlaceType;
  /** 보이는 정렬(기준이 사라진 '가까운 순' 은 기본). */
  sort: TPlaceSort;
  /** 정렬 이름에 — 기본 순서의 이름이 강아지 유무로 갈리고, '가까운 순' 은 기준 이름을 앞에 붙인다(`placesPageSortLabel`). */
  hasDog: boolean;
  nearFrom?: string;
  /** 위치 권한 흐름(`changeSort`)은 부르는 쪽이 갖는다 — 시트는 고른 것을 넘기고 닫힐 뿐이다. */
  onChangeSort: (sort: TPlaceSort) => void;
};

/**
 * 모바일 정렬 시트(22 D-3) — 칩 줄의 '지금 정렬 ▾' 한 칩이 연다. 목록 위에 정렬 칩 2~4개를 늘어놓던 줄(14 W261019.13)은
 * 지금 순서를 눌린 칩으로 말했지만 칩 더미를 하나 더 세웠다 — 실서비스 4/4 는 '정렬 이름 ▾' 하나 + 고르는 시트다.
 *
 * 줄은 라디오처럼 보이되 키보드는 목록(ListBox)으로 둔다 — 진짜 radiogroup 은 화살표가 곧 선택이라 "고르면 바로 닫힘" 과 합치면
 * 첫 ↓ 에 시트가 닫힌다. 그래서 화살표는 포커스만 옮기고 Enter·탭이 고른다(`SheetSelect` 의 시트 피커와 같은 짝).
 * 이미 고른 줄을 다시 누르면 선택이 비는데(react-aria), 그때도 값은 그대로 두고 닫기만 한다.
 */
export function PlacesPageSortSheet({ isOpen, onOpenChange, type, sort, hasDog, nearFrom, onChangeSort }: TPlacesPageSortSheetProps) {
  return (
    <BottomSheet isOpen={isOpen} onOpenChange={onOpenChange} label="정렬" title="정렬">
      <AriaListBox
        aria-label="정렬"
        selectionMode="single"
        selectedKeys={[sort]}
        onSelectionChange={(keys) => {
          const next = keys !== 'all' && keys.size > 0 ? (String([...keys][0]) as TPlaceSort) : null;
          onOpenChange(false);
          if (next && next !== sort) onChangeSort(next);
        }}
        autoFocus
        className="-mx-2 mt-2 outline-hidden"
      >
        {placesPageSortOptions(type).map((option) => {
          const label = placesPageSortLabel(option, { hasDog, nearFrom });
          return (
            <AriaListBoxItem
              key={option}
              id={option}
              textValue={label}
              className={({ isSelected, isFocusVisible, isPressed }) =>
                cx(
                  'flex h-13 cursor-pointer items-center gap-3 rounded-lg px-2 text-md outline-hidden select-none',
                  // 시트 면이 크림이라 눌림은 한 단 진한 tertiary(primary_hover 는 크림과 같다).
                  isSelected ? 'font-semibold text-primary' : 'text-secondary hover:bg-tertiary',
                  isPressed && 'bg-tertiary',
                  isFocusVisible && 'ring-2 ring-focus-ring ring-inset',
                )
              }
            >
              {({ isSelected }) => (
                <>
                  <span className="min-w-0 flex-1 truncate">{label}</span>
                  {isSelected && <Check aria-hidden="true" className="size-5 shrink-0 text-fg-brand-primary" />}
                </>
              )}
            </AriaListBoxItem>
          );
        })}
      </AriaListBox>
    </BottomSheet>
  );
}
