import type { ReactNode } from 'react';
import { Select } from '../components/base/select';
import { FilterChip } from '../components/filterChip';
import { areaTownsLabel, type TAreaId } from '../lib/areaGroups';
import { DIRECTIONS, DIRECTION_LABEL, topTowns } from '../lib/places';
import { envFiltersWithData, PET_FILTERS, townFilterLabel, type TPetFilterKey, type TPlaceSort } from '../lib/placeFilters';
import { placesPageSortLabel, placesPageSortOptions } from '../lib/placesPageFilter';
import { placesOfType } from '../lib/places';
import type { TDirection, TPlaceType } from '../types';
import { cx } from '../utils/cx';

/**
 * 같은 조건을 두 자리에서 보여준다.
 * - `bar`: 목록 위 고정 영역. 줄마다 가로 스크롤 — 데스크톱처럼 세로가 넉넉할 때.
 * - `sheet`: 모바일 필터 시트 안. 이름표를 달고 줄바꿈으로 펼친다 — 가로 스크롤은
 *   숨은 칩을 만들지만, 시트는 세로로 얼마든지 늘어날 수 있어 그럴 이유가 없다.
 */
export type TFiltersVariant = 'bar' | 'sheet';

/**
 * 정렬은 펼친 판(bar)만 받는다 — 시트엔 정렬이 없다(14 W261019.13, 모바일은 목록 위 정렬 줄). variant 로 타입을 갈라
 * 시트는 쓰지 않는 정렬 값을 넘길 수 없고, 펼친 판은 빠뜨리면 tsc 가 막는다(14 W261019.13c) — optional 로 두면 md 셀렉트가 조용히 죽는다.
 */
type TPlacesPageFiltersProps = {
  type: TPlaceType;
  town: string | null;
  /** 읍면 칩 옆 수(`townChipCounts`) — 읍면 선택만 뺀 지금 조건으로 센 패싯. 없는 읍면은 0. */
  townCounts: ReadonlyMap<string, number>;
  /** 홈 동네 카드가 건 권역. 시트에선 읍면 묶음 밑 한 줄로 말한다(14 W261010.33f). */
  area: TAreaId | null;
  directions: TDirection[];
  petKeys: TPetFilterKey[];
  onSelectTown: (town: string | null) => void;
  onToggleDirection: (direction: TDirection) => void;
  onTogglePetKey: (key: TPetFilterKey) => void;
} & (
  | {
      variant: 'bar';
      sort: TPlaceSort;
      onChangeSort: (sort: TPlaceSort) => void;
      /** 정렬 이름(`placesPageSortLabel`)에 — 기본 순서의 이름이 강아지 유무로 갈린다. */
      hasDog: boolean;
      /** '가까운 순' 의 기준 이름(들어온 장소·검색어의 관광지). */
      nearFrom?: string;
    }
  | { variant: 'sheet' }
);

/** 숙소에서 고를 수 있는 환경 조건 — 데이터는 빌드 때 고정이라 한 번만 센다. */
const STAY_ENV_FILTERS = envFiltersWithData(placesOfType('stay'));

/*
 * 가로 스크롤 줄 오른쪽 끝을 살짝 흐려서 "더 있다" 는 신호를 준다.
 * 마스크가 마지막 칩까지 가리면 안 되므로, 마스크가 시작되는 지점보다
 * 넓게 오른쪽 padding 을 잡아 마지막 칩은 항상 마스크 밖(완전 불투명)에 있게 한다.
 *
 * lg 부터는 줄을 바꾼다(07 U10) — 넓은 화면에서 칩을 옆으로 밀어 찾게 할 이유가 없다. md 는 사이드바를 빼면
 * 본문이 512px 이라 읍면 10개가 세 줄이 되고, 이 줄은 sticky 머리 안이라 그만큼 목록을 가린다 — 그래서 md 는 스크롤 그대로.
 */
export const SCROLL_ROW_CLASS =
  'no-scrollbar flex items-center gap-2 overflow-x-auto px-4 pr-8 md:px-6 md:pr-10 ' +
  '[mask-image:linear-gradient(to_right,black_calc(100%-1.5rem),transparent)] ' +
  '[-webkit-mask-image:linear-gradient(to_right,black_calc(100%-1.5rem),transparent)] ' +
  'lg:flex-wrap lg:overflow-x-visible lg:pr-6 lg:[mask-image:none] lg:[-webkit-mask-image:none]';

/**
 * 조건 한 묶음. bar 에서는 이름표 없는 스크롤 줄, sheet 에서는 이름표를 단 줄바꿈 묶음.
 * `hint` 는 sheet 에서 이름표 밑 한 줄 — 칩이 **무엇을 기준으로** 거르는지 말한다(14 W261007.7).
 */
function FilterGroup({
  variant,
  label,
  hint,
  className,
  children,
}: {
  variant: TFiltersVariant;
  label: string;
  hint?: string;
  /** bar 줄에만 — 옆에 다른 것(정렬)을 나란히 둘 때. */
  className?: string;
  children: ReactNode;
}) {
  if (variant === 'bar') {
    return (
      <div className={cx(SCROLL_ROW_CLASS, className)} role="group" aria-label={label}>
        {children}
      </div>
    );
  }

  return (
    <section role="group" aria-label={label}>
      <h3 className="text-sm font-semibold text-secondary">{label}</h3>
      {hint && <p className="mt-0.5 text-sm text-tertiary">{hint}</p>}
      <div className="mt-2 flex flex-wrap gap-2">{children}</div>
    </section>
  );
}

export function PlacesPageFilters(props: TPlacesPageFiltersProps) {
  // 정렬 칸은 variant 를 좁힌 뒤에만 읽는다(아래 bar 갈래) — 시트 쪽 타입엔 그 칸이 없다.
  const { variant, type, town, townCounts, area, directions, petKeys, onSelectTown, onToggleDirection, onTogglePetKey } = props;
  // 이 종류에 실제로 장소가 있는 읍면만 보여준다 — 0곳인 읍면 칩을 눌러 빈 목록을 만들 이유가 없다.
  // 단 **이미 골라 둔 읍면**이 이 종류에 없으면(숙소에서 고른 '서귀포' → 식당) 맨 앞에 `0` 칩을 켜진 채로 끼운다 —
  // 안 그러면 버튼은 "필터 1" 인데 시트에 끌 칩이 없다(12 U1.6). 읍면은 종류를 넘어 유지되는 값이다.
  // 칩의 **줄과 순서**는 종류 전체로 정하고 옆 수만 지금 조건을 따른다(14 W261010.33e) — 수로 다시 줄 세우거나 0 칩을 빼면
  // 다른 조건을 누를 때마다 칩이 손가락 밑에서 자리를 바꾼다. 0 이 된 칩은 '어려운 곳 숨기기 0' 처럼 한 단 옅은 토큰으로 둔다.
  const typeTowns = topTowns(type, Number.MAX_SAFE_INTEGER).map((entry) => entry.town);
  const towns = town !== null && !typeTowns.includes(town) ? [town, ...typeTowns] : typeTowns;
  const directionGroup = (className?: string) => (
    <FilterGroup variant={variant} label="방향" className={className}>
      {DIRECTIONS.map((direction) => (
        <FilterChip key={direction} pressed={directions.includes(direction)} onClick={() => onToggleDirection(direction)}>
          {DIRECTION_LABEL[direction]}
        </FilterChip>
      ))}
    </FilterGroup>
  );

  return (
    <div className={variant === 'bar' ? 'space-y-2' : 'space-y-5'}>
      {/*
        읍면은 검색어·타입 탭을 넘어 유지되는 유일한 조건이라(스토어 `town`) 맨 위에 둔다
        (2026-09-15 리뷰 P1 — "하나만 고치면: 읍면 한 번 고르면 숙소·식당·카페·지도 모두 유지").
        방향·반려동물 조건은 종류를 바꾸면 초기화되는 화면 로컬 상태다.
      */}
      {/*
        권역(홈 동네 카드)은 시트에 고르는 자리가 없어 시트 버튼 숫자에 안 들고 '모두 지우기' 도 안 푼다(19 T3 — 검색어와 같다).
        그런데 칩 이름이 읍면 목록("서부(애월·한림·한경)")이라 지운 뒤 남은 그 칩이 "안 지워진 읍면 필터" 로 읽혔다(14 W261010.33f · business-32).
        읍면을 고르면 권역을 대신해서(W261010.33i — 권역 밖 칩도 0 이 아니라 그 읍면의 수다) 그 일과 권역을 푸는 자리를 읍면 묶음에서 말한다. 펼친 판(bar)엔 설명 줄이 없다 — 지우기 버튼도 없다.
      */}
      <FilterGroup
        variant={variant}
        label="읍면"
        hint={area ? `읍면을 고르면 ${areaTownsLabel(area)} 대신 그 읍면만 봐요. 권역은 목록 위 칩에서 따로 풀어요.` : undefined}
      >
        {towns.map((candidate) => {
          const active = town === candidate;
          const count = townCounts.get(candidate) ?? 0;
          return (
            <FilterChip
              key={candidate}
              pressed={active}
              onClick={() => onSelectTown(active ? null : candidate)}
              className={cx(count === 0 && !active && 'border-secondary text-tertiary')}
            >
              {townFilterLabel(candidate)} {count}
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
      {props.variant === 'bar' ? (
        <div className="lg:flex lg:items-center">
          {directionGroup('lg:min-w-0 lg:flex-1')}
          <div className="mt-2 flex shrink-0 justify-end px-4 md:px-6 lg:mt-0 lg:pl-0">
            <SortSelect
              type={type}
              sort={props.sort}
              onChangeSort={props.onChangeSort}
              hasDog={props.hasDog}
              nearFrom={props.nearFrom}
            />
          </div>
        </div>
      ) : (
        /* 시트엔 정렬이 없다(14 W261019.13) — 모바일은 목록 위 정렬 줄 하나가 지금 순서를 말하고 바꾼다. 두 곳이면 "정렬이 두 군데" 였다(minji-09). */
        directionGroup()
      )}

      {/*
        이 칩들은 **원문에 적힌 것**으로 거른다 — 판정과 축이 다르다(14 W261007.7). 두 마리 프로필로 '2마리 이상' 을 켜면
        판정이 '갈 수 있어요' 인 숙소 4곳(마릿수가 원문에 없어 막지 않은 곳)이 빠져, 칩 이름만으로는 판정과 반대 말을 했다.
        이름표·설명이 축을 말한다. 판정을 바꾸는 쪽은 위의 '우리 강아지 기준'(실내 자리 필요)이다.
      */}
      <FilterGroup
        variant={variant}
        label="원문에 적힌 조건"
        hint="원문에 그렇게 적힌 곳만 남겨요. 적혀 있지 않으면 '갈 수 있어요' 인 곳도 빠져요."
      >
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
        <FilterGroup variant={variant} label="숙소 환경">
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
