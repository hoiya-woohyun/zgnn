import type { TFiltersVariant } from './placesPageFilters';
import { FilterChip } from '../components/filterChip';
import type { TPlaceType } from '../types';

/*
 * 켜진 필터의 표시는 앱 전체에서 한 가지 규칙을 따른다: **지도 오버레이 위의 컨트롤만**
 * 진한 브랜드 면(bg-brand-solid + 흰 글씨)을 쓰고, 그 밖의 선택 상태는 전부 연한 워시다.
 * 그 워시 모양은 `FilterChip` 하나가 갖는다(08 T4.2) — 이 토글만 워시이고 옆 조건 칩은 진한
 * 면이던 어긋남(D6)을 칩 컴포넌트를 하나로 모아 닫았다.
 */

type TPlacesPageEligibilityTogglesProps = {
  /** `bar`: 목록 위 고정 영역. `sheet`: 모바일 필터 시트 안(이름표를 달고 다른 조건과 같은 간격). */
  variant: TFiltersVariant;
  type: TPlaceType;
  hideHard: boolean;
  onToggleHideHard: () => void;
  needsIndoor: boolean;
  onToggleNeedsIndoor: () => void;
};

/**
 * 판정 관련 토글 두 개. 우리 강아지 프로필이 있을 때만 렌더된다(placesPage.tsx 가 호출을
 * `dog` 로 감싼다) — 프로필이 없으면 "이용하기 어려워요"(hard)라는 개념 자체가 없고, 이 토글이 보이는 것만으로도
 * v0 화면과 달라지기 때문이다.
 *
 * "실내 자리 필요"는 식당·카페에서만 보인다. 숙소는 판정 규칙에 실내외 구분이 없다.
 */
export function PlacesPageEligibilityToggles({
  variant,
  type,
  hideHard,
  onToggleHideHard,
  needsIndoor,
  onToggleNeedsIndoor,
}: TPlacesPageEligibilityTogglesProps) {
  const buttons = (
    <>
      <FilterChip pressed={hideHard} onClick={onToggleHideHard}>
        어려운 곳 숨기기
      </FilterChip>
      {type !== 'stay' && (
        <FilterChip pressed={needsIndoor} onClick={onToggleNeedsIndoor}>
          실내 자리 필요
        </FilterChip>
      )}
    </>
  );

  if (variant === 'sheet') {
    return (
      <section role="group" aria-label="우리 강아지 기준">
        <h3 className="text-sm font-semibold text-secondary">우리 강아지 기준</h3>
        <div className="mt-2 flex flex-wrap gap-2">{buttons}</div>
      </section>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 px-4 md:px-6" role="group" aria-label="우리 강아지 기준">
      {buttons}
    </div>
  );
}
