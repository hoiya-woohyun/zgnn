'use client';

import { SearchMd } from '@untitledui/icons';
import { PlaceCard } from '../components/placeCard';
import { EmptyState } from '../components/layout/emptyState';
import { Button } from '../components/base/button';
import { TYPE_META, type TPlaceEntry } from '../lib/places';
import type { TPlaceType } from '../types';

type TPlacesPageResultsProps = {
  type: TPlaceType;
  town: string | null;
  results: TPlaceEntry[];
  /** 이 종류에 그 읍면 자체가 없다(조건과 무관하게 0곳). 전용 빈 상태를 보여준다. */
  townHasNoPlaces: boolean;
  hasFilters: boolean;
  onResetFilters: () => void;
  /** 모바일 필터 시트를 연다. 빈 상태의 버튼이 쓴다 — md 부터는 조건 판이 펼쳐져 있어 버튼 자체를 숨긴다. */
  onOpenFilters: () => void;
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
  onResetFilters,
  onOpenFilters,
}: TPlacesPageResultsProps) {
  return (
    <>
      <div className="flex items-center justify-between px-4 pt-4 md:px-6">
        <div>
          <p className="text-sm text-tertiary">{results.length}곳</p>
          {/* 조건을 여러 개 겹쳐 0~1곳만 남았을 때 "왜 이렇게 적지" 하고 이탈하지 않도록
              조건을 하나 풀어보라고 먼저 알려준다(2026-09-15 리뷰 §1 — 세 필터 켜면 0~1곳 안내 없음). */}
          {hasFilters && results.length === 1 && (
            <p className="mt-0.5 text-xs text-tertiary">필터를 하나 풀어 보면 더 볼 수 있어요.</p>
          )}
        </div>
        {hasFilters && (
          <Button color="link-color" size="sm" className="min-h-11" onClick={onResetFilters}>
            필터 지우기
          </Button>
        )}
      </div>

      {results.length > 0 ? (
        <ul className="mt-3 space-y-3 px-4 md:px-6">
          {results.map((place) => (
            <PlaceCard key={place.id} place={place} />
          ))}
        </ul>
      ) : (
        /*
          빈 상태의 버튼은 필터를 *지우지* 않고 *열어* 준다. "다른 읍면을 골라 보세요" 라고
          써 놓고 버튼이 읍면을 지우기만 하면 글과 동작이 반대를 말한다. 전부 지우는 길은
          위의 "필터 지우기" 링크가 그대로 맡는다.
        */
        <div className="px-4 pt-6 md:px-6">
          <EmptyState
            Icon={SearchMd}
            title={
              townHasNoPlaces ? `${town}엔 ${TYPE_META[type].label}가 없어요` : '필터에 맞는 곳이 없어요'
            }
            description={
              townHasNoPlaces ? '필터에서 다른 읍면을 골라 보세요.' : '검색어나 필터를 바꿔 보세요.'
            }
            action={
              <Button color="primary" size="md" className="md:hidden" onClick={onOpenFilters}>
                필터 바꾸기
              </Button>
            }
          />
        </div>
      )}
    </>
  );
}
