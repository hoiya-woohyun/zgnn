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
 * '실내 자리 필요' 는 다른 축이다 — 곳을 빼지 않고 판정을 바꾸는 **설정**이다(몸무게처럼 앱 전체 판정 입력, 22 A·B review R-2). 그래서 필터 칩이 아니라 스위치 줄이고
 * (식당·카페만 — 숙소 판정엔 실내외 구분이 없다) 어느 초기화도 끄지 않는다. 설명은 한 줄, 결과만 말한다(14 W261019.1 — 방식을 적으면 못 읽었다).
 * 다른 조건을 가리키는 문장('갈 수 있는 곳만도 골라요' · '실내 동반 OK 는 …')은 걷었다 — 설정 밑에서 필터 사용법을 말하면 둘이 한 축으로 읽힌다.
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
          {/* 한 줄(390 에서 줄바꿈 없음). '어디서나' 가 이 값이 앱 전체에 남는다는 것을 대신한다 — 지도·상세·저장한 곳 판정도 이 값을 본다. */}
          <p id={indoorHintId} className="text-sm text-tertiary">
            야외만 되는 곳은 어디서나 어려움으로 봐요
          </p>
        </>
      )}
    </section>
  );
}
