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
  /** '갈 수 있는 곳만'(14 W261013.14d) — 홈 동네 카드가 거는 것과 같은 스토어 값이라 카드로 들어오면 눌린 채로 보인다. */
  onlyReachable: boolean;
  onToggleOnlyReachable: () => void;
  hideHard: boolean;
  onToggleHideHard: () => void;
  needsIndoor: boolean;
  onToggleNeedsIndoor: () => void;
};

/**
 * 판정 관련 토글 — '갈 수 있는 곳만' · '어려운 곳 숨기기' · '실내 자리 필요'. 우리 강아지 프로필이 있을 때만 렌더된다(placesPage.tsx 가 호출을
 * `dog` 로 감싼다) — 프로필이 없으면 "이용하기 어려워요"(hard)라는 개념 자체가 없고, 이 토글이 보이는 것만으로도
 * v0 화면과 달라지기 때문이다.
 *
 * "실내 자리 필요"는 식당·카페에서만 보인다. 숙소는 판정 규칙에 실내외 구분이 없다.
 */
export function PlacesPageEligibilityToggles({
  variant,
  type,
  onlyReachable,
  onToggleOnlyReachable,
  hideHard,
  onToggleHideHard,
  needsIndoor,
  onToggleNeedsIndoor,
}: TPlacesPageEligibilityTogglesProps) {
  const buttons = (
    <>
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
    </>
  );

  if (variant === 'sheet') {
    return (
      <section role="group" aria-label="우리 강아지 기준">
        <h3 className="text-sm font-semibold text-secondary">우리 강아지 기준</h3>
        {/*
          '실내 자리 필요' 는 곳을 빼지 않고 판정을 바꾼다 — 아래 '실내 동반 OK'(원문으로 거름)와 이름이 비슷해 축이 섞였다(14 W261007.7).
          그 설명을 "곳을 빼지 않고, 실내 자리 기준으로 다시 판정해요" 라는 방식으로 적었더니 세 번 읽어도 무엇이 바뀌는지 몰랐다(14 W261019.1) —
          그래서 **결과**를 말한다: 바뀌는 이름은 바로 밑 판정 셈 줄의 이름('야외' 가 사라지고 '어려움' · C12 의 '확인 필요' 가 는다)과 같다.
          둘째 줄은 "실내까지 같이 갈 곳" 을 찾는 길 — 켠 채 '가능' 으로 남는 곳은 원문이 실내를 받고 이 아이의 이동 수단으로 들 수 있는 곳뿐이다
          (식당·카페 91곳 × 수단 넷 실측 어긋남 0). '실내 동반 OK' 는 강아지를 안 보고 원문으로만 남겨, 수단 없는 아이에게 '어려움' 인 케이지 필수 곳도 남는다.
        */}
        {type !== 'stay' && (
          <>
            <p className="mt-0.5 text-sm text-tertiary">
              켜면 야외 자리만 되는 곳은 ‘어려움’, 실내 얘기가 없는 곳은 ‘확인 필요’가 돼요. 앱 전체에 남아요.
            </p>
            <p className="mt-0.5 text-sm text-tertiary">
              실내까지 같이 갈 곳만 보려면 ‘갈 수 있는 곳만’도 켜요. 아래 ‘실내 동반 OK’는 강아지와 상관없이 걸러요.
            </p>
          </>
        )}
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
