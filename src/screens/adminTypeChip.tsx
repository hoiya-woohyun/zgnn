'use client';

import { TYPE_LABEL } from '../lib/adminCandidates';
import { isPlaceType, TYPE_COLOR, typeTint } from '../lib/places';
import { cx } from '../utils/cx';

/**
 * 종류 칩(숙소·식당·카페·기타) — 두 표('확인할 장소'·'올린 장소')가 같은 것을 쓴다.
 *
 * **이름 앞에 선다.** 예전에는 이름 뒤였는데, 그러면 종류가 이름 길이에 따라 줄마다 다른 가로 위치에서
 * 시작해 세로로 훑을 수가 없다 — 이 화면에서 그 훑기가 곧 일이다(`adminTable.tsx` 머리 주석).
 *
 * 그래서 **폭을 못 박는다**(`min-w-9`). 라벨이 전부 두 글자라 자연히 비슷하지만, 그것에 기대면
 * 모르는 종류 문자열 하나가 들어온 줄에서 이름이 밀려 열이 어긋난다. 늘어나는 것은 허용하고
 * (그 줄만 밀린다) 줄어드는 것은 막는다.
 *
 * 색은 `src/lib/places.ts` 의 종류 색이다 — 지도 마커와 같은 값을 쓴다(CLAUDE.md 의 "두 곳에 같은 값").
 */
export function AdminTypeChip({ type }: { type: string }) {
  const tone = isPlaceType(type) ? { background: typeTint(type, 14), color: TYPE_COLOR[type] } : undefined;
  return (
    <span
      className={cx(
        'min-w-9 shrink-0 rounded px-1.5 text-center text-xs font-semibold',
        !tone && 'bg-secondary text-tertiary',
      )}
      style={tone}
    >
      {isPlaceType(type) ? TYPE_LABEL[type] : type}
    </span>
  );
}
