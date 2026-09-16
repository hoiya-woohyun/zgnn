import { Button } from '../components/base/button';
import type { TPlaceType } from '../types';

type TPlacesPageEligibilityTogglesProps = {
  type: TPlaceType;
  hideHard: boolean;
  onToggleHideHard: () => void;
  needsIndoor: boolean;
  onToggleNeedsIndoor: () => void;
};

/**
 * 판정 관련 토글 두 개. 우리 강아지 프로필이 있을 때만 렌더된다(placesPage.tsx 가 호출을
 * `dog` 로 감싼다) — 프로필이 없으면 "어려움"이라는 개념 자체가 없고, 이 토글이 보이는 것만으로도
 * v0 화면과 달라지기 때문이다.
 *
 * "실내 자리 필요"는 식당·카페에서만 보인다. 숙소는 판정 규칙에 실내외 구분이 없다.
 */
export function PlacesPageEligibilityToggles({
  type,
  hideHard,
  onToggleHideHard,
  needsIndoor,
  onToggleNeedsIndoor,
}: TPlacesPageEligibilityTogglesProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 px-4 md:px-6" role="group" aria-label="판정 조건">
      <Button
        size="sm"
        color={hideHard ? 'primary' : 'secondary'}
        aria-pressed={hideHard}
        className="h-11"
        onClick={onToggleHideHard}
      >
        어려움 숨기기
      </Button>
      {type !== 'stay' && (
        <Button
          size="sm"
          color={needsIndoor ? 'primary' : 'secondary'}
          aria-pressed={needsIndoor}
          className="h-11"
          onClick={onToggleNeedsIndoor}
        >
          실내 자리 필요
        </Button>
      )}
    </div>
  );
}
