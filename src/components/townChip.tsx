import { TYPE_COLOR_DEEP, typeTint } from '../lib/places';
import type { TPlaceType } from '../types';

type TTownChipProps = {
  town: string;
  type: TPlaceType;
};

/** 읍면 칩. 타입 색을 옅게 깐 위에 그 타입의 진한 색 글씨를 올린다. */
export function TownChip({ town, type }: TTownChipProps) {
  return (
    <span
      className="rounded-full px-2 py-0.5 text-xs font-semibold"
      style={{ background: typeTint(type, 12), color: TYPE_COLOR_DEEP[type] }}
    >
      {town}
    </span>
  );
}
