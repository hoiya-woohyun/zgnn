import { useEffect, useState } from 'react';
import { PLACE_TYPES } from '../lib/places';
import type { TPlaceType } from '../types';

/**
 * 직전에 보던 종류. **모듈 변수인 것이 요점이다.**
 *
 * 둘러보기는 종류를 바꾸면 화면을 통째로 새로 마운트한다(placesPage 의 `key={type}` — 조건을
 * 리셋하려고 일부러 그렇게 뒀다). 그래서 "어디서 왔는지" 는 어떤 컴포넌트 상태에도 남지
 * 않는다. 마운트를 넘어 살아남는 자리가 여기뿐이다.
 *
 * 주소를 새로 열면(새로고침·딥링크) 이 값은 null 이라 아무 데서도 오지 않은 것이 된다 —
 * 그때 움직이면 첫 화면이 이유 없이 흔들린다.
 */
let lastType: TPlaceType | null = null;

/**
 * 스와이프로 넘어갈 때 주소를 바꾸기 **직전에** 부른다.
 *
 * 스와이프는 놓는 순간 남은 거리를 이미 다 밀어내고(placesPageSwipe) 나서 주소를 바꾼다.
 * 그 뒤 마운트되는 화면이 "어디서 왔는지" 를 보고 또 한 번 미끄러지면 같은 이동을 두 번
 * 보게 된다. 도착점을 미리 적어 두면 새 화면은 fromIndex === toIndex 라 가만히 있는다.
 */
export function arriveBySwipe(type: TPlaceType) {
  lastType = type;
}

export type TPlaceTypeSwitch = {
  /** 왔던 탭의 자리. 첫 진입이면 지금 자리와 같다(= 움직일 거리가 0). */
  fromIndex: number;
  /** 지금 탭의 자리. */
  toIndex: number;
  /** 새 목록이 들어올 방향. 첫 진입이면 null — 들어오는 게 아니라 원래 거기 있던 것이다. */
  enterFrom: 'left' | 'right' | null;
};

/**
 * 종류 전환을 "어디서 어디로" 로 읽어 준다. 탭의 알약과 목록이 **같은 방향으로** 움직이려면
 * 둘이 같은 답을 봐야 해서, 화면에서 한 번만 부르고 결과를 내려 준다.
 *
 * `fromIndex` 를 state 의 lazy 이니셜라이저로 한 번만 붙잡는 이유: 아래 이펙트가 `lastType`
 * 을 갱신하고 나면 같은 마운트 안에서 다시 계산할 때 답이 달라진다. 이 마운트가 "어디서
 * 왔는지" 는 마운트되는 순간에만 알 수 있는 사실이다.
 */
export function usePlaceTypeSwitch(type: TPlaceType): TPlaceTypeSwitch {
  const toIndex = PLACE_TYPES.indexOf(type);
  const [fromIndex] = useState(() => (lastType === null ? toIndex : PLACE_TYPES.indexOf(lastType)));

  useEffect(() => {
    lastType = type;
  }, [type]);

  return {
    fromIndex,
    toIndex,
    enterFrom: fromIndex === toIndex ? null : fromIndex < toIndex ? 'right' : 'left',
  };
}
