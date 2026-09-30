'use client';

import { TYPE_LABEL } from '../lib/adminCandidates';
import { isPlaceType, TYPE_COLOR, typeTint } from '../lib/places';
import { cx } from '../utils/cx';

/**
 * 종류 칩(숙소·식당·카페·기타) — 두 표('확인할 장소'·'올린 장소')가 같은 것을 쓴다.
 *
 * **맨 뒤의 자기 열에 선다**(2026-09-30). 그 전에는 이름 앞이었고, 그 전에는 이름 뒤였다. 지키려는 것은
 * 내내 같다 — 종류가 줄마다 같은 가로 위치에서 시작해야 세로로 훑을 수 있고, 이 화면에서 그 훑기가 곧 일이다
 * (`adminTable.tsx` 머리 주석). 이름 앞은 그것을 대체로 지켰고(칩 폭이 고정이라), 자기 열은 이름 길이와
 * 아예 무관해져 완전히 지킨다. 걸러 보기 칩(`adminPage.tsx` 의 `TYPE_FILTERS`)이 같은 축을 좁히는 손잡이다.
 *
 * 열이 생긴 뒤에도 **폭을 못 박는다**(`min-w-9`). 라벨이 전부 두 글자라 자연히 비슷하지만, 그것에 기대면
 * 모르는 종류 문자열 하나가 들어온 줄에서 칩이 열 밖으로 번진다. 늘어나는 것은 허용하고
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
