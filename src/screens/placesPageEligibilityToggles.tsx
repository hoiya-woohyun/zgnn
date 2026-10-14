import type { TFiltersVariant } from './placesPageFilters';
import { FilterChip } from '../components/filterChip';
import { cx } from '../utils/cx';
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
  /** '어려운 곳 숨기기' 가 지금 조건에서 숨기는(켜면 숨길) 곳 수(`hideHardCount`). 칩 이름 뒤에 싣고, 0 이면 흐리게. */
  hardCount: number;
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
  hardCount,
}: TPlacesPageEligibilityTogglesProps) {
  const buttons = (
    <>
      {/* 숨기는 곳 수를 읍면 칩("구좌읍 9")처럼 이름 뒤에 — 어려움이 0곳인 목록에서 눌러도 "47곳 보기" 그대로라 고장으로 보였다(14 W261013.8).
          0 이면 꺼진 칩을 흐리게 두되 누를 수는 있다 — 다른 종류로 넘어가면 다시 숨길 곳이 생기는 전역 스위치다. 흐림은 투명도가 아니라
          한 단 옅은 글자·테두리 토큰이다(누를 수 있는 글자라 대비를 지킨다). 켜 둔 칩은 켜짐 모양 그대로 — 수 0 이 말한다. */}
      <FilterChip
        pressed={hideHard}
        onClick={onToggleHideHard}
        className={cx(hardCount === 0 && !hideHard && 'border-secondary text-tertiary')}
      >
        어려운 곳 숨기기 {hardCount}
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
        {/* '실내 자리 필요' 는 곳을 빼지 않고 판정을 바꾼다 — 아래 '실내 동반 OK'(원문으로 거름)와 이름이 비슷해 축이 섞였다(14 W261007.7). */}
        {type !== 'stay' && (
          <p className="mt-0.5 text-sm text-tertiary">&lsquo;실내 자리 필요&rsquo; 는 곳을 빼지 않고, 실내 자리 기준으로 다시 판정해요.</p>
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
