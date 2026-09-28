import type { TFiltersVariant } from './placesPageFilters';
import { cx } from '../utils/cx';
import type { TPlaceType } from '../types';

/**
 * 켜진 필터의 표시는 앱 전체에서 한 가지 규칙을 따른다: **지도 오버레이 위의 컨트롤만**
 * 진한 브랜드 면(bg-brand-solid + 흰 글씨)을 쓰고, 그 밖의 선택 상태는 전부 연한 워시
 * (bg-brand-primary + 진한 브랜드 글씨)다. 지도 칩이 진한 것은 지도라는 복잡한 바탕 위에서
 * 읽혀야 하기 때문이고, 일반 화면에는 그 이유가 없다.
 *
 * 이 두 토글은 원래 진한 면이었다 — 같은 역할인 placesPage 의 타입 탭·seasonChips 는 워시라,
 * 한 화면 안에서 "켜짐" 이 두 가지 언어로 그려지고 있었다.
 * 공용 버튼 컴포넌트를 벗었으므로 그것이 주던 focus-visible 링을 여기서 직접 갖춘다.
 */
const chipClass = (active: boolean) =>
  cx(
    'h-11 cursor-pointer rounded-xl px-4 text-sm font-semibold transition-colors',
    'focus-visible:outline-2 focus-visible:outline-offset-2 outline-focus-ring',
    active ? 'bg-brand-primary text-brand-secondary' : 'bg-tertiary text-secondary hover:bg-quaternary',
  );

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
      <button type="button" aria-pressed={hideHard} className={chipClass(hideHard)} onClick={onToggleHideHard}>
        어려운 곳 숨기기
      </button>
      {type !== 'stay' && (
        <button type="button" aria-pressed={needsIndoor} className={chipClass(needsIndoor)} onClick={onToggleNeedsIndoor}>
          실내 자리 필요
        </button>
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
