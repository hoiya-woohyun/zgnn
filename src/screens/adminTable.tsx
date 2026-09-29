'use client';

import { cx } from '../utils/cx';

/**
 * 검수 화면의 두 표가 쓰는 열 규격. **머리글과 줄이 같은 상수를 본다.**
 *
 * 표를 `<table>` 로 짜지 않는 이유: 줄 하나가 펼쳐지면 그 안에 결정 패널·반려 폼이 통째로 들어온다
 * (`adminPageGroupCard`·`adminPagePlaceRow`). `<tr>` 안에 그것을 넣으려면 `colSpan` 짜리 둘째 행이
 * 필요하고, 그러면 "줄 하나 = 요소 하나" 가 깨져 `done` 한 줄·오류 한 줄이 갈 자리가 사라진다.
 * `<ul>` + grid 는 그 구조를 그대로 두고 열만 맞춘다.
 *
 * **`md` 미만에서는 grid 를 켜지 않는다.** 셸의 스와이프 표면이 `overflow-x-clip` 이라 폭을 넘긴 표는
 * 가로 스크롤 없이 그냥 잘린다 — 폰에서는 지금처럼 세로로 쌓이는 편이 안전하다(운영자는 PC 로 본다).
 */
export const ADMIN_CANDIDATE_GRID =
  'md:grid md:grid-cols-[minmax(0,2fr)_7rem_minmax(0,3fr)_3.5rem_1.25rem] md:items-start md:gap-x-3';

export const ADMIN_PLACE_GRID =
  'md:grid md:grid-cols-[minmax(0,2fr)_7rem_4.5rem_minmax(0,2fr)_7rem] md:items-center md:gap-x-3';

/**
 * 표의 머리글 한 줄. `md` 미만에서는 통째로 숨는다 — 그 아래에서는 줄이 grid 가 아니라 세로로 쌓여서
 * 이름표가 가리킬 열이 없다.
 *
 * **줄과 같은 상자를 두 겹 쓴다.** 목록의 바깥 여백(`px-4 md:px-6`)은 `<ul>` 이 갖고, 줄의 안쪽
 * 여백(`px-4`)과 테두리 1px 는 `<li>` 안에 있다. 머리글이 바깥 여백만 쓰면 열이 17px 씩 왼쪽으로
 * 어긋난다 — 숫자를 더해 맞추면 줄 쪽 여백이 바뀌는 날 조용히 다시 어긋나므로, **같은 상자를
 * 그대로 한 번 더 세우고** 테두리는 투명하게 둔다.
 */
export function AdminTableHead({ grid, columns }: { grid: string; columns: string[] }) {
  return (
    <div className="px-4 md:px-6" aria-hidden="true">
      <div
        className={cx(
          'hidden border-x border-transparent px-4 pb-1 text-xs font-semibold text-quaternary',
          grid,
        )}
      >
        {columns.map((column, index) => (
          <span key={column || `blank-${index}`} className="truncate">
            {column}
          </span>
        ))}
      </div>
    </div>
  );
}
