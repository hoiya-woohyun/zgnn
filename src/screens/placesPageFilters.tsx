import { Button } from '../components/base/button';
import { Select } from '../components/base/select';
import { DIRECTIONS, DIRECTION_LABEL } from '../lib/places';
import { PET_FILTERS, type TPetFilterKey, type TPriceSort } from '../lib/placeFilters';
import type { TDirection, TPlaceType } from '../types';

type TPlacesPageFiltersProps = {
  type: TPlaceType;
  directions: TDirection[];
  petKeys: TPetFilterKey[];
  sort: TPriceSort;
  onToggleDirection: (direction: TDirection) => void;
  onTogglePetKey: (key: TPetFilterKey) => void;
  onChangeSort: (sort: TPriceSort) => void;
};

const SORT_OPTIONS: { id: TPriceSort; label: string }[] = [
  { id: 'none', label: '기본순' },
  { id: 'asc', label: '가격 낮은순' },
  { id: 'desc', label: '가격 높은순' },
];

export function PlacesPageFilters({
  type,
  directions,
  petKeys,
  sort,
  onToggleDirection,
  onTogglePetKey,
  onChangeSort,
}: TPlacesPageFiltersProps) {
  /*
   * 가로 스크롤 줄 오른쪽 끝을 살짝 흐려서 "더 있다" 는 신호를 준다.
   * 마스크가 마지막 칩까지 가리면 안 되므로, 마스크가 시작되는 지점보다
   * 넓게 오른쪽 padding 을 잡아 마지막 칩은 항상 마스크 밖(완전 불투명)에 있게 한다.
   */
  const scrollRowClassName =
    'no-scrollbar flex items-center gap-2 overflow-x-auto px-4 pr-8 md:px-6 md:pr-10 ' +
    '[mask-image:linear-gradient(to_right,black_calc(100%-1.5rem),transparent)] ' +
    '[-webkit-mask-image:linear-gradient(to_right,black_calc(100%-1.5rem),transparent)]';

  return (
    <div className="space-y-2 pb-3">
      <div className={scrollRowClassName} role="group" aria-label="방향">
        {DIRECTIONS.map((direction) => {
          const active = directions.includes(direction);
          return (
            <Button
              key={direction}
              size="sm"
              color={active ? 'primary' : 'secondary'}
              aria-pressed={active}
              className="h-11 shrink-0"
              onClick={() => onToggleDirection(direction)}
            >
              {DIRECTION_LABEL[direction]}
            </Button>
          );
        })}
      </div>

      {/*
        가격 정렬은 조건 칩이 아니라서 가로 스크롤 줄에 묶이면 첫 화면 폭에서
        스크롤해야만 보였다(P1). 조건 칩 줄과 분리한 자기 줄로 올려
        스크롤 없이 바로 보이게 한다.
      */}
      {type === 'stay' && (
        <div className="flex justify-end px-4 md:px-6">
          <Select
            aria-label="숙소 가격 정렬"
            size="sm"
            selectedKey={sort}
            onSelectionChange={(key) => {
              if (key) onChangeSort(key as TPriceSort);
            }}
            className="w-36"
          >
            {SORT_OPTIONS.map((option) => (
              <Select.Item key={option.id} id={option.id}>
                {option.label}
              </Select.Item>
            ))}
          </Select>
        </div>
      )}

      <div className={scrollRowClassName} role="group" aria-label="반려동물 조건">
        {PET_FILTERS[type].map((filter) => {
          const active = petKeys.includes(filter.key);
          return (
            <Button
              key={filter.key}
              size="sm"
              color={active ? 'primary' : 'secondary'}
              aria-pressed={active}
              className="h-11 shrink-0"
              onClick={() => onTogglePetKey(filter.key)}
            >
              {filter.label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
