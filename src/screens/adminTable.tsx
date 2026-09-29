'use client';

import type { ReactNode } from 'react';
import { cx } from '../utils/cx';

/**
 * 검수 화면의 두 표. **열 규격과 줄·칸을 가르는 선을 여기 한 곳이 소유한다.**
 *
 * 표를 `<table>` 로 짜지 않는 이유: 줄 하나가 펼쳐지면 그 안에 결정 패널·반려 폼이 통째로 들어온다
 * (`adminPageGroupCard`·`adminPagePlaceRow`). `<tr>` 안에 그것을 넣으려면 `colSpan` 짜리 둘째 행이
 * 필요하고, 그러면 "줄 하나 = 요소 하나" 가 깨져 `done` 한 줄·오류 한 줄이 갈 자리가 사라진다.
 * `<ul>` + grid 는 그 구조를 그대로 두고 열만 맞춘다.
 *
 * **`md` 미만에서는 grid 를 켜지 않는다.** 셸의 스와이프 표면이 `overflow-x-clip` 이라 폭을 넘긴 표는
 * 가로 스크롤 없이 그냥 잘린다 — 폰에서는 세로로 쌓이는 편이 안전하다(운영자는 PC 로 본다).
 */

/**
 * 칸을 가르는 세로선. **줄마다 손으로 붙이지 않고 grid 상수가 자식에게 먹인다** —
 * 한 칸만 빠뜨려도 그 줄에서 선이 끊기고, 끊긴 선은 "여기는 다른 칸" 이라는 거짓말을 한다.
 *
 * 세로 여백이 **칸 쪽에** 있는 것이 요점이다(`py-2`). 줄 상자에 주면 세로선이 가로선에 8px 못 미쳐 멈춰
 * 격자의 모서리가 만나지 않는다 — 표가 아니라 "선이 그려진 목록" 으로 보인다. `items-stretch` 로 칸을
 * 줄 높이까지 늘려야 그 선이 위아래 가로선에 닿는다.
 */
const CELL_RULES =
  'md:items-stretch md:py-0 md:[&>*]:min-w-0 md:[&>*]:py-2 md:[&>*]:pr-3 md:[&>*+*]:border-l md:[&>*+*]:border-secondary md:[&>*+*]:pl-3';

/**
 * 폭은 **선이 차지하는 24px(`pl-3`+`pr-3`)를 뺀 나머지**가 글자 자리다. 좁은 칸은 그만큼 넓혀 두었다 —
 * `게시 대기`·`글 12건` 이 두 줄로 접히면 그 줄만 키가 커져 격자가 어긋난 것처럼 보인다.
 */
export const ADMIN_CANDIDATE_GRID = cx(
  'md:grid md:grid-cols-[minmax(0,2fr)_8.5rem_minmax(0,3fr)_5rem_2.5rem]',
  CELL_RULES,
  /* 끝의 펼침 표시(∨)는 값이 아니라 손잡이다 — 선을 그으면 빈 열 하나가 더 있는 것처럼 읽힌다. */
  'md:[&>*:last-child]:border-l-0 md:[&>*:last-child]:pl-0',
);

export const ADMIN_PLACE_GRID = cx(
  'md:grid md:grid-cols-[minmax(0,2fr)_8.5rem_7rem_minmax(0,2fr)_7.5rem]',
  CELL_RULES,
);

/**
 * 펼친 패널이 **자기 줄에 속해 보이게** 하는 윗선. 줄과 줄을 가르는 선(`divide-y`)과 같은 굵기·같은 색으로
 * 그으면 패널이 위아래 두 선 사이에 떠서 어느 줄의 것인지 눈으로 정할 수 없다 — 승인·내리기 버튼이 그
 * 패널에 있으므로 이것이 곧 오조작이다. 그래서 **점선 + 한 단 연한 색**으로 낮춘다. 줄 자체의 배경색
 * (`ADMIN_ROW_OPEN`)과 둘이 함께 "이건 같은 줄" 이라고 말한다.
 */
export const ADMIN_PANEL_DIVIDER = 'border-t border-dashed border-tertiary';

/**
 * 펼쳐졌거나 무언가를 고르는 중인 줄. 머리와 패널을 **왼쪽 한 줄기 색**으로 함께 묶는다.
 *
 * **줄기가 일을 하고 배경은 거들 뿐이다.** 이 팔레트에서 `bg-active`·`bg-primary_hover`·`bg-secondary` 는
 * 전부 같은 값(`neutral-50`)이고 그것이 곧 **페이지 바탕색**이다 — 흰 줄 사이에서 열린 줄만 그 색이 되면
 * 도드라지는 게 아니라 표에서 빠져 보이고, 손이 얹힌 줄과도 구별되지 않는다.
 *
 * 테두리가 아니라 **안쪽 그림자**인 것도 이유가 있다. `border-l-2` 는 그 줄만 내용을 2px 밀어
 * 열이 어긋나고, 어긋난 열은 이 표가 막으려는 바로 그 오독이다. `inset` 그림자는 자리를 먹지 않는다.
 */
export const ADMIN_ROW_OPEN = 'bg-active shadow-[inset_3px_0_0_0_var(--color-bg-brand-solid)]';

/**
 * 표 한 장 — 머리글 + 줄들. 가로 여백(`px-4 md:px-6`)을 여기 한 번만 두고 머리글과 `<ul>` 이 **같은 상자**
 * 안에 서므로 열이 어긋날 길이 없다(예전에는 상자를 두 겹 세워 1px 씩 맞춰야 했다).
 *
 * 머리글을 sticky 로 만들지 않았다. 셸의 뒤로가기 줄이 투명한 자리라(ADR-010), 붙여 둔 머리글 위의 그
 * 띠로 지나가는 줄이 비쳐 **열 이름 위에 남의 줄 글자가 겹친다.** 덮개를 깔면 안 붙어 있을 때 걸러 보기
 * 줄을 덮는다. 열의 정체는 세로선이 이미 말하고 있다.
 */
export function AdminTable({
  grid,
  columns,
  children,
}: {
  grid: string;
  columns: string[];
  children: ReactNode;
}) {
  return (
    <div className="px-4 md:px-6">
      {/* 머리글은 `md` 이상에서만 — 그 아래에서는 줄이 grid 가 아니라 세로로 쌓여 이름표가 가리킬 열이 없다. */}
      <div
        className={cx('hidden border-t border-secondary px-4 text-xs font-semibold text-quaternary', grid)}
        aria-hidden="true"
      >
        {columns.map((column, index) => (
          <span key={column || `blank-${index}`} className="truncate">
            {column}
          </span>
        ))}
      </div>
      {/* 줄을 가르는 선은 `<ul>` 이 긋는다 — 줄마다 테두리를 두면 선이 두 겹으로 겹쳐 굵기가 들쭉날쭉해진다. */}
      <ul className="divide-y divide-secondary border-y border-secondary bg-primary">{children}</ul>
    </div>
  );
}
