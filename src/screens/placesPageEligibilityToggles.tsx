import { FilterChip } from '../components/filterChip';
import type { TPlaceType } from '../types';

/*
 * 켜진 필터의 표시는 앱 전체에서 한 가지 규칙을 따른다: **지도 오버레이 위의 컨트롤만**
 * 진한 브랜드 면(bg-brand-solid + 흰 글씨)을 쓰고, 그 밖의 선택 상태는 전부 연한 워시다.
 * 그 워시 모양은 `FilterChip` 하나가 갖는다(08 T4.2) — 이 토글만 워시이고 옆 조건 칩은 진한
 * 면이던 어긋남(D6)을 칩 컴포넌트를 하나로 모아 닫았다.
 */

type TPlacesPageEligibilityTogglesProps = {
  type: TPlaceType;
  /** '갈 수 있는 곳만'(14 W261013.14d) — 홈 동네 카드가 거는 것과 같은 스토어 값이라 카드로 들어오면 눌린 채로 보인다. */
  onlyReachable: boolean;
  onToggleOnlyReachable: () => void;
  hideHard: boolean;
  onToggleHideHard: () => void;
  needsIndoor: boolean;
  onToggleNeedsIndoor: () => void;
};

/**
 * 판정 관련 토글 — '갈 수 있는 곳만' · '어려운 곳 숨기기' · '실내 자리 필요'. **md 부터 펼친 판(bar)에서만** 쓴다 — 모바일 필터 시트는
 * 세 단계 세그먼트 + 실내 스위치(`placesPageFilterSheetDog`, 22 D-6)이고, 판은 데스크톱 판 회차(22 D-10)에서 같이 바꾼다.
 * 우리 강아지 프로필이 있을 때만 렌더된다(placesPage.tsx 가 호출을
 * `dog` 로 감싼다) — 프로필이 없으면 "이용하기 어려워요"(hard)라는 개념 자체가 없고, 이 토글이 보이는 것만으로도
 * v0 화면과 달라지기 때문이다.
 *
 * "실내 자리 필요"는 식당·카페에서만 보인다. 숙소는 판정 규칙에 실내외 구분이 없다.
 */
export function PlacesPageEligibilityToggles({
  type,
  onlyReachable,
  onToggleOnlyReachable,
  hideHard,
  onToggleHideHard,
  needsIndoor,
  onToggleNeedsIndoor,
}: TPlacesPageEligibilityTogglesProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 px-4 md:px-6" role="group" aria-label="우리 강아지 기준">
      {/* '갈 수 있는 곳만' 이 맨 앞 — 가능 + 야외 자리(홈 히어로 "갈 수 있는 곳 N" 과 같은 술어)만 남긴다. '어려운 곳 숨기기' 는
          확인 필요·정보 없음을 남겨 대형견 보호자가 4곳만 볼 길이 홈 히어로 숫자뿐이었다(14 W261013.14d · seongho-06).
          칩 이름 뒤 수(남는 곳·숨기는 곳, 14 W261013.8)는 뺐다(22 D-5) — 옵션마다 개수는 실서비스 0/4, 남는 곳 수는 목록 머리·시트 결과 버튼이 말한다. */}
      <FilterChip pressed={onlyReachable} onClick={onToggleOnlyReachable}>
        갈 수 있는 곳만
      </FilterChip>
      <FilterChip pressed={hideHard} onClick={onToggleHideHard}>
        어려운 곳 숨기기
      </FilterChip>
      {type !== 'stay' && (
        <FilterChip pressed={needsIndoor} onClick={onToggleNeedsIndoor}>
          실내 자리 필요
        </FilterChip>
      )}
    </div>
  );
}
