import { PlacesPageFilterSheetDog } from './placesPageFilterSheetDog';
import { PlacesPageFilters } from './placesPageFilters';
import { BottomSheet } from '../components/base/bottom-sheet';
import { Button } from '../components/base/button';
import { cx } from '../utils/cx';
import type { TAreaId } from '../lib/areaGroups';
import type { TPlacesPageDogStep } from '../lib/placesPageDogStep';
import type { TPetFilterKey } from '../lib/placeFilters';
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
    /** 남는 곳의 판정 셈("가능 20" 조각들, `levelCountParts`) — 하단 버튼 위 한 줄. */
    levelParts: string[];
  } | null;
  /** 켜져 있는 필터 개수 — '모두 지우기' 를 세울지. 닫아 둔 채의 숫자는 칩 줄의 필터 칩이 말한다(`placesPageChipRow`). */
  activeCount: number;
  /** 지금 조건(검색어 포함)으로 목록에 남는 곳 수 — 하단 "N곳 보기" 버튼에 싣는다. */
  resultCount: number;
  /** 시트 안 필터만 푼다(검색어·정렬은 그대로 — 둘 다 시트 밖에 보인다, 14 W261019.13a). 누르면 시트도 함께 닫힌다. */
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
      {/* 손잡이 띠만이 아니라 본문을 끌어내려도 닫힌다 — 조건 줄이 맨 위일 때만(14 W261010.33k, base 의 `pullFromBody`). */}
      <BottomSheet isOpen={isOpen} onOpenChange={onOpenChange} label="필터 고르기" pullFromBody>
        {/*
          시트 전체를 세로 flex 로 묶고 **가운데 조건 줄만** 스크롤시킨다.

          예전에는 조건 묶음 하나에 `max-h-[70dvh] overflow-y-auto` 를 걸었다. 그 높이는
          제목·"필터 모두 지우기" 줄·시트 안쪽 여백을 세지 않은 값이라, 실제 시트는 화면의
          84% 를 차지하면서 정작 마지막 조건("우리 강아지 기준")은 **칩 한가운데가 잘린 채**
          멈췄다. 잘린 높이가 18px 뿐이라 스크롤바도 안 보이고, 잘린 게 아니라 원래 그런
          줄로 읽힌다 — 필터가 고장 난 것처럼 보이는 자리였다.

          `flex-1 min-h-0` 이 요점이다. flex 자식은 기본 `min-height:auto` 라 내용보다 작아지지
          않는데, 그러면 아무리 바깥을 묶어도 스크롤이 안 생기고 밖으로 삐져나간다.
        */}
        <div className="flex max-h-[80dvh] flex-col">
          {/* 닫기 버튼(오른쪽 위)과 겹치지 않게 제목 줄만 오른쪽을 비운다. */}
          <h2 className="shrink-0 pt-2 pr-10 text-md font-bold text-primary">필터</h2>

          <div
            className={cx(
              'mt-4 min-h-0 flex-1 space-y-5 overflow-y-auto',
              // 스크롤 줄 끝을 살짝 흐려 "아래 더 있다" 를 알린다 — 가로 조건 줄이 쓰는
              // 것과 같은 장치의 세로판이다(placesPageFilters 의 SCROLL_ROW_CLASS).
              // 아래 여백을 마스크 시작점보다 넓게 잡아 마지막 칩은 마스크 밖에 남긴다.
              'pb-6',
              '[mask-image:linear-gradient(to_bottom,black_calc(100%-1.5rem),transparent)]',
              '[-webkit-mask-image:linear-gradient(to_bottom,black_calc(100%-1.5rem),transparent)]',
            )}
          >
            {/* 우리 강아지 기준이 **맨 위**다(14 W261006.13) — 맨 아래에선 시트 높이에 따라 반쯤 잘려, 대형견 보호자의
                핵심 스위치("어려운 곳 숨기기")가 스크롤해야 보였다. 읍면·조건 칩은 그 아래에서 좁힌다.
                '갈 수 있는 곳만' 도 여기 있다(14 W261013.14d) — 없을 때는 4곳만 보는 길이 홈 히어로 숫자뿐이었다. */}
            {eligibility && (
              <PlacesPageFilterSheetDog
                type={type}
                title={eligibility.title}
                step={eligibility.step}
                onChangeStep={eligibility.onChangeStep}
                needsIndoor={eligibility.needsIndoor}
                onToggleNeedsIndoor={eligibility.onToggleNeedsIndoor}
              />
            )}
            <PlacesPageFilters
              variant="sheet"
              type={type}
              town={town}
              area={area}
              directions={directions}
              petKeys={petKeys}
              onSelectTown={onSelectTown}
              onToggleDirection={onToggleDirection}
              onTogglePetKey={onTogglePetKey}
            />
          </div>

          {/*
            하단 줄: 주 버튼 "N곳 보기" + 보조 "모두 지우기".

            조건은 여전히 누르는 즉시 반영된다(위 설명) — 주 버튼은 **닫기만** 한다. 다만 시트가
            목록을 덮고 있어 뒤에서 목록이 바뀌는 게 안 보였고, 즉시 반영이 "아무 일도 안 일어남"
            으로 읽혔다(D7). 지금 몇 곳이 남는지를 버튼에 실어 칩을 누를 때마다 숫자가 움직이게 한다.

            스크롤 줄 **밖**(세로 flex 의 마지막 칸)이라 조건을 아무리 내려도 늘 같은 자리에 있다 —
            `fixed` 가 아니라 시트 안의 자리다(스와이프 중 어긋남, ADR-014).

            "모두 지우기" 는 누르면 시트를 함께 닫는다. 닫지 않으면 조건이 0이 되면서 이 버튼이
            손가락 밑에서 사라지고, 시트만 그대로 남아 아무 일도 안 일어난 것처럼 보인다.
          */}
          {/*
            남는 곳의 판정 셈 — 목록 머리와 같은 조각(`levelCountParts`). '실내 자리 필요' 는 곳을 빼지 않고 판정만 바꿔서
            버튼 수가 그대로였고 눌러도 아무 일이 없어 보였다(14 W261013.8). 수는 그대로여도 여기 "가능" 이 움직인다.
          */}
          {eligibility && eligibility.levelParts.length > 0 && (
            <p className="shrink-0 border-t border-secondary pt-3 text-sm text-tertiary">{eligibility.levelParts.join(' · ')}</p>
          )}
          <div
            className={cx(
              'flex shrink-0 items-center gap-3',
              eligibility && eligibility.levelParts.length > 0 ? 'pt-2' : 'border-t border-secondary pt-3',
            )}
          >
            {activeCount > 0 && (
              <Button
                color="link-color"
                size="md"
                className="min-h-11 shrink-0"
                onClick={() => {
                  onReset();
                  onOpenChange(false);
                }}
              >
                모두 지우기
              </Button>
            )}
            <Button size="lg" color="primary" className="h-11 flex-1" onClick={() => onOpenChange(false)}>
              {resultCount}곳 보기
            </Button>
          </div>
        </div>
      </BottomSheet>
    </>
  );
}
