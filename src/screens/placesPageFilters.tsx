import type { ReactNode } from 'react';
import { Select } from '../components/base/select';
import { FilterChip } from '../components/filterChip';
import { DIRECTIONS, DIRECTION_LABEL, topTowns } from '../lib/places';
import { envFiltersWithData, PET_FILTERS, townFilterLabel, type TPetFilterKey, type TPlaceSort } from '../lib/placeFilters';
import { placesPageSortLabel, placesPageSortOptions } from '../lib/placesPageFilter';
import { placesOfType } from '../lib/places';
import type { TDirection, TPlaceType } from '../types';
import { cx } from '../utils/cx';

/**
 * md 부터 머리에 펼쳐 두는 조건 판(줄마다 가로 스크롤, lg 부터 줄바꿈). 모바일은 같은 조건이 필터 시트(`placesPageFilterSheet`)에 접히고
 * 시트는 섹션마다 제 모양(세그먼트 · 지역 칸 · 체크박스, 22 D-6~D-9)이라 이 판과 부품을 나눠 쓰지 않는다 — 판의 다시 짜기는 22 D-10.
 * 정렬 셀렉트도 이 판만 갖는다(모바일은 칩 줄의 '정렬 ▾', 22 D-3) — 필수 prop 이라 빠뜨리면 tsc 가 막는다(14 W261019.13c).
 */
type TPlacesPageFiltersProps = {
  type: TPlaceType;
  town: string | null;
  directions: TDirection[];
  petKeys: TPetFilterKey[];
  onSelectTown: (town: string | null) => void;
  onToggleDirection: (direction: TDirection) => void;
  onTogglePetKey: (key: TPetFilterKey) => void;
  sort: TPlaceSort;
  onChangeSort: (sort: TPlaceSort) => void;
  /** 정렬 이름(`placesPageSortLabel`)에 — 기본 순서의 이름이 강아지 유무로 갈린다. */
  hasDog: boolean;
  /** '가까운 순' 의 기준 이름(들어온 장소·검색어의 관광지). */
  nearFrom?: string;
};

/** 숙소에서 고를 수 있는 환경 조건 — 데이터는 빌드 때 고정이라 한 번만 센다. */
const STAY_ENV_FILTERS = envFiltersWithData(placesOfType('stay'));

/*
 * 가로 스크롤 줄 오른쪽 끝을 살짝 흐려서 "더 있다" 는 신호를 준다.
 * 마스크가 마지막 칩까지 가리면 안 되므로, 마스크가 시작되는 지점보다
 * 넓게 오른쪽 padding 을 잡아 마지막 칩은 항상 마스크 밖(완전 불투명)에 있게 한다.
 *
 * 줄 높이는 44px(`min-h-11`) — 칩은 36px 로 보이고 위아래 4px 를 `before:` 로 넓혀 누르는데(22 D-5), `overflow-x-auto` 는 세로도 잘라서
 * 줄이 칩 높이면 그 4px 가 안 눌린다.
 *
 * lg 부터는 줄을 바꾼다(07 U10) — 넓은 화면에서 칩을 옆으로 밀어 찾게 할 이유가 없다. md 는 사이드바를 빼면
 * 본문이 512px 이라 읍면 10개가 세 줄이 되고, 이 줄은 sticky 머리 안이라 그만큼 목록을 가린다 — 그래서 md 는 스크롤 그대로.
 */
export const SCROLL_ROW_CLASS =
  'no-scrollbar flex min-h-11 items-center gap-2 overflow-x-auto px-4 pr-8 md:px-6 md:pr-10 ' +
  '[mask-image:linear-gradient(to_right,black_calc(100%-1.5rem),transparent)] ' +
  '[-webkit-mask-image:linear-gradient(to_right,black_calc(100%-1.5rem),transparent)] ' +
  'lg:flex-wrap lg:overflow-x-visible lg:pr-6 lg:[mask-image:none] lg:[-webkit-mask-image:none]';

/** 조건 한 묶음 — 이름표 없는 스크롤 줄. 이름은 접근 이름으로만. */
function FilterGroup({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div className={cx(SCROLL_ROW_CLASS, className)} role="group" aria-label={label}>
      {children}
    </div>
  );
}

export function PlacesPageFilters({
  type,
  town,
  directions,
  petKeys,
  onSelectTown,
  onToggleDirection,
  onTogglePetKey,
  sort,
  onChangeSort,
  hasDog,
  nearFrom,
}: TPlacesPageFiltersProps) {
  // 이 종류에 실제로 장소가 있는 읍면만 보여준다 — 0곳인 읍면 칩을 눌러 빈 목록을 만들 이유가 없다.
  // 단 **이미 골라 둔 읍면**이 이 종류에 없으면(숙소에서 고른 '서귀포' → 식당) 맨 앞에 `0` 칩을 켜진 채로 끼운다 —
  // 안 그러면 버튼은 "필터 1" 인데 판에 끌 칩이 없다(12 U1.6). 읍면은 종류를 넘어 유지되는 값이다.
  // 칩의 **줄과 순서**는 종류 전체로 정한다(14 W261010.33e) — 지금 조건으로 다시 줄 세우거나 빼면 다른 조건을 누를 때마다 칩이 손가락 밑에서
  // 자리를 바꾼다. 칩 옆 수는 없다(22 D-5) — 남는 곳 수는 목록 머리가 말한다.
  const typeTowns = topTowns(type, Number.MAX_SAFE_INTEGER).map((entry) => entry.town);
  const towns = town !== null && !typeTowns.includes(town) ? [town, ...typeTowns] : typeTowns;
  const directionGroup = (className?: string) => (
    <FilterGroup label="방향" className={className}>
      {DIRECTIONS.map((direction) => (
        <FilterChip key={direction} pressed={directions.includes(direction)} onClick={() => onToggleDirection(direction)}>
          {DIRECTION_LABEL[direction]}
        </FilterChip>
      ))}
    </FilterGroup>
  );

  return (
    <div className="space-y-2">
      {/*
        읍면은 검색어·타입 탭을 넘어 유지되는 유일한 조건이라(스토어 `town`) 맨 위에 둔다
        (2026-09-15 리뷰 P1 — "하나만 고치면: 읍면 한 번 고르면 숙소·식당·카페·지도 모두 유지").
        방향·반려동물 조건은 종류를 바꾸면 초기화되는 화면 로컬 상태다.
      */}
      {/* 권역(홈 동네 카드) 설명 줄은 시트에만 있다(14 W261010.33f) — 판엔 설명 줄이 없다. */}
      <FilterGroup label="읍면">
        {towns.map((candidate) => {
          const active = town === candidate;
          return (
            <FilterChip key={candidate} pressed={active} onClick={() => onSelectTown(active ? null : candidate)}>
              {townFilterLabel(candidate)}
            </FilterChip>
          );
        })}
      </FilterGroup>

      {/*
        가격 정렬은 조건 칩이 아니라서 가로 스크롤 줄에 묶이면 첫 화면 폭에서
        스크롤해야만 보였다(P1). 스크롤 줄 **밖**에 둔다 — 안에 넣으면 md 에서 밀려나거나 끝 마스크에 흐려진다.
        가까운 순(10 F7)이 생겨 정렬은 모든 종류에 선다 — 가격 둘만 숙소에 남는다.

        bar 는 lg 부터 방향 줄 오른쪽에 붙인다(14 W261013.10a). 셀렉트 하나가 47px 한 줄을 통째로 써서 펼친 판이 466px(숙소 522px)까지
        자랐고, 1280×800 에서 0곳 안내의 버튼이 접힘 아래로 밀렸다. 방향은 칩 다섯이라 lg 본문(768px)에서 자리가 남는다.
        md(본문 512px)는 나란히 두면 방향 칩이 스크롤로 밀려 제 줄 그대로.
      */}
      <div className="lg:flex lg:items-center">
        {directionGroup('lg:min-w-0 lg:flex-1')}
        <div className="mt-2 flex shrink-0 justify-end px-4 md:px-6 lg:mt-0 lg:pl-0">
          <SortSelect type={type} sort={sort} onChangeSort={onChangeSort} hasDog={hasDog} nearFrom={nearFrom} />
        </div>
      </div>

      {/*
        이 칩들은 **원문에 적힌 것**으로 거른다 — 판정과 축이 다르다(14 W261007.7). 두 마리 프로필로 '2마리 이상' 을 켜면
        판정이 '갈 수 있어요' 인 숙소 4곳(마릿수가 원문에 없어 막지 않은 곳)이 빠져, 칩 이름만으로는 판정과 반대 말을 했다.
        이름표·설명이 축을 말한다. 판정을 바꾸는 쪽은 위의 '우리 강아지 기준'(실내 자리 필요)이다.
      */}
      <FilterGroup label="원문에 적힌 조건">
        {PET_FILTERS[type].map((filter) => {
          const active = petKeys.includes(filter.key);
          return (
            <FilterChip
              key={filter.key}
              pressed={active}
              onClick={() => onTogglePetKey(filter.key)}
            >
              {filter.label}
            </FilterChip>
          );
        })}
      </FilterGroup>

      {/*
        숙소 환경(10 F6) — 반려동물 조건과 **다른 묶음**이다. 판정(갈 수 있나)이 아니라 선호라, 한 줄에 섞으면
        "대형견 OK" 와 "마당 있음" 이 같은 무게로 읽힌다. 데이터에 걸리는 곳이 있는 칩만 선다.
      */}
      {type === 'stay' && STAY_ENV_FILTERS.length > 0 && (
        <FilterGroup label="숙소 환경">
          {STAY_ENV_FILTERS.map((filter) => (
            <FilterChip key={filter.key} pressed={petKeys.includes(filter.key)} onClick={() => onTogglePetKey(filter.key)}>
              {filter.label}
            </FilterChip>
          ))}
        </FilterGroup>
      )}
    </div>
  );
}

function SortSelect({
  type,
  sort,
  onChangeSort,
  hasDog,
  nearFrom,
}: {
  type: TPlaceType;
  sort: TPlaceSort;
  onChangeSort: (sort: TPlaceSort) => void;
  hasDog: boolean;
  nearFrom?: string;
}) {
  // 이름이 기준을 말해 '기본순'(w-36)보다 길다 — "중문에서 가까운 순" 이 들어가는 폭. 더 긴 장소 이름은 셀렉트가 줄인다.
  return (
    <Select
      aria-label="정렬"
      size="sm"
      selectedKey={sort}
      onSelectionChange={(key) => {
        if (key) onChangeSort(key as TPlaceSort);
      }}
      className="w-48"
    >
      {placesPageSortOptions(type).map((id) => (
        <Select.Item key={id} id={id}>
          {placesPageSortLabel(id, { hasDog, nearFrom })}
        </Select.Item>
      ))}
    </Select>
  );
}
