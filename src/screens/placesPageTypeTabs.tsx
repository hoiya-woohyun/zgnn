'use client';

import { useEffect, useRef, type MouseEvent, type RefObject } from 'react';
import Link from 'next/link';
import { PLACE_TYPES, TYPE_META } from '../lib/places';
import { markPillFocus, takePillFocus } from '../lib/placesPageTypePillFocus';
import { cx } from '../utils/cx';
import type { TPlaceType } from '../types';

type TPlacesPageTypeTabsProps = {
  type: TPlaceType;
  /** 왔던 탭의 자리. 밑줄이 여기서 출발한다(placesPageTypeSwitch). */
  fromIndex: number;
  /** 지금 탭의 자리. 밑줄이 여기로 간다. */
  toIndex: number;
  /** 밑줄(옛 알약 — 이름은 그대로). 스와이프(placesPageSwipe)가 손가락을 따라 직접 옮기려고 밖에서 쥔다. */
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
 * **고른 표시는 탭마다 켜고 끄지 않고, 밑줄 하나가 옮겨 다닌다**(22 D-1 전에는 틴트 알약 — 그래서 이름이 `pillRef` 다).
 * 켜고 끄기로 하면 옛 탭이 꺼지고 새 탭이 켜질 뿐이라 "셋이 나란히 있고 그 사이를 오간다" 는 말을 못 한다.
 * 움직이는 거리가 그 말을 대신한다.
 *
 * 밑줄이 미끄러지려면 출발점이 필요한데, 종류를 바꾸면 이 컴포넌트가 통째로 새로 마운트돼서
 * (placesPage 의 `key={type}`) 이전 프레임이 없다. 그래서 **렌더는 늘 도착점에 그리고**,
 * 왔던 자리에서 거기까지 오는 길만 `element.animate()` 로 따로 그린다.
 *
 * 상태를 하나 더 두어 "왔던 자리로 그렸다가 옮기는" 방법도 되지만, 그건 이펙트가 곧바로
 * 리렌더를 부르는 모양이라 이 레포의 린트가 막는다(react-hooks/set-state-in-effect).
 * 애초에 **애니메이션은 리액트가 알아야 할 상태가 아니다** — 중간 좌표는 화면에만 있으면 된다.
 *
 * **알약을 눌러 온 전환만** 새로 고른 알약에 포커스를 둔다. 줄이 통째로 새로 마운트돼 누른 링크가 포커스와 함께 사라지는데,
 * 그냥 두면 셸이 h1 에 둔다(appShellFocus) — 탭 패턴에서는 고른 탭에 남는 쪽이 자연스럽다. 누르는 쪽이 표식을 남기고
 * (lib/placesPageTypePillFocus) 새 마운트가 그것을 읽으므로 스와이프·탭바·딥링크로 온 마운트는 셸의 몫 그대로다.
 * 셸의 포커스 effect 는 부모라 이 effect 뒤에 돌고, 화면이 먼저 옮겼으면 비킨다. 링은 `:focus-visible` 휴리스틱이 정한다
 * (키보드로 눌렀을 때만 그려진다).
 */
export function PlacesPageTypeTabs({ type, fromIndex, toIndex, pillRef }: TPlacesPageTypeTabsProps) {
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!takePillFocus(type)) return;
    navRef.current?.querySelector<HTMLElement>('a[aria-current="page"]')?.focus({ preventScroll: true });
  }, [type]);

  const markOnActivate = (candidate: (typeof PLACE_TYPES)[number]) => (event: MouseEvent) => {
    // 새 탭·창으로 여는 클릭(수정키·가운데 버튼)은 이 화면을 떠나지 않는다.
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (candidate !== type) markPillFocus(candidate);
  };

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
    /*
      **크림 위 전폭 탭 줄 + 밑줄 하나**(22 D-1). 흰 상자 안에서 핑크 틴트 알약이 미끄러지는 세그먼트는 형제 종류를 바꾸는 실서비스 어디에도 없었다
      (직접 본 8곳 중 0 — 같은 화면에서 종류를 바꾸는 곳은 글자 탭 + 2px 밑줄, 22 · design-audit 레퍼런스). 줄의 선은 머리 좌우 여백까지 번져
      화면 끝에서 끝까지 간다(`-mx-4 px-4`) — 칸 밑에서만 끊기면 선이 아니라 칸 장식으로 읽힌다.

      칸은 폭이 같은 셋이다 — md 부터는 칸을 120px(`w-30`)에서 멈추고 왼쪽에 붙인다(넓은 본문에서 세 글자가 멀리 흩어지지 않게).
      글자는 켜짐·꺼짐 모두 16px/600 고정이다 — 굵기가 바뀌면 끄는 동안 글자 폭이 흔들린다. 켜짐은 잉크(`text-primary`), 꺼짐은 `text-tertiary`.
    */
    <nav ref={navRef} aria-label="장소 종류" className="-mx-4 border-b border-secondary px-4 md:-mx-6 md:px-6">
      {/*
        밑줄의 기준 상자. 칸 셋을 딱 감싸므로(md 에선 `w-fit` 으로 칸 셋의 폭) 밑줄 폭 `100% / 종류 수` 가 늘 칸 하나의 폭이다 —
        스와이프(placesPageSwipe)가 `translateX(i×100%)` 로 밀 때 100% 가 곧 칸 하나다. md 의 칸 상한을 밑줄의 인라인 폭으로
        따라 적으면 클래스가 인라인 스타일을 못 이겨서, 상자 쪽을 줄였다.
      */}
      <div className="relative md:w-fit">
        <ul className="flex">
          {PLACE_TYPES.map((candidate) => {
            const active = candidate === type;
            return (
              <li key={candidate} className="flex-1 md:w-30 md:flex-none">
                <Link
                  href={`/places/${candidate}`}
                  aria-current={active ? 'page' : undefined}
                  onClick={markOnActivate(candidate)}
                  className={cx(
                    'flex h-11 items-center justify-center text-md transition-colors active:bg-tertiary focus-visible:-outline-offset-2',
                    active ? 'font-semibold text-primary' : 'text-tertiary hover:text-secondary',
                  )}
                >
                  {TYPE_META[candidate].label}
                </Link>
              </li>
            );
          })}
        </ul>

        {/*
          고른 표시 — 탭마다 켜고 끄지 않고 **밑줄 하나가 옮겨 다닌다**(아래 설명). 줄의 1px 선 위에 2px 로 앉는다(`-bottom-px`).
          색은 잉크다 — 이 화면은 탭바·지도 버튼·'갈 수 있어요' 점이 이미 핑크라, 표시까지 핑크면 어느 것이 지금 자리인지 묻혀 버린다.
        */}
        <span
          ref={pillRef}
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-px left-0 h-0.5 bg-primary-solid"
          style={{
            width: `calc(100% / ${PLACE_TYPES.length})`,
            transform: `translateX(${toIndex * 100}%)`,
          }}
        />
      </div>
    </nav>
  );
}
