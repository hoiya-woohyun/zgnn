'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronRight, SearchMd } from '@untitledui/icons';
import { PlacesPageActiveChips, type TActiveChip } from './placesPageActiveChips';
import { PlaceCard } from '../components/placeCard';
import { PlaceLinkList } from '../components/placeLinkList';
import { EmptyState } from '../components/layout/emptyState';
import { BottomSheet } from '../components/base/bottom-sheet';
import { Button } from '../components/base/button';
import { FilterChip } from '../components/filterChip';
import { judgeEligibility, primaryReason } from '../lib/eligibility';
import { carrierWhatIf, carrierWhatIfText, countByLevel, levelCountParts, outdoorFallback } from '../lib/eligibilityCounts';
import { placesPageHardFold } from '../lib/placesPageHardFold';
import { placesPageEmptySearch, placesPageSortLabel, placesPageSortOptions, type TAreaCarried, type TConditionRelease } from '../lib/placesPageFilter';
import { placesPageRepeatedReason } from '../lib/placesPageRepeatedReason';
import { cityScopeOf, landmarkOfQuery } from '../lib/placeSearch';
import { townFilterLabel, type TPlaceSort } from '../lib/placeFilters';
import { areaTownsLabel, type TAreaId } from '../lib/areaGroups';
import { josa, withJosa } from '../lib/korean';
import { TYPE_META, type TPlaceEntry } from '../lib/places';
import { useAppStore } from '../store/useAppStore';
import { usePlacesPageFilterStore } from '../store/usePlacesPageFilterStore';
import type { TPlaceType } from '../types';
import { cx } from '../utils/cx';
import { SCROLL_ROW_CLASS } from './placesPageFilters';

type TPlacesPageResultsProps = {
  type: TPlaceType;
  town: string | null;
  results: TPlaceEntry[];
  /** 이 종류에 그 읍면 자체가 없다(조건과 무관하게 0곳). 전용 빈 상태를 보여준다. */
  townHasNoPlaces: boolean;
  hasFilters: boolean;
  /** 지우기 링크 문구(`resetFiltersLabel`) — 검색어만이면 "검색 지우기", 둘 다면 "모두 지우기". */
  resetLabel: string;
  /** 다듬은 검색어. 빈 상태가 "검색 탓인가 필터 탓인가" 를 가르는 데 쓴다. */
  query: string;
  /** 켜진 조건 수(검색어 제외). 0 이면 시트에는 꺼 볼 것이 없다. */
  activeFilterCount: number;
  /** 검색어만 지운다 — 검색만으로 0곳일 때 빈 상태의 버튼. */
  onClearQuery: () => void;
  /** 읍면만 푼다 — 이 종류에 그 읍면이 아예 없을 때 빈 상태의 버튼(12 U1.6). */
  onClearTown: () => void;
  /** 켜진 조건 칩 줄. 비어 있으면 줄을 그리지 않는다. */
  activeChips: TActiveChip[];
  onResetFilters: () => void;
  /** 모바일 필터 시트를 연다. 빈 상태의 버튼이 쓴다 — md 부터는 조건 판이 펼쳐져 있어 버튼 자체를 숨긴다. */
  onOpenFilters: () => void;
  /**
   * 검색어만으로 0곳이고 어느 종류에도 없을 때의 "알려 주기" — 장소 제안 시트를 연다. 시트는 위(`placesPage`)가 한 벌만 쥔다.
   * 선택인 이유: 스와이프 엿보기는 손가락 밑에서 보이기만 하는 복사본이라 아무것도 열지 않는다 — 안 주면 버튼을 그리지 않는다.
   */
  onSuggest?: () => void;
  /** 지금 검색어로 이미 알려 줬나(14 W261019.16) — 그렇다면 0곳 안내가 '알려 주기' 를 거두고 보냈다고 말한다. */
  suggestSent?: boolean;
  /** 관광지·동 검색이 0곳일 때 그 중심에서 가까운 곳(`landmarkNearby`, 14 W261019.11). 0곳 안내 밑에 거리와 함께. */
  landmarkNearby?: { place: TPlaceEntry; km: number }[];
  /** 가까운 순일 때 장소 id → 거리(km). 카드가 "1.2km" 를 붙인다(10 F7). */
  distances?: Map<string, number>;
  /**
   * 같은 검색어가 맞는 다른 종류(`otherTypeMatches`). 0곳이면 빈 상태 맨 위에 큰 안내로, 결과가 있으면 머리 밑 한 줄로(14 W261007.11).
   * 엿보기도 같은 검색어로 센다.
   */
  otherTypes?: { type: TPlaceType; count: number }[];
  /** 0곳일 때, 숨김 조건만 풀면 맞는 곳이 있는 다른 종류(`otherTypeHiddenMatches`, 14 W261007.11b). `otherTypes` 와 겹치지 않는다. */
  hiddenOtherTypes?: { type: TPlaceType; count: number }[];
  /** '어려운 곳 숨기기'·'갈 수 있는 곳만' 을 함께 푼다 — 숨긴 종류로 넘어가는 링크가 넘어가기 전에 부른다. */
  onReleaseHidden?: () => void;
  /** 0곳일 때 읍면만 풀면 몇 곳인가(`townReleaseCount`, 18 T2.1). 0 이면 읍면 탓이 아니다. */
  townReleaseCount?: number;
  /** 홈 동네 카드가 건 권역(19 T3). */
  area?: TAreaId | null;
  /** 0곳일 때 권역만 풀면 몇 곳인가(`areaReleaseCount`). 0 이면 권역 탓이 아니다. */
  areaReleaseCount?: number;
  /** 권역만 푼다 — 권역 탓으로 0곳일 때 빈 상태의 버튼. */
  onClearArea?: () => void;
  /** 0곳일 때 '갈 수 있는 곳만' 을 풀면 몇 곳인가(`reachableReleaseCount`, 19 T4.1). */
  reachableReleaseCount?: number;
  onClearOnlyReachable?: () => void;
  /**
   * 0곳일 때 켜진 조건을 하나씩 풀면 몇 곳인가(`singleConditionReleases`, 14 W261010.33s) — 많은 순. 위 셋(읍면·'갈 수 있는 곳만'·권역)이
   * 답이 아닐 때 범용 안내가 앞의 둘을 버튼으로 세운다. 지우기는 같은 키의 칩(`activeChips`)의 것이다.
   */
  conditionReleases?: TConditionRelease[];
  /** 검색어 없이 0곳인 식당·카페에서 다른 자리 종류의 수(`otherSeatTypeMatches`, 14 W261010.33v) — 0곳 안내 밑에 "카페에 N곳 있어요" 줄로. */
  seatOtherTypes?: { type: TPlaceType; count: number }[];
  /** 동네 카드로 들어왔는데 따라온 읍면·방향·조건 칩 탓에 카드보다 적게 보이면(`areaCarriedRelease`, 19 T4.2). */
  areaCarried?: TAreaCarried | null;
  onReleaseAreaCarried?: () => void;
  /**
   * 목록 위 정렬 줄(모바일, 14 W261019.13) — 지금 순서가 눌린 칩이고 다른 순서를 누르면 바꾼다. 예전엔 '가까운 순' 칩 하나뿐이라(14 W261010.18)
   * 목록이 거리순이 아닌데도 그 칩이 지금 상태인지 누르라는 버튼인지 몰랐다(haeun-02). 본 화면만 준다 — 엿보기는 정렬을 갖지 않아 기본 순서가 눌린 줄을
   * 그리고(새로 마운트된 목록이 그 모양이다) 눌러도 아무 일 없다. 위치 권한이 없으면 정렬을 바꾸지 않고 이유만 말한다(`changeSort`).
   * `from` 은 상세 「근처 장소」 로 들어온 기준 장소 이름(14 W261013.14o) — 칩이 "○○에서 가까운 순" 이라 말해야 카드의 km 를 내 위치에서 잰 값으로 읽지 않는다.
   * 없고 검색어에 관광지·동 낱말이 있으면 그 낱말이 기준이다("중문에서 가까운 순", 14 W261019.11) — 검색어에서 읽으므로 엿보기도 같은 이름을 그린다.
   */
  sortControl?: { sort: TPlaceSort; onChange: (sort: TPlaceSort) => void; from?: string };
  /**
   * 시 이름 검색('서귀포')을 시내로 좁힌다 — 읍면 필터에 시내 태그('서귀포시')를 건다(14 W261010.30). 본 화면만 준다:
   * 엿보기는 같은 줄을 그리되 눌러도 아무 일 없다(`nearSort` 와 같은 까닭 — 줄이 있다 없다 하면 손을 놓는 순간 목록이 뛴다).
   */
  onCityDowntown?: (town: string) => void;
};

/**
 * 헤더 아래의 본문 — 몇 곳인지, 목록, 없을 때의 안내.
 *
 * 화면 상태를 갖지 않고 결과만 받아 그린다. 스와이프의 엿보기(placesPageSwipePeek)가 이웃
 * 종류의 본문을 같은 모양으로 그려야 해서 placesPage 에서 떼어 냈다 — 둘이 다르면 손가락을
 * 놓고 새 화면이 뜨는 순간 모양이 바뀐다.
 */
export function PlacesPageResults({
  type,
  town,
  results,
  townHasNoPlaces,
  hasFilters,
  resetLabel,
  query,
  activeFilterCount,
  onClearQuery,
  onClearTown,
  activeChips,
  onResetFilters,
  onOpenFilters,
  onSuggest,
  suggestSent = false,
  landmarkNearby = [],
  distances,
  otherTypes = [],
  hiddenOtherTypes = [],
  onReleaseHidden,
  townReleaseCount = 0,
  area = null,
  areaReleaseCount = 0,
  onClearArea,
  reachableReleaseCount = 0,
  onClearOnlyReachable,
  conditionReleases = [],
  seatOtherTypes = [],
  areaCarried = null,
  onReleaseAreaCarried,
  sortControl,
  onCityDowntown,
}: TPlacesPageResultsProps) {
  const dog = useAppStore((state) => state.dog);
  const needsIndoor = useAppStore((state) => state.needsIndoor);
  // 홈 카드와 같은 함수로 센다(T2.2). 엿보기도 이 컴포넌트를 쓰므로 두 화면의 수가 저절로 같다.
  // 0 인 레벨은 빼서 줄을 짧게 둔다 — "어려움 0" 은 읽을 거리가 아니다.
  const levelSummary = useMemo(() => {
    if (!dog) return '';
    return levelCountParts(countByLevel(results, dog, { needsIndoor }))
      .map((part) => ` · ${part}`)
      .join('');
  }, [results, dog, needsIndoor]);

  // 식당이 "어려움 · 케이지 필요" 로 줄지어 막혔을 때, 이동가방이면 몇 곳이 열리는지(T2.5).
  // 판정은 그대로 두고 안내만 한다 — 가방이 있는데 "없어요" 로 저장한 사람에게 고칠 길을 준다.
  // 식당만: 케이지 필수는 식당 원문의 말이고, 숙소·카페엔 해당 곳이 거의 없어 늘 빈 줄이 된다.
  const whatIf = useMemo(
    () => (dog && type === 'restaurant' ? carrierWhatIf(results, dog, { needsIndoor }) : null),
    [results, dog, needsIndoor, type],
  );

  // 카드 대부분이 같은 근거 문장이면 머리가 한 번 말하고 카드는 그 줄을 뺀다(14 W261006.5) —
  // 식당 34곳 중 29곳이 "케이지라고 적혀 있어요. …" 를 되풀이해 목록이 걸러 주는 게 없어 보였다.
  // 카드와 같은 판정(`useEligibility` 와 같은 needsIndoor)에서 문장을 뽑아야 숨김이 정확히 맞는다.
  // 몸무게 문턱 줄(I2)은 '갈 수 있어요' 카드의 참고 줄이라 세지 않는다 — 머리가 "N곳은 같은 이유예요" 라고 하면 막힌 이유로 읽힌다(14 W261010.33r).
  const repeated = useMemo(
    () =>
      dog
        ? placesPageRepeatedReason(
            results.map((place) => {
              const reason = primaryReason(judgeEligibility(dog, place.policy, { needsIndoor }));
              return reason?.rule === 'I2' ? undefined : reason?.text;
            }),
          )
        : null,
    [results, dog, needsIndoor],
  );

  // 갈 수 있는 곳이 0곳일 때 야외 자리로는 되는 곳들(30kg 식당 → 무거버거 1곳 — 카드가 "야외 자리에서 갈 수 있어요" 인 곳만). 판정은 그대로, 안내만.
  // 누르면 그 곳들만 시트로 펼친다(14 W261006.5a) — 기본 정렬은 그곳을 맨 앞에 두지만(W261007.5a) 가까운 순·가격 순에선 흩어진다.
  const outdoor = useMemo(
    () => (dog ? outdoorFallback(results, dog, { needsIndoor }) : null),
    [results, dog, needsIndoor],
  );
  const [outdoorOpen, setOutdoorOpen] = useState(false);

  // 어려운 곳은 끝에 접는다(08 T5.3) — 프로필이 있을 때 기본 보기. 곳 수는 그대로 세고 카드만 접는다(`placesPageHardFold`).
  // 열림은 종류별로 스토어에 산다(14 W261013.13) — 마운트에 두면 상세에 갔다 오는 순간 접혀 펼쳐 둔 다음 집이 화면에 없었다.
  // 엿보기도 같은 `type` 으로 같은 값을 읽어 손을 놓아도 모양이 같다.
  const fold = useMemo(
    () =>
      dog
        ? placesPageHardFold(results, (place) => judgeEligibility(dog, place.policy, { needsIndoor }).level === 'hard')
        : { shown: results, folded: [] },
    [results, dog, needsIndoor],
  );
  const hardOpen = usePlacesPageFilterStore((state) => state.hardOpenByType[type]);
  const toggleHardOpen = usePlacesPageFilterStore((state) => state.toggleHardOpen);

  // 넓은 화면은 두 열(07 U10). lg 부터 — md 는 사이드바를 빼면 본문이 512px 이라 한 열 카드가 이미 그 폭이다.
  const listClass = 'space-y-3 lg:grid lg:grid-cols-2 lg:items-start lg:gap-3 lg:space-y-0';

  // 0곳 안내가 어느 갈래인지 한 번만 가른다 — 위의 "다른 종류" 링크 줄이 갈래에 따라 큰 안내로 옮겨 가서 두 곳이 같은 조건을 봐야 한다.
  // 검색어만이어도 '숨김 조건으로 가려진 종류' 만 있으면 "목록에 없다" 고 말할 수 없다 — 그 가게는 있다. 이때는 generic 이 링크 줄을 그대로 둔다.
  const searchOnly = Boolean(query) && activeFilterCount === 0 && !townHasNoPlaces;
  const emptyKind =
    town && !townHasNoPlaces && townReleaseCount > 0
      ? 'town'
      : reachableReleaseCount > 0
        ? 'reachable'
        : area && areaReleaseCount > 0
          ? 'area'
          : searchOnly && (otherTypes.length > 0 || hiddenOtherTypes.length === 0)
            ? 'search'
            : 'generic';
  const emptySearch = emptyKind === 'search' ? placesPageEmptySearch(query, otherTypes) : null;
  // 범용 0곳 안내의 다음 길 — 조건 하나만 풀면 되는 앞의 둘(14 W261010.33s). 버튼은 그 칩의 ✕ 와 같은 일을 한다(같은 키의 `onRemove`).
  const releaseActions = conditionReleases
    .flatMap((release) => {
      const chip = activeChips.find((candidate) => candidate.key === release.key);
      return chip ? [{ ...release, chip }] : [];
    })
    .slice(0, 2);
  // 0곳에서 "다른 종류에 N곳" 링크 줄이 큰 안내보다 먼저 서는가 — 'search' 갈래는 그 답을 큰 안내로 옮겨 간다.
  const otherTypeRowsFirst = emptyKind !== 'search' && (otherTypes.length > 0 || hiddenOtherTypes.length > 0);

  // 시 이름 검색이 시내 밖 읍면까지 덮었으면 그렇다고 말한다(14 W261010.30). 읍면 필터가 걸려 있으면 이미 좁힌 것이라 말하지 않는다.
  const cityScope = useMemo(() => (town ? null : cityScopeOf(query, results)), [town, query, results]);
  // '가까운 순' 의 기준 이름 — 들어온 장소가 먼저, 없으면 검색어의 관광지·동 낱말(14 W261019.11). 기준점은 화면(`placesPage`)이 같은 차례로 고른다.
  const nearFrom = sortControl?.from ?? landmarkOfQuery(query)?.word;
  const sort = sortControl?.sort ?? 'none';

  const renderOtherTypeRow = (other: { type: TPlaceType; count: number }) => (
    <li key={other.type}>
      <Link
        href={`/places/${other.type}/`}
        className="flex min-h-11 items-center justify-between rounded-xl border border-secondary bg-primary px-4 text-sm font-semibold text-brand-secondary hover:text-brand-secondary_hover"
      >
        {TYPE_META[other.type].label}에 {other.count}곳 있어요
        <ChevronRight size={20} aria-hidden="true" className="shrink-0 text-quaternary" />
      </Link>
    </li>
  );

  // 숨김 조건에 가려진 종류의 줄(14 W261007.11b) — 링크 줄과 "답이 큰 안내" 아래 두 곳이 같은 줄을 쓴다.
  const renderHiddenRows = () =>
    hiddenOtherTypes.map((other) => (
      <li key={other.type}>
        <Link
          href={`/places/${other.type}/`}
          onClick={onReleaseHidden}
          className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-secondary bg-primary px-4 py-2 text-sm font-semibold text-brand-secondary hover:text-brand-secondary_hover"
        >
          <span>
            {TYPE_META[other.type].label}에 {other.count}곳 있어요
            <span className="block text-xs font-normal text-tertiary">
              {activeChips
                .filter((chip) => chip.key === 'onlyReachable' || chip.key === 'hideHard')
                .map((chip) => `'${chip.label}'`)
                .join('·')}{' '}
              을 풀면 보여요
            </span>
          </span>
          <ChevronRight size={20} aria-hidden="true" className="shrink-0 text-quaternary" />
        </Link>
      </li>
    ));

  const renderCard = (place: TPlaceEntry) => (
    <PlaceCard key={place.id} place={place} distanceKm={distances?.get(place.id)} hideReasonText={repeated?.text} />
  );

  return (
    <>
      <div className="flex items-center justify-between px-4 pt-4 md:px-6">
        <div>
          <p className="text-sm text-tertiary">
            {results.length}곳{levelSummary}
          </p>
          {/* 조건을 여러 개 겹쳐 0~1곳만 남았을 때 "왜 이렇게 적지" 하고 이탈하지 않도록
              조건을 하나 풀어보라고 먼저 알려준다(2026-09-15 리뷰 §1 — 세 필터 켜면 0~1곳 안내 없음). */}
          {activeFilterCount > 0 && results.length === 1 && (
            <p className="mt-0.5 text-xs text-tertiary">필터를 하나 풀어 보면 더 볼 수 있어요.</p>
          )}
        </div>
        {hasFilters && (
          <Button color="link-color" size="sm" className="min-h-11" onClick={onResetFilters}>
            {resetLabel}
          </Button>
        )}
      </div>

      {/*
        정렬은 화면 폭마다 한 자리다(14 W261019.13) — md 부터는 펼친 판의 셀렉트가 같은 이름으로 말하므로 이 줄은 모바일만. 시트에는 정렬이 없다.
        이름이 기준을 말한다('기본순' 대신 "갈 수 있는 곳 먼저"·"확인한 곳 먼저", `placesPageSortLabel`). 숙소는 가격 둘까지 넷이라 줄이 옆으로 밀린다.
      */}
      {results.length > 0 && (
        <div className={cx(SCROLL_ROW_CLASS, 'pt-2 md:hidden')} role="group" aria-label="정렬">
          <span className="shrink-0 text-sm text-tertiary" aria-hidden="true">
            정렬
          </span>
          {placesPageSortOptions(type).map((option) => (
            <FilterChip
              key={option}
              pressed={sort === option}
              onClick={() => sortControl?.onChange(option)}
              className={option === 'near' ? 'max-w-full' : undefined}
            >
              {option === 'near' && nearFrom ? (
                /* 긴 이름("프레임스파빌 오션뷰펜션")이 320px 에서 넘치면 이름만 줄인다 — "에서 가까운 순" 이 잘리면 무엇을 하는 칩인지가 사라진다.
                   칩의 `gap-1` 이 이름과 '에서' 사이를 띄우지 않게 한 덩어리로 감싼다. */
                <span className="flex min-w-0">
                  <span className="truncate">{nearFrom}</span>
                  <span className="shrink-0">에서 가까운 순</span>
                </span>
              ) : (
                placesPageSortLabel(option, { hasDog: Boolean(dog), nearFrom })
              )}
            </FilterChip>
          ))}
        </div>
      )}

      {/* 검색어만으로 0곳이면 큰 안내의 제목이 검색어를 이름으로 말하고 지우는 길(개수 줄 '검색 지우기')도 있어 검색어 칩은 세 번째 같은 말이다.
          그 한 줄(~55px)이 1280×800 에서 안내의 버튼을 접힘 아래로 밀었다(14 W261013.10a). 권역처럼 다른 칩은 그대로 둔다. */}
      <PlacesPageActiveChips
        chips={results.length === 0 && emptyKind === 'search' ? activeChips.filter((chip) => chip.key !== 'query') : activeChips}
      />

      {/* 시 이름은 소속 읍면까지 맞는다(W261006.9) — 여행자는 '서귀포' 를 시내로 읽어 맨 위의 성산을 틀린 결과로 본다(business-11).
          범위는 두고 무엇을 덮었는지 말하며, 시내만 원하면 그 자리에서 읍면 필터로 좁힌다. 시내가 0곳이면 좁힐 것이 없어 버튼을 뺀다. */}
      {results.length > 0 && cityScope && (
        <p className="flex min-h-11 flex-wrap items-center gap-x-3 px-4 text-sm text-tertiary md:px-6">
          {`'${cityScope.word}'${josa(cityScope.word, '은/는')} ${cityScope.downtown} 전체예요 · 시내 ${cityScope.downtownCount}곳 · 읍면 ${cityScope.townCount}곳`}
          {cityScope.downtownCount > 0 && (
            <button
              type="button"
              onClick={() => onCityDowntown?.(cityScope.downtown)}
              data-ev="places.cityDowntown"
              className="inline-flex min-h-11 items-center font-semibold text-brand-secondary hover:text-brand-secondary_hover"
            >
              시내만 보기
            </button>
          )}
        </p>
      )}

      {/* 동네 카드는 n곳이라 했는데 목록이 그보다 적으면 무엇이 걸렸는지 말하고 그 자리에서 푼다(19 T4.2) — 홈은 퍼시스트 읍면을
          몰래 바꾸지 않으므로(18 T2) 전에 걸어 둔 읍면·칩이 카드 진입을 따라온다. 0곳이면 아래 빈 상태가 같은 일을 한다. */}
      {results.length > 0 && areaCarried && (
        <p className="flex flex-wrap items-center gap-x-3 px-4 text-sm text-tertiary md:px-6">
          {`동네 카드는 ${areaCarried.count}곳인데 ${withJosa(
            [areaCarried.town && townFilterLabel(areaCarried.town), areaCarried.directions > 0 && '방향', areaCarried.petKeys > 0 && `조건 ${areaCarried.petKeys}개`]
              .filter(Boolean)
              .join(' · '),
            '이/가',
          )} 걸려 있어요`}
          <button
            type="button"
            onClick={onReleaseAreaCarried}
            className="inline-flex min-h-11 items-center font-semibold text-brand-secondary hover:text-brand-secondary_hover"
          >
            풀고 {areaCarried.count}곳 보기
          </button>
        </p>
      )}

      {/* 결과가 있어도 같은 검색어가 다른 종류에 맞으면 그 수를 말한다(14 W261007.11) — 검색은 탭 안에서만 돌아서 '함덕' 을 친 사람은
          식당·카페에도 있는 줄 모른다. 0곳일 때의 큰 안내(아래 빈 상태)와 달리 목록을 밀어내지 않게 한 줄로. */}
      {results.length > 0 && otherTypes.length > 0 && (
        <p className="flex flex-wrap items-center gap-x-3 px-4 text-sm text-tertiary md:px-6">
          다른 종류에도 있어요
          {otherTypes.map((other) => (
            <Link
              key={other.type}
              href={`/places/${other.type}/`}
              className="inline-flex min-h-11 items-center gap-0.5 font-semibold text-brand-secondary hover:text-brand-secondary_hover"
            >
              {TYPE_META[other.type].label} {other.count}곳
              <ChevronRight size={16} aria-hidden="true" className="shrink-0" />
            </Link>
          ))}
        </p>
      )}

      {/* 목록 전체에 대한 말은 한 상자에 모은다 — 같은 이유(케이지)와 그 출구(이동가방 what-if)가
          따로 쌓이면 같은 이야기를 두 번 한다. 곳 수를 앞세워 문장이 빠진 카드가 어느 쪽인지 읽히게 한다. */}
      {(repeated || outdoor || whatIf) && (
        <div
          // 마지막 줄이 44px 링크·버튼이면 그 높이가 아래 여백을 대신한다.
          className={`mx-4 mt-3 space-y-1 rounded-xl border border-secondary bg-primary px-3 pt-2 text-sm text-secondary md:mx-6 ${whatIf || outdoor ? '' : 'pb-2'}`}
        >
          {repeated && (
            <p>
              <span className="font-semibold text-primary">{repeated.count}곳은 같은 이유예요</span> · {repeated.text}
            </p>
          )}
          {/* 수는 머리 줄의 "야외 N" 이 이미 말한다 — 문장으로 한 번 더 세지 않고 그 N곳을 여는 버튼만 둔다(14 W261007.5a).
              이름이 "야외 N" 과 같은 말인 것은 "어려움 N곳 보기" 와 같은 이유다. */}
          {outdoor && (
            <div>
              <button
                type="button"
                onClick={() => setOutdoorOpen(true)}
                className="flex min-h-11 items-center font-semibold text-brand-secondary hover:text-brand-secondary_hover"
              >
                야외 자리 {outdoor.length}곳 보기
              </button>
            </div>
          )}
          {whatIf && (
            <div>
              {carrierWhatIfText(whatIf)}
              <Link
                href="/dog"
                className="flex min-h-11 items-center font-semibold text-brand-secondary hover:text-brand-secondary_hover"
              >
                우리 강아지 정보 고치기
              </Link>
            </div>
          )}
        </div>
      )}

      {results.length > 0 ? (
        <>
          <ul className={cx('mt-3 px-4 md:px-6', listClass)}>{fold.shown.map(renderCard)}</ul>
          {fold.folded.length > 0 && (
            <div className="mt-3 px-4 md:px-6">
              {/* 이름은 머리 줄의 "어려움 N" 과 같은 말 — 접힌 것이 그 N곳이라는 게 읽혀야 한다. */}
              <button
                type="button"
                aria-expanded={hardOpen}
                onClick={() => toggleHardOpen(type)}
                className="flex min-h-11 w-full items-center justify-center gap-1 rounded-xl border border-secondary text-sm font-semibold text-secondary hover:bg-tertiary"
              >
                어려움 {fold.folded.length}곳 {hardOpen ? '접기' : '보기'}
                <ChevronDown
                  size={20}
                  aria-hidden="true"
                  className={cx('shrink-0 text-quaternary transition-transform motion-reduce:transition-none', hardOpen && 'rotate-180')}
                />
              </button>
              {hardOpen && <ul className={cx('mt-3', listClass)}>{fold.folded.map(renderCard)}</ul>}
            </div>
          )}
        </>
      ) : (
        /*
          빈 상태의 버튼은 필터를 *지우지* 않고 *열어* 준다. "다른 읍면을 골라 보세요" 라고
          써 놓고 버튼이 읍면을 지우기만 하면 글과 동작이 반대를 말한다. 전부 지우는 길은
          위의 지우기 링크가 그대로 맡는다.
        */
        /*
          위 여백은 링크 줄이 먼저 설 때만 — 큰 안내가 바로 오면 EmptyState 자신의 py-10 이 그 몫이고, 둘을 겹친 64px 이
          1280×800 에서 안내의 버튼을 접힘 아래로 미는 데 한몫했다(14 W261013.10a).
        */
        <div className={cx('px-4 md:px-6', otherTypeRowsFirst && 'pt-6')}>
          {/*
            검색은 종류 탭 안에서만 돈다 — 다른 종류에 있으면 그쪽으로 가는 길을 맨 위에 둔다(14 W261006.6).
            "없어요" 보다 먼저 읽혀야 사용자가 그 가게가 없다고 결론 내리지 않는다. 검색어는 스토어에 있어 따라간다(07 U3).
          */}
          {otherTypeRowsFirst && (
            <ul className="mb-2 space-y-2">
              {otherTypes.map(renderOtherTypeRow)}
              {/*
                숨김 조건에 가려진 종류도 말한다(14 W261007.11b) — 위 수는 넘어간 탭의 수라 '어려움' 인 가게는 빠지는데, 그러면 사용자는
                그 가게가 없다고 읽는다. 무엇이 가렸는지 칩 이름 그대로 적고, 누르면 그것을 풀고 넘어가 같은 수를 본다.
              */}
              {renderHiddenRows()}
            </ul>
          )}
          {/*
            검색어만 걸려 0곳이면 필터를 탓하지 않는다(12 U1.2) — 시트에는 꺼 볼 것이 없고, 지울 것은 검색어다.
            이 버튼은 md 에서도 보인다: 펼쳐진 조건 판이 검색어를 지워 주지 않는다.
          */}
          {/*
            읍면 하나가 원인이면 그렇다고 말하고 그 자리에서 푼다(18 T2.1). 읍면은 퍼시스트라 전에 걸어 둔 '구좌읍' 이
            홈 관광지 칩("중문")과 겹쳐 0곳이 된다 — "필터 바꾸기" 로 시트를 열어도 사용자는 무엇이 걸렸는지 모른다.
            이 종류에 그 읍면 자체가 없을 때는 아래 전용 빈 상태가 같은 버튼을 이미 준다.
          */}
          {town && !townHasNoPlaces && townReleaseCount > 0 ? (
            <EmptyState
              Icon={SearchMd}
              title={`${townFilterLabel(town)}에는 맞는 ${withJosa(TYPE_META[type].label, '이/가')} 없어요`}
              description={`읍면을 풀면 ${townReleaseCount}곳이 있어요.`}
              action={
                <Button color="primary" size="md" onClick={onClearTown}>
                  {`${townFilterLabel(town)} 풀고 ${townReleaseCount}곳 보기`}
                </Button>
              }
            />
          ) : reachableReleaseCount > 0 ? (
            /*
              '갈 수 있는 곳만' 이 원인이면(19 T4.1) — 동네 카드 "묵을 곳 0" 을 눌러 들어온 길. 권역보다 먼저 본다: 권역을 풀면
              방금 고른 동네를 잃고, 그 동네엔 확인·정보 없음 곳이 남아 있다. "없어요" 가 아니라 '확인된 곳' 이 없다고 말한다(19 §1).
            */
            <EmptyState
              Icon={SearchMd}
              title={`갈 수 있다고 확인된 ${withJosa(TYPE_META[type].label, '은/는')} 아직 없어요`}
              description={`'갈 수 있는 곳만' 을 풀면 ${reachableReleaseCount}곳이 있어요.`}
              action={
                <Button color="primary" size="md" onClick={onClearOnlyReachable}>
                  {`풀고 ${reachableReleaseCount}곳 보기`}
                </Button>
              }
            />
          ) : area && areaReleaseCount > 0 ? (
            /*
              권역이 원인이면 같은 모양으로(19 T3) — 카드에서 '서부' 를 열고 '중문' 을 치거나, 그 권역에 이 종류가 아예 없을 때.
              읍면 갈래를 먼저 본다: 읍면은 퍼시스트라 사용자가 건 줄 모르고, 권역은 방금 카드로 건 것이다.
            */
            <EmptyState
              Icon={SearchMd}
              title={`${areaTownsLabel(area)}에는 맞는 ${withJosa(TYPE_META[type].label, '이/가')} 없어요`}
              description={`권역을 풀면 ${areaReleaseCount}곳이 있어요.`}
              action={
                <Button color="primary" size="md" onClick={onClearArea}>
                  {`권역 풀고 ${areaReleaseCount}곳 보기`}
                </Button>
              }
            />
          ) : emptySearch?.kind === 'otherType' ? (
            /*
              검색어만으로 0곳인데 다른 종류에 있으면 그 답이 큰 안내다(14 W261013.10) — 작은 링크 줄 밑에 큰 "맞는 곳이 없어요" 가 있으면
              더 크게 읽혀 사용자가 답을 지나친다. 검색어는 스토어에 있어 탭을 따라간다(07 U3).
            */
            <>
              <EmptyState
                Icon={SearchMd}
                title={`'${query}'${josa(query, '은/는')} ${TYPE_META[emptySearch.top.type].label}에 있어요`}
                description={`${TYPE_META[type].label}에는 없어요. 검색어는 그대로 따라가요.`}
                action={
                  <Button color="primary" size="md" href={`/places/${emptySearch.top.type}/`}>
                    {`${TYPE_META[emptySearch.top.type].label}에서 ${emptySearch.top.count}곳 보기`}
                  </Button>
                }
              />
              {(emptySearch.rest.length > 0 || hiddenOtherTypes.length > 0) && (
                <ul className="mt-2 space-y-2">
                  {emptySearch.rest.map(renderOtherTypeRow)}
                  {renderHiddenRows()}
                </ul>
              )}
            </>
          ) : emptySearch?.kind === 'landmark' ? (
            /*
              관광지·동 이름이면 '목록에 없다' 가 아니라 그 반경 안에 아직 덜 모았다는 말이고(14 W261019.11 — '법환' 에 "가게를 알려 주세요" 는
              동네를 가게로 읽은 답이었다), 길은 그 자리에서 가까운 곳이다. 카드의 km 는 제목이 말하는 그 낱말에서 잰 거리다(거리순이다).
            */
            <>
              <EmptyState
                Icon={SearchMd}
                title={`${emptySearch.word} ${emptySearch.radiusKm}km 안엔 저희가 모은 ${withJosa(TYPE_META[type].label, '이/가')} 아직 없어요`}
                description={
                  suggestSent
                    ? '알려 주셔서 고마워요. 운영자가 찾아보고, 확인되면 올릴게요.'
                    : landmarkNearby.length > 0
                      ? '조금 더 먼 곳을 가까운 순으로 보여 드려요. 아는 곳이 있으면 알려 주세요.'
                      : '아는 곳이 있으면 알려 주세요. 운영자가 찾아보고, 확인되면 올릴게요.'
                }
                action={
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    {onSuggest && !suggestSent && (
                      <Button color="secondary" size="md" onClick={onSuggest} data-ev="places.emptySuggest">
                        알려 주기
                      </Button>
                    )}
                    <Button color="secondary" size="md" onClick={onClearQuery}>
                      검색 지우기
                    </Button>
                  </div>
                }
              />
              {landmarkNearby.length > 0 && (
                <section aria-labelledby="places-landmark-nearby">
                  <h2 id="places-landmark-nearby" className="text-sm font-semibold text-secondary">
                    {emptySearch.word}에서 가까운 {TYPE_META[type].label}
                  </h2>
                  <ul className={cx('mt-2', listClass)}>
                    {landmarkNearby.map(({ place, km }) => (
                      <PlaceCard key={place.id} place={place} distanceKm={km} />
                    ))}
                  </ul>
                </section>
              )}
            </>
          ) : emptySearch ? (
            /*
              어느 종류에도 없으면 "없다" 가 아니라 '아직 우리 목록에 없다' 이고, 길은 알려 주기다(14 W261013.10). 띄어쓰기 안내는 하지 않는다 —
              검색이 공백을 지우고 비교해 띄어쓰기는 결과를 바꾸지 않는다. "더 짧게" 는 단어가 둘 이상일 때뿐(모든 단어가 맞아야 나온다).
            */
            <EmptyState
              Icon={SearchMd}
              title={`'${query}'${josa(query, '은/는')} 아직 저희 목록에 없어요`}
              description={
                suggestSent
                  ? '알려 주셔서 고마워요. 운영자가 찾아보고, 확인되면 올릴게요.'
                  : emptySearch.multiWord
                    ? '단어를 하나만 남겨 찾아보세요 — 모든 단어가 맞아야 나와요. 그래도 없으면 알려 주세요.'
                    : '알려 주시면 운영자가 찾아보고, 확인되면 올릴게요.'
              }
              action={
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {/* 보낸 뒤에도 같은 버튼이면 보냈는지 헷갈려 또 누른다(haeun-18b) — 거두고, 한 곳 더는 목록 끝(`PlacesPageSuggest`)이 받는다. */}
                  {onSuggest && !suggestSent && (
                    <Button color="primary" size="md" onClick={onSuggest} data-ev="places.emptySuggest">
                      알려 주기
                    </Button>
                  )}
                  <Button color={onSuggest && !suggestSent ? 'secondary' : 'primary'} size="md" onClick={onClearQuery}>
                    검색 지우기
                  </Button>
                </div>
              }
            />
          ) : (
            <EmptyState
              Icon={SearchMd}
              title={
                townHasNoPlaces
                  ? `${townFilterLabel(town ?? '')}엔 ${withJosa(TYPE_META[type].label, '이/가')} 없어요`
                  : `${TYPE_META[type].label}에는 필터에 맞는 곳이 없어요`
              }
              description={
                townHasNoPlaces
                  ? '읍면을 풀거나 필터에서 다른 읍면을 골라 보세요.'
                  : releaseActions.length > 0
                    ? '조건 하나만 풀어도 있어요.'
                    : '검색어나 필터를 바꿔 보세요.'
              }
              action={
                townHasNoPlaces ? (
                  // 이 종류에 없는 읍면은 시트에서 다른 칩을 고르기 전엔 안 풀린다 — 바로 푸는 것이 할 일이다(12 U1.6).
                  <Button color="primary" size="md" onClick={onClearTown}>
                    읍면 풀기
                  </Button>
                ) : releaseActions.length > 0 ? (
                  /*
                    "필터를 바꿔 보세요" 만으로는 무엇을 풀어야 하는지 몰랐다(ferry-28 — 경쟁 펫패스는 대체 장소를 낸다). 하나만 풀어도 되는 조건을
                    수와 함께 — 앞의 둘만, 많은 순. '어려운 곳 숨김' 은 후보가 아니다(풀면 못 가는 곳만 나온다, `singleConditionReleases`).
                    시트를 여는 '필터 바꾸기' 는 뺀다 — 버튼이 셋이면 폰에서 안내가 버튼 더미가 되고, 시트는 위 필터 버튼이 그대로 연다.
                  */
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    {releaseActions.map((release, index) => (
                      <Button
                        key={release.key}
                        color={index === 0 ? 'primary' : 'secondary'}
                        size="md"
                        onClick={release.chip.onRemove}
                        data-ev="places.emptyRelease"
                      >
                        {release.key === 'query'
                          ? `검색어 지우고 ${release.count}곳 보기`
                          : `${release.chip.label} 풀고 ${release.count}곳 보기`}
                      </Button>
                    ))}
                  </div>
                ) : (
                  <Button color="primary" size="md" className="md:hidden" onClick={onOpenFilters}>
                    필터 바꾸기
                  </Button>
                )
              }
            />
          )}
          {/*
            검색어 없이 0곳인 식당·카페면 대신이 되는 종류의 수(14 W261010.33v, ferry-28) — 어느 갈래든 큰 안내 밑에. 이 종류 안의 길(위 버튼)이 먼저이고,
            옆 종류는 그다음 길이다. 검색어가 있으면 이 배열은 비고 위의 링크 줄(`otherTypes`)이 말한다.
          */}
          {seatOtherTypes.length > 0 && <ul className="mt-2 space-y-2">{seatOtherTypes.map(renderOtherTypeRow)}</ul>}
        </div>
      )}

      {/* 지도의 "지도에 없는 N곳" 시트와 같은 줄 목록(`PlaceLinkList`) — 그 곳들만, 바로 상세로. */}
      <BottomSheet isOpen={outdoorOpen && outdoor !== null} onOpenChange={setOutdoorOpen} label="야외 자리로 갈 수 있는 곳">
        <p className="pr-8 text-md font-bold text-primary">야외 자리로 갈 수 있는 {outdoor?.length}곳</p>
        <p className="mt-0.5 text-sm text-tertiary">야외 자리가 열려 있는 곳이에요. 실내 동반은 가기 전에 확인해 보세요.</p>
        {outdoor && <PlaceLinkList places={outdoor} />}
      </BottomSheet>
    </>
  );
}
