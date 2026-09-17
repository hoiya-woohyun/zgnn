import { useState } from 'react';
import { FilterLines } from '@untitledui/icons';
import { PlacesPageEligibilityToggles } from './placesPageEligibilityToggles';
import { PlacesPageFilters } from './placesPageFilters';
import { BottomSheet } from '../components/base/bottom-sheet';
import { Button } from '../components/base/button';
import { cx } from '../utils/cx';
import type { TPetFilterKey, TPriceSort } from '../lib/placeFilters';
import type { TDirection, TPlaceType } from '../types';

type TPlacesPageFilterSheetProps = {
  type: TPlaceType;
  town: string | null;
  directions: TDirection[];
  petKeys: TPetFilterKey[];
  sort: TPriceSort;
  onSelectTown: (town: string | null) => void;
  onToggleDirection: (direction: TDirection) => void;
  onTogglePetKey: (key: TPetFilterKey) => void;
  onChangeSort: (sort: TPriceSort) => void;
  /** 우리 강아지 기준 토글은 프로필이 있을 때만 있다. 없으면 이 값이 null 이다. */
  eligibility: {
    hideHard: boolean;
    onToggleHideHard: () => void;
    needsIndoor: boolean;
    onToggleNeedsIndoor: () => void;
  } | null;
  /** 켜져 있는 필터 개수. 시트를 닫아 둔 채로도 필터가 걸려 있음을 알려야 한다. */
  activeCount: number;
  /** 시트 안 필터만 푼다(검색어는 그대로). 누르면 시트도 함께 닫힌다. */
  onReset: () => void;
};

/**
 * 모바일 필터 시트.
 *
 * 조건이 다섯 줄(읍면·방향·정렬·반려동물·판정)이라 고정 영역이 첫 화면의 절반을 먹고
 * 정작 목록은 두어 장만 보였다. 모바일에서는 그 다섯 줄을 이 시트로 접고 버튼 하나만 남긴다.
 * 데스크톱은 세로가 넉넉해 접을 이유가 없으므로 지금처럼 펼쳐 둔다(placesPage 가 가른다).
 *
 * "적용" 버튼을 두지 않고 누르는 즉시 반영한다 — 읍면은 이미 스토어에 바로 쓰이고
 * 종류를 바꾸면 조건이 통째로 리셋되는 구조라(placesPage 의 `key={type}`), 초안 상태를
 * 하나 더 끼우면 그 두 가지가 서로 어긋난다. 뒤에서 목록이 같이 움직이는 편이
 * 조건을 하나씩 풀어 보기에도 낫다.
 */
export function PlacesPageFilterSheet({
  type,
  town,
  directions,
  petKeys,
  sort,
  onSelectTown,
  onToggleDirection,
  onTogglePetKey,
  onChangeSort,
  eligibility,
  activeCount,
  onReset,
}: TPlacesPageFilterSheetProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button
        size="lg"
        color={activeCount > 0 ? 'primary' : 'secondary'}
        iconLeading={FilterLines}
        className="h-11 shrink-0"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(true)}
      >
        필터
        {activeCount > 0 && (
          <span
            className={cx(
              'ml-0.5 min-w-5 rounded-full px-1 text-center text-xs leading-5 font-bold',
              'bg-primary text-brand-secondary',
            )}
          >
            {activeCount}
          </span>
        )}
      </Button>

      <BottomSheet isOpen={isOpen} onOpenChange={setIsOpen} label="필터 고르기">
        {/* 읍면 칩이 많아 시트가 화면보다 길어질 수 있다. 시트 안에서만 스크롤시킨다. */}
        <div className="max-h-[70dvh] overflow-y-auto pt-2 pr-10">
          <h2 className="text-md font-bold text-primary">필터</h2>

          <div className="mt-4 space-y-5">
            <PlacesPageFilters
              variant="sheet"
              type={type}
              town={town}
              directions={directions}
              petKeys={petKeys}
              sort={sort}
              onSelectTown={onSelectTown}
              onToggleDirection={onToggleDirection}
              onTogglePetKey={onTogglePetKey}
              onChangeSort={onChangeSort}
            />

            {eligibility && (
              <PlacesPageEligibilityToggles
                variant="sheet"
                type={type}
                hideHard={eligibility.hideHard}
                onToggleHideHard={eligibility.onToggleHideHard}
                needsIndoor={eligibility.needsIndoor}
                onToggleNeedsIndoor={eligibility.onToggleNeedsIndoor}
              />
            )}
          </div>
        </div>

        {/*
          누르면 시트를 함께 닫는다. 닫지 않으면 조건이 0이 되면서 이 버튼이 손가락 밑에서
          사라지고, 시트만 그대로 남아 아무 일도 안 일어난 것처럼 보인다.
        */}
        {activeCount > 0 && (
          <div className="mt-4 border-t border-secondary pt-3">
            <Button
              color="link-color"
              size="md"
              className="min-h-11"
              onClick={() => {
                onReset();
                setIsOpen(false);
              }}
            >
              필터 모두 지우기
            </Button>
          </div>
        )}
      </BottomSheet>
    </>
  );
}
