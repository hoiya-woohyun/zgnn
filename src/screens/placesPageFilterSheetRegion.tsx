'use client';

import { useId } from 'react';
import { Radio as AriaRadio, RadioGroup as AriaRadioGroup } from 'react-aria-components';
import { FilterChip } from '../components/filterChip';
import { areaTownName, areaTownsLabel, type TAreaId } from '../lib/areaGroups';
import { DIRECTIONS, DIRECTION_LABEL } from '../lib/places';
import { placesPageTownGrid } from '../lib/placesPageTownGrid';
import { cx } from '../utils/cx';
import type { TDirection, TPlaceType } from '../types';

/** react-aria 라디오 값은 빈 문자열을 못 쓴다 — '전체'(읍면 없음, `null`)를 이 키로. */
const ALL_TOWNS_KEY = '__all__';

type TPlacesPageFilterSheetRegionProps = {
  type: TPlaceType;
  town: string | null;
  /** 홈 동네 카드가 건 권역 — 시트에 고르는 자리는 없고 한 줄이 말한다(14 W261010.33f). */
  area: TAreaId | null;
  directions: TDirection[];
  onSelectTown: (town: string | null) => void;
  /** 방향을 켜고 끈다 — 고른 읍면이 새 방향 밖이 되면 부르는 쪽이 읍면을 푼다(`placesPageTownInDirections`). */
  onToggleDirection: (direction: TDirection) => void;
};

/**
 * 필터 시트의 '지역'(22 D-7) — 윗단 방향 칩(여럿), 아랫단 읍면 3열 라디오(하나, 첫 칸 '전체').
 *
 * 전엔 '읍면'(개수순 칩, 하나) · '방향'(칩, 여럿) 두 묶음이 따로 서서 둘이 AND 라는 것이 안 읽혔고 '동쪽 + 애월' 이 0곳으로 열려 있었다.
 * 한 섹션으로 묶어 방향이 읍면 칸을 거르게 한다 — 방향을 고르면 그 방향의 읍면 칸만 남고, 고른 읍면이 밖이 되면 풀린다(부르는 쪽).
 * 칸은 지도 차례로 고정이다(`placesPageTownGrid`) — 개수순이면 종류마다 칸 자리가 바뀐다. 칸 이름은 짧은 이름(권역 줄과 같은 '애월'·'제주 시내').
 * 고르는 즉시 반영된다(라디오 화살표도) — 시트는 열린 채 결과 버튼 수가 따라 움직인다.
 */
export function PlacesPageFilterSheetRegion({ type, town, area, directions, onSelectTown, onToggleDirection }: TPlacesPageFilterSheetRegionProps) {
  const towns = placesPageTownGrid({ type, directions, town });
  const titleId = useId();

  return (
    <section aria-labelledby={titleId}>
      <h3 id={titleId} className="text-md font-bold text-primary">
        지역
      </h3>
      {/*
        권역(홈 동네 카드)은 시트에 고르는 자리가 없어 시트 버튼 숫자에 안 들고 초기화도 안 푼다(19 T3). 그 칩 이름이 읍면 목록이라
        "안 지워진 읍면 필터" 로 읽혀(14 W261010.33f), 읍면을 고르면 권역을 대신한다는 것과 푸는 자리를 여기서 말한다.
      */}
      {area && (
        <p className="mt-1 text-sm text-tertiary">
          읍면을 고르면 {areaTownsLabel(area)} 대신 그 읍면만 봐요. 권역은 검색칸 밑 칩에서 따로 풀어요.
        </p>
      )}

      {/* 줄 간격 10px — 칩의 44px 히트(보이는 36 + 위아래 4)가 줄 사이에서 맞닿지 않게. 8px 면 경계가 반 픽셀 차로 다음 줄 칩에 넘어갔다(320 실측). */}
      <div className="mt-3 flex flex-wrap gap-x-2 gap-y-2.5" role="group" aria-label="방향">
        {DIRECTIONS.map((direction) => (
          <FilterChip key={direction} pressed={directions.includes(direction)} onClick={() => onToggleDirection(direction)}>
            {DIRECTION_LABEL[direction]}
          </FilterChip>
        ))}
      </div>

      <AriaRadioGroup
        aria-label="읍면"
        value={town ?? ALL_TOWNS_KEY}
        onChange={(next) => onSelectTown(next === ALL_TOWNS_KEY ? null : next)}
        className="mt-3 grid grid-cols-3 gap-x-1"
      >
        {[ALL_TOWNS_KEY, ...towns].map((candidate) => (
          <AriaRadio
            key={candidate}
            value={candidate}
            className={({ isSelected, isFocusVisible }) =>
              cx(
                'flex h-11 min-w-0 cursor-pointer items-center gap-2 rounded-lg text-sm select-none',
                isSelected ? 'text-primary' : 'text-secondary',
                isFocusVisible && 'outline-2 outline-offset-2 outline-focus-ring',
              )
            }
          >
            {({ isSelected }) => (
              <>
                <span
                  aria-hidden="true"
                  className={cx(
                    'grid size-4.5 shrink-0 place-items-center rounded-full bg-primary ring-1 ring-inset',
                    // 꺼진 원은 테두리가 곧 그 칸이라 3:1 이 걸린다 — `ring-primary`(크림 위 1.45)를 `field-edge` 가 `border-field` 로 돌린다
                    // (ADR-003 v16, 체크박스와 같은 값·같은 장치 — 테두리 토큰 중엔 그 값이 없다).
                    isSelected ? 'ring-brand' : 'field-edge ring-primary',
                  )}
                >
                  {isSelected && <span className="size-2 rounded-full bg-brand-solid" />}
                </span>
                <span className="truncate">{candidate === ALL_TOWNS_KEY ? '전체' : areaTownName(candidate)}</span>
              </>
            )}
          </AriaRadio>
        ))}
      </AriaRadioGroup>
    </section>
  );
}
