'use client';

import { useEffect, type RefObject } from 'react';
import Link from 'next/link';
import { PLACE_TYPES, TYPE_META } from '../lib/places';
import { cx } from '../utils/cx';
import type { TPlaceType } from '../types';

type TPlacesPageTypeTabsProps = {
  type: TPlaceType;
  /** 왔던 탭의 자리. 알약이 여기서 출발한다(placesPageTypeSwitch). */
  fromIndex: number;
  /** 지금 탭의 자리. 알약이 여기로 간다. */
  toIndex: number;
  /** 알약. 스와이프(placesPageSwipe)가 손가락을 따라 직접 옮기려고 밖에서 쥔다. */
  pillRef: RefObject<HTMLSpanElement | null>;
};

/**
 * 숙소·식당·카페를 고르는 줄.
 *
 * 생김새는 탭이지만 실제로는 주소를 바꾸는 링크다.
 *
 * react-aria Tabs 에 href 를 주면 <a> 로 그려주긴 하는데, 고른 탭에 aria-controls 가
 * 붙은 채 짝이 되는 TabPanel 이 없어서 존재하지 않는 영역을 가리키게 된다.
 * 여기는 탭마다 패널이 바뀌는 게 아니라 주소 자체가 바뀌는 자리라 패널을 만들 수도 없다.
 * 그래서 그냥 링크로 두고, 현재 위치는 aria-current 로만 알린다.
 *
 * **고른 표시는 탭마다 배경을 켜고 끄지 않고, 알약 하나가 옮겨 다닌다.** 켜고 끄기로 하면
 * 옛 탭이 꺼지고 새 탭이 켜질 뿐이라 "셋이 나란히 있고 그 사이를 오간다" 는 말을 못 한다.
 * 움직이는 거리가 그 말을 대신한다.
 *
 * 알약이 미끄러지려면 출발점이 필요한데, 종류를 바꾸면 이 컴포넌트가 통째로 새로 마운트돼서
 * (placesPage 의 `key={type}`) 이전 프레임이 없다. 그래서 **렌더는 늘 도착점에 그리고**,
 * 왔던 자리에서 거기까지 오는 길만 `element.animate()` 로 따로 그린다.
 *
 * 상태를 하나 더 두어 "왔던 자리로 그렸다가 옮기는" 방법도 되지만, 그건 이펙트가 곧바로
 * 리렌더를 부르는 모양이라 이 레포의 린트가 막는다(react-hooks/set-state-in-effect).
 * 애초에 **애니메이션은 리액트가 알아야 할 상태가 아니다** — 중간 좌표는 화면에만 있으면 된다.
 */
export function PlacesPageTypeTabs({ type, fromIndex, toIndex, pillRef }: TPlacesPageTypeTabsProps) {
  useEffect(() => {
    const pill = pillRef.current;
    // 첫 진입(fromIndex === toIndex)이면 움직일 거리가 없다 — 이유 없이 흔들지 않는다.
    if (!pill || fromIndex === toIndex) return;
    // 모션을 줄이기로 한 사용자에게는 곧바로 도착점만(appTabBar 와 같은 규칙).
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const animation = pill.animate(
      [
        { transform: `translateX(${fromIndex * 100}%)` },
        { transform: `translateX(${toIndex * 100}%)` },
      ],
      // 빠르게 출발해 부드럽게 멈춘다 — 손가락이 민 것을 따라간 것처럼 보이게.
      { duration: 300, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
    );
    return () => animation.cancel();
  }, [fromIndex, toIndex, pillRef]);

  return (
    <nav aria-label="장소 종류" className="relative rounded-lg border border-secondary bg-primary p-1">
      {/*
        절대 위치의 기준은 nav 의 padding box 라, `left-1`·`inset-y-1` 이 곧 내용 영역의
        가장자리이고 `100% - (좌우 패딩)` 을 종류 수로 나눈 값이 탭 하나의 폭과 정확히 같다.
        탭이 늘어도 식은 그대로다.

        패딩을 `0.5rem` 으로 적으면 안 된다 — `p-1` 은 `--spacing` 파생이고 그 값이
        브레이크포인트에서 4 → 4.25px 로 바뀐다(ADR-006). 고정 숫자로 적으면 넓은
        화면에서만 알약이 탭과 어긋난다.
      */}
      <span
        ref={pillRef}
        aria-hidden="true"
        className="absolute inset-y-1 left-1 rounded-md bg-brand-primary"
        style={{
          width: `calc((100% - var(--spacing) * 2) / ${PLACE_TYPES.length})`,
          transform: `translateX(${toIndex * 100}%)`,
        }}
      />

      {/* 알약과 같은 층에 올려 글씨가 그 위에 오게 한다(둘 다 positioned, 뒤에 온 쪽이 위). */}
      <ul className="relative flex">
        {PLACE_TYPES.map((candidate) => {
          const active = candidate === type;
          return (
            <li key={candidate} className="flex-1">
              <Link
                href={`/places/${candidate}`}
                aria-current={active ? 'page' : undefined}
                className={cx(
                  'flex h-11 items-center justify-center rounded-md text-sm font-semibold transition-colors',
                  active ? 'text-brand-secondary' : 'text-tertiary hover:bg-secondary',
                )}
              >
                {TYPE_META[candidate].label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
