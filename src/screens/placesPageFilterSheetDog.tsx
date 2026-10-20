'use client';

import { useId } from 'react';
import { Switch as AriaSwitch } from 'react-aria-components';
import { SegmentedControl } from '../components/segmentedControl';
import { PLACES_PAGE_DOG_STEPS, type TPlacesPageDogStep } from '../lib/placesPageDogStep';
import { cx } from '../utils/cx';
import type { TPlaceType } from '../types';

type TPlacesPageFilterSheetDogProps = {
  type: TPlaceType;
  /** 섹션 제목 — 한 마리면 '두부 기준', 여럿이면 '우리 강아지 기준'(부르는 쪽이 이름을 고른다). */
  title: string;
  step: TPlacesPageDogStep;
  onChangeStep: (step: TPlacesPageDogStep) => void;
  needsIndoor: boolean;
  onToggleNeedsIndoor: () => void;
};

/**
 * 필터 시트의 강아지 기준(22 D-6) — 프로필이 있을 때만(부르는 쪽이 가른다). 맨 위다(14 W261006.13 — 대형견 보호자의 핵심 스위치가 스크롤 밑에 있었다).
 *
 * '갈 수 있는 곳만' · '어려운 곳 숨기기' 두 칩은 한 축이었다 — 둘 다 켠 상태는 '갈 수 있는 곳만' 과 같은 목록이라 쓸모없는 조합이 칩 둘로 보였다.
 * 그래서 세 단계 세그먼트 하나로 고른다(`lib/placesPageDogStep` — 걸러 내기는 그대로 두 플래그다). 제목이 강아지 이름이라 이 기준이 누구의 것인지 말한다.
 *
 * '실내 자리 필요' 는 다른 축이다 — 곳을 빼지 않고 판정을 바꾼다(야외 자리만 되는 곳이 어려움이 된다). 켜고 끄는 불리언이라 스위치 줄(식당·카페만 —
 * 숙소 판정엔 실내외 구분이 없다). 설명 두 줄(14 W261019.1 — 방식이 아니라 결과를 말한다)은 그대로 스위치에 딸린다.
 */
export function PlacesPageFilterSheetDog({ type, title, step, onChangeStep, needsIndoor, onToggleNeedsIndoor }: TPlacesPageFilterSheetDogProps) {
  const indoorHintId = useId();

  return (
    <section aria-label={title}>
      <h3 className="text-md font-bold text-primary">{title}</h3>
      <SegmentedControl className="mt-3" label={title} options={PLACES_PAGE_DOG_STEPS} value={step} onChange={onChangeStep} />

      {type !== 'stay' && (
        <>
          <AriaSwitch
            isSelected={needsIndoor}
            onChange={onToggleNeedsIndoor}
            aria-describedby={indoorHintId}
            className="mt-2 flex min-h-11 cursor-pointer items-center justify-between gap-3"
          >
            {({ isSelected, isFocusVisible }) => (
              <>
                <span className="text-md text-primary">실내 자리 필요</span>
                <span
                  aria-hidden="true"
                  className={cx(
                    'h-6 w-11 shrink-0 rounded-full p-0.5 transition-colors',
                    isSelected ? 'bg-brand-solid' : 'bg-quaternary',
                    isFocusVisible && 'outline-2 outline-offset-2 outline-focus-ring',
                  )}
                >
                  <span
                    className={cx(
                      'block size-5 rounded-full bg-fg-white shadow-sm transition-transform motion-reduce:transition-none',
                      isSelected && 'translate-x-5',
                    )}
                  />
                </span>
              </>
            )}
          </AriaSwitch>
          {/*
            결과를 말한다 — 바뀌는 이름은 목록 머리 판정 셈 줄의 이름('야외' 가 사라지고 '어려움' · C12 의 '확인 필요' 가 는다)과 같다(14 W261019.1).
            둘째 줄은 "실내까지 같이 갈 곳" 을 찾는 길 — 켠 채 '가능' 으로 남는 곳은 원문이 실내를 받고 이 아이의 이동 수단으로 들 수 있는 곳뿐이다.
            '실내 동반 OK' 는 강아지를 안 보고 원문으로만 남겨, 수단 없는 아이에게 '어려움' 인 케이지 필수 곳도 남는다.
          */}
          <div id={indoorHintId} className="space-y-0.5 text-sm text-tertiary">
            <p>켜면 야외 자리만 되는 곳은 ‘어려움’, 실내 얘기가 없는 곳은 ‘확인 필요’가 돼요. 앱 전체에 남아요.</p>
            <p>실내까지 같이 갈 곳만 보려면 위에서 ‘갈 수 있는 곳만’을 골라요. 아래 ‘실내 동반 OK’는 강아지와 상관없이 걸러요.</p>
          </div>
        </>
      )}
    </section>
  );
}
