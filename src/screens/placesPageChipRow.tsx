'use client';

import { useRef, type ComponentProps } from 'react';
import { ChevronDown, RefreshCw01, Sliders02, XClose } from '@untitledui/icons';
import { FilterChip } from '../components/filterChip';
import type { TActiveChip } from './placesPageActiveChips';
import { SCROLL_ROW_CLASS } from './placesPageFilters';
import { cx } from '../utils/cx';

type TPlacesPageChipRowProps = {
  /** 시트 안에서 켠 조건 수(`activeFilterCount`) — 필터 칩에 '필터 3' 으로. */
  activeFilterCount: number;
  /** 줄에 세울 켠 조건 — 시트의 차례(`placesPageChips`). 평범한 검색어 칩은 부르는 쪽이 뺀다(검색칸이 말한다). */
  chips: TActiveChip[];
  /** 지금 정렬 이름(`placesPageSortLabel`). */
  sortLabel: string;
  isFilterOpen: boolean;
  onOpenFilters: () => void;
  isSortOpen: boolean;
  onOpenSort: () => void;
  /** 초기화를 세우는가 — 누르면 풀리는 것(권역·조건)이 있을 때만. 검색어는 검색칸 ✕, '실내 자리 필요'(설정)는 제 칩 ✕ 가 끈다. */
  showReset: boolean;
  /** 권역·조건을 푼다 — 검색어와 '실내 자리 필요' 는 그대로(22 A·B review R-2·c). */
  onReset: () => void;
  className?: string;
};

/** 칩의 꼬리 ▾ — 16px · 가장 옅은 아이콘 색. FilterChip 의 꼬리 아이콘 자리(14px · 글자색)를 이 칩만 덮는다. */
const SortChevron = ({ className, ...rest }: ComponentProps<typeof ChevronDown>) => (
  <ChevronDown {...rest} className={cx(className, 'size-4 text-fg-quaternary')} />
);

/**
 * 검색칸 밑 한 줄(모바일, 22 D-2·D-3·D-4) — [필터] [정렬 ▾] [켠 조건 ✕…] [초기화]. 옆으로 밀리고 줄을 바꾸지 않는다.
 *
 * 전에는 검색칸 옆 '필터' 버튼(채운 핑크 + 흰 원 숫자) · 목록 위 정렬 칩 줄 · 그 밑에 줄바꿈으로 쌓이는 켠 조건 줄이 따로 있어,
 * 조건을 켤수록 첫 카드가 내려갔다(조건 넷이면 두 줄). 실서비스 4/4 가 검색창 밑 한 줄에 필터 버튼 + 정렬 ▾ + 칩이다.
 * 한 줄이라 머리 높이가 조건 수와 상관없다 — 첫 카드 자리가 늘 같다.
 *
 * - 필터 칩: 꺼짐 모양 + 슬라이더 아이콘. 켠 조건이 있으면 켜짐 모양 + '필터 3' — 같은 글자 줄의 숫자(흰 원 배지·채움·그림자 없음).
 * - 정렬 칩: 늘 꺼짐 모양이다 — 정렬은 "켜짐" 이 없다(어느 순서든 하나는 서 있다). 눌러서 정렬 시트.
 * - 켠 조건: 켜짐 모양 + ✕, 누르면 그것만 끈다(접근 이름 '… 조건 끄기' — 칩 이름 뒤 같은 말이 두 번 읽히지 않게 `toggle={false}`).
 * - 초기화: 줄 끝 글자 버튼. **이 줄에 보이는 것만** 푼다 — 권역·조건(22 A·B review c). 검색어는 검색칸이 제 ✕ 로 지우고, 정렬은 그대로다.
 *   '실내 자리 필요' 는 필터가 아니라 몸무게 같은 설정(앱 전체 판정 입력)이라 끄지 않는다(R-2) — 그 칩의 ✕ 로만. 그래서 그것만 켜져 있으면 초기화가 서지 않는다.
 *   md 부터의 개수 줄 지우기 링크(`resetLabel`, 14 W261019.11f)는 검색어까지 지우는 그대로다 — 그 자리엔 칩 줄도 검색칸 ✕ 옆자리도 없다.
 *
 * 줄은 44px 다 — 칩은 36px 로 보이고 `before:` 로 44px 를 누르는데 가로 스크롤 상자는 세로도 잘라서(`SCROLL_ROW_CLASS`).
 */
export function PlacesPageChipRow({
  activeFilterCount,
  chips,
  sortLabel,
  isFilterOpen,
  onOpenFilters,
  isSortOpen,
  onOpenSort,
  showReset,
  onReset,
  className,
}: TPlacesPageChipRowProps) {
  const rowRef = useRef<HTMLDivElement>(null);

  return (
    <div ref={rowRef} className={cx(SCROLL_ROW_CLASS, className)} role="group" aria-label="필터와 정렬">
      <FilterChip
        pressed={activeFilterCount > 0}
        toggle={false}
        iconLeading={Sliders02}
        aria-haspopup="dialog"
        aria-expanded={isFilterOpen}
        data-ev="places.filterOpen"
        onClick={onOpenFilters}
      >
        {activeFilterCount > 0 ? `필터 ${activeFilterCount}` : '필터'}
      </FilterChip>

      <FilterChip
        pressed={false}
        toggle={false}
        iconTrailing={SortChevron}
        aria-haspopup="dialog"
        aria-expanded={isSortOpen}
        aria-label={`정렬: ${sortLabel}`}
        data-ev="places.sortOpen"
        onClick={onOpenSort}
      >
        {sortLabel}
      </FilterChip>

      {chips.map((chip) => (
        <FilterChip
          key={chip.key}
          pressed
          toggle={false}
          iconTrailing={XClose}
          aria-label={`${chip.label} 조건 끄기`}
          onClick={chip.onRemove}
        >
          {chip.label}
        </FilterChip>
      ))}

      {showReset && (
        <button
          type="button"
          aria-label="필터 초기화"
          data-ev="places.reset"
          onClick={() => {
            onReset();
            // 줄을 처음으로 — 끝(초기화 자리)까지 밀어 둔 채 칩이 줄면 '필터' 가 왼쪽 끝에 잘린 채 남았다(22 A·B review R-9).
            if (rowRef.current) rowRef.current.scrollLeft = 0;
          }}
          className="inline-flex h-11 shrink-0 items-center gap-1 px-1 text-sm text-tertiary hover:text-secondary active:text-secondary"
        >
          <RefreshCw01 aria-hidden="true" className="size-3.5 text-fg-quaternary" />
          초기화
        </button>
      )}
    </div>
  );
}
