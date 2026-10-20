import { PlacesPageFilterSheetDog } from './placesPageFilterSheetDog';
import { PlacesPageFilterSheetChecks } from './placesPageFilterSheetChecks';
import { PlacesPageFilterSheetRegion } from './placesPageFilterSheetRegion';
import { BottomSheet } from '../components/base/bottom-sheet';
import { RefreshCw01 } from '@untitledui/icons';
import { cx } from '../utils/cx';
import type { TAreaId } from '../lib/areaGroups';
import type { TPlacesPageDogStep } from '../lib/placesPageDogStep';
import { PET_FILTERS, envFiltersWithData, type TPetFilterKey } from '../lib/placeFilters';
import { placesOfType } from '../lib/places';
import type { TDirection, TPlaceType } from '../types';

type TPlacesPageFilterSheetProps = {
  /** 열림 상태는 placesPage 가 가진다 — 목록의 빈 상태 버튼도 이 시트를 열어야 해서다. */
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  type: TPlaceType;
  town: string | null;
  /** 홈 동네 카드가 건 권역 — 시트에 고르는 자리는 없고 읍면 묶음 밑 한 줄이 말한다(14 W261010.33f). */
  area: TAreaId | null;
  directions: TDirection[];
  petKeys: TPetFilterKey[];
  onSelectTown: (town: string | null) => void;
  onToggleDirection: (direction: TDirection) => void;
  onTogglePetKey: (key: TPetFilterKey) => void;
  /** 강아지 기준은 프로필이 있을 때만 있다. 없으면 이 값이 null 이다. */
  eligibility: {
    /** 섹션 제목 — '두부 기준' · 여럿이면 '우리 강아지 기준'. */
    title: string;
    /** 전부 · 어려운 곳 빼고 · 갈 수 있는 곳만(22 D-6) — '갈 수 있는 곳만' 은 홈 동네 카드가 거는 것과 같은 스토어 값(14 W261013.14d). */
    step: TPlacesPageDogStep;
    onChangeStep: (step: TPlacesPageDogStep) => void;
    needsIndoor: boolean;
    onToggleNeedsIndoor: () => void;
  } | null;
  /** 켜져 있는 필터 개수 — 0 이면 푸터 '초기화' 가 흐리다. 닫아 둔 채의 숫자는 칩 줄의 필터 칩이 말한다(`placesPageChipRow`). */
  activeCount: number;
  /** 지금 조건(검색어 포함)으로 목록에 남는 곳 수 — 하단 "N곳 보기" 버튼에 싣는다. 0 이면 버튼이 눌리지 않는다. */
  resultCount: number;
  /** 시트 안 필터만 푼다(검색어·정렬은 그대로 — 둘 다 시트 밖에 보인다, 14 W261019.13a). 시트는 열린 채다. */
  onReset: () => void;
};

/**
 * 모바일 필터 시트.
 *
 * 조건이 여러 줄(판정·읍면·방향·원문 조건, 숙소는 환경까지)이라 고정 영역이 첫 화면의 절반을 먹고
 * 정작 목록은 두어 장만 보였다. 모바일에서는 그 줄들을 이 시트로 접고, 여는 것은 검색칸 밑 칩 줄의 '필터' 칩이다(22 D-2).
 * 데스크톱은 세로가 넉넉해 접을 이유가 없으므로 지금처럼 펼쳐 둔다(placesPage 가 가른다).
 * 정렬은 여기 없다 — 모바일은 칩 줄의 '정렬 ▾' 칩이 지금 순서를 말하고 정렬 시트를 연다(22 D-3).
 *
 * "적용" 버튼을 두지 않고 누르는 즉시 반영한다 — 읍면은 이미 스토어에 바로 쓰이고
 * 종류를 바꾸면 조건이 통째로 리셋되는 구조라(placesPage 의 `key={type}`), 초안 상태를
 * 하나 더 끼우면 그 두 가지가 서로 어긋난다. 뒤에서 목록이 같이 움직이는 편이
 * 조건을 하나씩 풀어 보기에도 낫다.
 */
/** 숙소에서 고를 수 있는 환경 조건 — 데이터는 빌드 때 고정이라 한 번만 센다. */
const STAY_ENV_FILTERS = envFiltersWithData(placesOfType('stay'));

export function PlacesPageFilterSheet({
  isOpen,
  onOpenChange,
  type,
  town,
  area,
  directions,
  petKeys,
  onSelectTown,
  onToggleDirection,
  onTogglePetKey,
  eligibility,
  activeCount,
  resultCount,
  onReset,
}: TPlacesPageFilterSheetProps) {
  return (
    <>
      {/* 손잡이 띠만이 아니라 본문을 끌어내려도 닫힌다 — 조건 줄이 맨 위일 때만(14 W261010.33k, base 의 `pullFromBody`).
          제목은 base 의 `title` — 닫기 단추와 같은 줄이다(22 D-9). */}
      <BottomSheet isOpen={isOpen} onOpenChange={onOpenChange} label="필터 고르기" title="필터" pullFromBody>
        {/*
          시트 전체를 세로 flex 로 묶고 **가운데 조건 줄만** 스크롤시킨다 — 결과 버튼은 늘 같은 자리다.
          예전엔 조건 묶음 하나에 높이를 걸어 마지막 조건이 칩 한가운데가 잘린 채 멈췄다(잘린 게 아니라 원래 그런 줄로 읽혔다).
          `flex-1 min-h-0` 이 요점이다 — flex 자식은 기본 `min-height:auto` 라 내용보다 작아지지 않아 스크롤이 안 생긴다.
        */}
        <div className="-mb-1 flex max-h-[80dvh] flex-col">
          <div
            className={cx(
              // 섹션 사이 전폭 1px 선(22 D-9) — 판의 좌우 여백까지 번져(-mx-4) 시트 끝에서 끝까지 긋는다. 섹션마다 위아래 20px.
              '-mx-4 min-h-0 flex-1 divide-y divide-secondary overflow-y-auto pb-1',
              // 스크롤 줄 끝을 살짝 흐려 "아래 더 있다" 를 알린다 — 가로 칩 줄의 끝 흐림(SCROLL_ROW_CLASS)의 세로판이다.
              '[mask-image:linear-gradient(to_bottom,black_calc(100%-1.5rem),transparent)]',
              '[-webkit-mask-image:linear-gradient(to_bottom,black_calc(100%-1.5rem),transparent)]',
            )}
          >
            {/* 강아지 기준이 **맨 위**다(14 W261006.13) — 맨 아래에선 시트 높이에 따라 반쯤 잘려 대형견 보호자의 핵심 스위치가 스크롤해야 보였다. */}
            {eligibility && (
              <div className="px-4 py-5">
                <PlacesPageFilterSheetDog
                  type={type}
                  title={eligibility.title}
                  step={eligibility.step}
                  onChangeStep={eligibility.onChangeStep}
                  needsIndoor={eligibility.needsIndoor}
                  onToggleNeedsIndoor={eligibility.onToggleNeedsIndoor}
                />
              </div>
            )}
            <div className="px-4 py-5">
              <PlacesPageFilterSheetRegion
                type={type}
                town={town}
                area={area}
                directions={directions}
                onSelectTown={onSelectTown}
                onToggleDirection={onToggleDirection}
              />
            </div>
            {/*
              원문에 **적힌 것**으로 거른다 — 판정과 축이 다르다(14 W261007.7): 두 마리로 '2마리 이상' 을 켜면 마릿수가 원문에 없어 막지 않은
              '갈 수 있어요' 숙소도 빠진다. 그래서 이 섹션만 설명 한 줄을 남긴다(22 D-8 — 두 문장이던 것을 한 줄로).
            */}
            <div className="px-4 py-5">
              <PlacesPageFilterSheetChecks
                title="원문에 적힌 조건"
                hint="글에 적힌 곳만 남아요"
                filters={PET_FILTERS[type]}
                petKeys={petKeys}
                onToggle={onTogglePetKey}
              />
            </div>
            {/* 숙소 환경(10 F6) — 판정(갈 수 있나)이 아니라 선호라 원문 조건과 다른 섹션이다. 데이터에 걸리는 곳이 있는 것만 선다. */}
            {type === 'stay' && STAY_ENV_FILTERS.length > 0 && (
              <div className="px-4 py-5">
                <PlacesPageFilterSheetChecks title="숙소 환경" filters={STAY_ENV_FILTERS} petKeys={petKeys} onToggle={onTogglePetKey} />
              </div>
            )}
          </div>

          {/*
            푸터(22 D-9): 왼쪽 '초기화'(테두리) + 오른쪽 결과 버튼 "N곳 보기". 실서비스 4/4 의 짝이다.

            조건은 누르는 즉시 반영된다(위 설명) — 결과 버튼은 **닫기만** 하고, 지금 몇 곳이 남는지를 실어 누를 때마다 숫자가 움직이게 한다(D7).
            0곳이면 누를 것이 없다고 말한다('조건에 맞는 곳이 없어요' · 눌리지 않음) — 닫기는 X·끌어내리기다.
            버튼 위 판정 셈 줄("가능 23 · 확인 필요 4 · …")은 걷었다 — 같은 말을 목록 머리가 한다. 그 줄이 보이던 '실내 자리 필요' 의 결과(곳 수는 그대로,
            판정만 바뀐다 — 14 W261013.8)는 스위치 밑 설명 두 줄이 말로 대신한다.

            '초기화' 는 시트를 닫지 않는다 — 전엔 '모두 지우기' 가 조건이 0 이 되며 손가락 밑에서 사라져 닫기까지 했는데, 이제는 그 자리에 흐린 채 남는다
            (`aria-disabled` — `disabled` 면 누른 단추가 포커스를 잃는다). 검색어·정렬·권역은 건드리지 않는다(시트 밖에 보인다, 14 W261019.13a).

            스크롤 줄 **밖**(세로 flex 의 마지막 칸)이라 늘 같은 자리다 — `fixed` 가 아니라 시트 안의 자리다(스와이프 중 어긋남, ADR-014).
          */}
          <div className="-mx-4 flex shrink-0 items-center gap-3 border-t border-secondary px-4 pt-3">
            <button
              type="button"
              aria-disabled={activeCount === 0}
              data-ev="places.sheetReset"
              onClick={() => {
                if (activeCount > 0) onReset();
              }}
              className={cx(
                'inline-flex h-12 w-24 shrink-0 items-center justify-center gap-1 rounded-lg border text-md font-semibold',
                activeCount > 0
                  ? 'cursor-pointer border-primary text-secondary hover:bg-tertiary active:bg-tertiary'
                  : 'cursor-default border-secondary text-quaternary',
              )}
            >
              <RefreshCw01 aria-hidden="true" className="size-4 text-fg-quaternary" />
              초기화
            </button>
            <button
              type="button"
              disabled={resultCount === 0}
              onClick={() => onOpenChange(false)}
              className={cx(
                'h-12 min-w-0 flex-1 rounded-lg text-md font-semibold',
                resultCount > 0 ? 'cursor-pointer bg-brand-solid text-primary_on-brand hover:bg-brand-solid_hover' : 'bg-tertiary text-quaternary',
              )}
            >
              {resultCount > 0 ? `${resultCount}곳 보기` : '조건에 맞는 곳이 없어요'}
            </button>
          </div>
        </div>
      </BottomSheet>
    </>
  );
}
