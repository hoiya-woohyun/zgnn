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
  return (
    <div className="space-y-2 pb-3">
      <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 md:px-6" role="group" aria-label="방향">
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

      <div
        className="no-scrollbar flex items-center gap-2 overflow-x-auto px-4 md:px-6"
        role="group"
        aria-label="반려동물 조건"
      >
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

        {type === 'stay' && (
          <>
            <span className="h-6 w-px shrink-0 bg-secondary" aria-hidden="true" />
            <Select
              aria-label="숙소 가격 정렬"
              size="sm"
              selectedKey={sort}
              onSelectionChange={(key) => {
                if (key) onChangeSort(key as TPriceSort);
              }}
              className="w-36 shrink-0"
            >
              {SORT_OPTIONS.map((option) => (
                <Select.Item key={option.id} id={option.id}>
                  {option.label}
                </Select.Item>
              ))}
            </Select>
          </>
        )}
      </div>
    </div>
  );
}
