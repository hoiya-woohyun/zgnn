'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { ChevronRight, SearchMd } from '@untitledui/icons';
import { PlacesPageActiveChips, type TActiveChip } from './placesPageActiveChips';
import { handOffPlacesQuery } from './placesPageQueryHandoff';
import { PlaceCard } from '../components/placeCard';
import { EmptyState } from '../components/layout/emptyState';
import { Button } from '../components/base/button';
import type { TEligibilityLevel } from '../lib/eligibility';
import { carrierWhatIf, countByLevel } from '../lib/eligibilityCounts';
import { josa, withJosa } from '../lib/korean';
import { TYPE_META, type TPlaceEntry } from '../lib/places';
import { useAppStore } from '../store/useAppStore';
import type { TPlaceType } from '../types';

// 목록 머리의 레벨 이름. 홈 종류 카드("가능 3 · 확인 필요 3")와 같은 말을 쓴다 — 배지 문구
// ("갈 수 있어요"…)를 그대로 늘어놓으면 한 줄에 안 들어간다. cond 를 '확인' 한 낱말로 줄이면
// 상세의 "…에 확인했어요"(검증됨)와 반대 뜻의 같은 말이 된다 — '필요' 까지가 뜻이다.
const LEVEL_SHORT: [TEligibilityLevel, string][] = [
  ['ok', '가능'],
  ['cond', '확인 필요'],
  ['unknown', '정보 없음'],
  ['hard', '어려움'],
];

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
  /** 가까운 순일 때 장소 id → 거리(km). 카드가 "1.2km" 를 붙인다(10 F7). */
  distances?: Map<string, number>;
  /** 0곳일 때 같은 검색어가 맞는 다른 종류(`otherTypeMatches`). 엿보기는 검색어가 없어 넘기지 않는다. */
  otherTypes?: { type: TPlaceType; count: number }[];
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
  distances,
  otherTypes = [],
}: TPlacesPageResultsProps) {
  const dog = useAppStore((state) => state.dog);
  const needsIndoor = useAppStore((state) => state.needsIndoor);
  // 홈 카드와 같은 함수로 센다(T2.2). 엿보기도 이 컴포넌트를 쓰므로 두 화면의 수가 저절로 같다.
  // 0 인 레벨은 빼서 줄을 짧게 둔다 — "어려움 0" 은 읽을 거리가 아니다.
  const levelSummary = useMemo(() => {
    if (!dog) return '';
    const counts = countByLevel(results, dog, { needsIndoor });
    return LEVEL_SHORT.filter(([level]) => counts[level] > 0)
      .map(([level, label]) => ` · ${label} ${counts[level]}`)
      .join('');
  }, [results, dog, needsIndoor]);

  // 식당이 "어려움 · 케이지 필요" 로 줄지어 막혔을 때, 이동가방이면 몇 곳이 열리는지(T2.5).
  // 판정은 그대로 두고 안내만 한다 — 가방이 있는데 "없어요" 로 저장한 사람에게 고칠 길을 준다.
  // 식당만: 케이지 필수는 식당 원문의 말이고, 숙소·카페엔 해당 곳이 거의 없어 늘 빈 줄이 된다.
  const whatIf = useMemo(
    () => (dog && type === 'restaurant' ? carrierWhatIf(results, dog, { needsIndoor }) : null),
    [results, dog, needsIndoor, type],
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

      <PlacesPageActiveChips chips={activeChips} />

      {whatIf && (
        <p className="mx-4 mt-3 rounded-xl border border-secondary bg-primary px-3 pt-2 text-sm text-secondary md:mx-6">
          이동가방이 있으면 {whatIf.opened}곳이 &lsquo;확인 필요&rsquo; 로 바뀌어요
          <Link
            href="/dog"
            className="flex min-h-11 items-center font-semibold text-brand-secondary hover:text-brand-secondary_hover"
          >
            우리 강아지 정보 고치기 ›
          </Link>
        </p>
      )}

      {results.length > 0 ? (
        <ul className="mt-3 space-y-3 px-4 md:px-6">
          {results.map((place) => (
            <PlaceCard key={place.id} place={place} distanceKm={distances?.get(place.id)} />
          ))}
        </ul>
      ) : (
        /*
          빈 상태의 버튼은 필터를 *지우지* 않고 *열어* 준다. "다른 읍면을 골라 보세요" 라고
          써 놓고 버튼이 읍면을 지우기만 하면 글과 동작이 반대를 말한다. 전부 지우는 길은
          위의 지우기 링크가 그대로 맡는다.
        */
        <div className="px-4 pt-6 md:px-6">
          {/*
            검색은 종류 탭 안에서만 돈다 — 다른 종류에 있으면 그쪽으로 가는 길을 맨 위에 둔다(14 W261006.6).
            "없어요" 보다 먼저 읽혀야 사용자가 그 가게가 없다고 결론 내리지 않는다. 검색어를 들고 넘어간다.
          */}
          {otherTypes.length > 0 && (
            <ul className="mb-2 space-y-2">
              {otherTypes.map((other) => (
                <li key={other.type}>
                  <Link
                    href={`/places/${other.type}/`}
                    onClick={() => handOffPlacesQuery(query)}
                    className="flex min-h-11 items-center justify-between rounded-xl border border-secondary bg-primary px-4 text-sm font-semibold text-brand-secondary hover:text-brand-secondary_hover"
                  >
                    {TYPE_META[other.type].label}에 {other.count}곳 있어요
                    <ChevronRight size={20} aria-hidden="true" className="shrink-0 text-quaternary" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {/*
            검색어만 걸려 0곳이면 필터를 탓하지 않는다(12 U1.2) — 시트에는 꺼 볼 것이 없고, 지울 것은 검색어다.
            이 버튼은 md 에서도 보인다: 펼쳐진 조건 판이 검색어를 지워 주지 않는다.
          */}
          {query && activeFilterCount === 0 && !townHasNoPlaces ? (
            <EmptyState
              Icon={SearchMd}
              // 다른 종류에 있으면 '없다' 를 이 종류로 좁힌다 — 바로 위 "식당에 1곳" 과 말이 엇갈리지 않게.
              title={`${otherTypes.length > 0 ? `${TYPE_META[type].label}에는 ` : ''}'${query}'${josa(query, '과/와')} 맞는 곳이 없어요`}
              description="띄어쓰기를 바꾸거나 더 짧게 찾아보세요."
              action={
                <Button color="primary" size="md" onClick={onClearQuery}>
                  검색 지우기
                </Button>
              }
            />
          ) : (
            <EmptyState
              Icon={SearchMd}
              title={
                townHasNoPlaces ? `${town}엔 ${withJosa(TYPE_META[type].label, '이/가')} 없어요` : '필터에 맞는 곳이 없어요'
              }
              description={
                townHasNoPlaces ? '읍면을 풀거나 필터에서 다른 읍면을 골라 보세요.' : '검색어나 필터를 바꿔 보세요.'
              }
              action={
                townHasNoPlaces ? (
                  // 이 종류에 없는 읍면은 시트에서 다른 칩을 고르기 전엔 안 풀린다 — 바로 푸는 것이 할 일이다(12 U1.6).
                  <Button color="primary" size="md" onClick={onClearTown}>
                    읍면 풀기
                  </Button>
                ) : (
                  <Button color="primary" size="md" className="md:hidden" onClick={onOpenFilters}>
                    필터 바꾸기
                  </Button>
                )
              }
            />
          )}
        </div>
      )}
    </>
  );
}
