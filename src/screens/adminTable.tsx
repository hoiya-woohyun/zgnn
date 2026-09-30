'use client';

import type { ReactNode } from 'react';
import { Checkbox } from '../components/base/checkbox';
import type { TBadgeTone } from '../lib/petPolicy';
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
/**
 * 장소 · 지역 · 동반 조건 · AI 요약 · 종류.
 *
 * **다섯 열로 줄었다**(2026-09-30 v2). 그 전 여덟 열 중 셋이 거의 늘 비었다 — `강아지 요금`·`필요 장비` 는 21줄 중 2~3줄만
 * 찼고(동반 조건 칸으로 되돌렸다, 순서는 `toPetBadges` 그대로), 끝의 펼침 표시(∨) 열은 화살표를 이름 옆으로 옮기며 없앴다
 * (1440px 에서 체크박스는 맨 왼쪽, 화살표는 맨 오른쪽이라 한 줄의 두 손잡이가 화면 폭만큼 떨어져 있었다).
 * 비운 폭은 AI 요약이 받는다 — 자르지 않는 이 열이 곧 줄 높이라, 여기에 폭을 주는 것이 전체를 낮춘다.
 *
 * 옛 실측(40줄 · 격자 1136px): AI 요약 243px → 평균 90px · 357px → 74px · 455px → 79px(장소·동반 정보가 접히기 시작).
 * 사이드바를 뺀 지금(`appShell` 의 `bare`) 격자는 1200px 남짓이고, 1fr ≈ 94px 로 AI 요약 ≈ 430px · 동반 조건 ≈ 225px 이다.
 * 분지(357~392)보다 조금 넓다 — **다음 `/admin` 방문 때 다시 재고** 고친다.
 *
 * 지역이 `8.5rem` 인 것은 `동쪽 (구좌읍)`(9자 × 12px)이 선 24px 을 빼고 들어가는 최소값이라서다(이 화면은 `--spacing` 이
 * 4px 에 못 박혀 `text-xs` 가 12px 고정이다 — `adminDensity.css`). 종류 `4rem` 은 칩의 최소폭(36px) + 선 24px.
 */
export const ADMIN_CANDIDATE_GRID = cx(
  'md:grid md:grid-cols-[minmax(0,2.4fr)_8.5rem_minmax(0,2.4fr)_minmax(0,4.6fr)_4rem]',
  CELL_RULES,
);

/**
 * 장소 · 지역 · 동반 조건 · 소개 · 종류 · (버튼). **앞의 다섯 열이 후보 표와 같은 폭·같은 순서**다 — 두 칸을 오갈 때
 * 같은 값이 같은 자리에 있게. 상태와 내린 사유는 자기 열을 잃고 이름 칸으로 갔다: 86줄 중 84줄이 `게시중` 한 단어와
 * 빈 사유 칸이라, 두 열이 표 폭의 1/5 을 먹으면서 말하는 것은 두 줄뿐이었다.
 */
export const ADMIN_PLACE_GRID = cx(
  'md:grid md:grid-cols-[minmax(0,2.4fr)_8.5rem_minmax(0,2.4fr)_minmax(0,4.6fr)_4rem_7.5rem]',
  CELL_RULES,
);

/**
 * 동반 배지 낱개의 톤 → 칩 모양. 사이트와 **같은 위계**다(`petBadges.tsx` 의 `TONE_COLOR`):
 * ok 와 cond 는 둘 다 회색이고, 주의(`warn` — 동반 불가 · 확인된 정보 없음 · 전화 확인)만 노란 바탕으로 나온다.
 * 두 표('확인할 장소'·'올린 장소')가 같은 칩을 쓰므로 여기 둔다.
 */
export const ADMIN_POLICY_TONE: Record<TBadgeTone, string> = {
  ok: 'bg-secondary text-secondary',
  cond: 'bg-secondary text-secondary',
  warn: 'bg-warning-primary text-warning-primary',
};

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
 * 줄 맨 앞의 **고르기 칸**. 머리글과 줄이 같은 폭을 쓰도록 여기서 한 번만 정한다 — 두 곳에 적으면
 * 한쪽만 고쳤을 때 이름 열이 1px 씩 어긋나고, 그 어긋남이 이 표가 막으려는 바로 그 오독이다.
 *
 * **칸(grid) 이 아니라 flex 로 붙인다.** 줄의 본체는 `<button>` 이고 그것이 곧 grid 상자인데,
 * 체크박스는 버튼 **안에** 들어갈 수 없다(버튼 안의 버튼이고, 눌러도 펼침만 토글된다).
 * 그래서 grid 열을 하나 더 만드는 대신 버튼 **바깥 왼쪽**에 세우고, 머리글에도 같은 폭의 빈 자리를 둔다.
 * 칸 사이 세로선(`CELL_RULES`)이 여기까지 오지 않는 것도 의도다 — 값이 아니라 손잡이다.
 */
export const ADMIN_LEAD_CELL = 'flex w-10 shrink-0 items-center justify-center';

/**
 * 표 한 장 — 머리글 + 줄들. 가로 여백(`px-4 md:px-6`)을 여기 한 번만 두고 머리글과 `<ul>` 이 **같은 상자**
 * 안에 서므로 열이 어긋날 길이 없다(예전에는 상자를 두 겹 세워 1px 씩 맞춰야 했다).
 *
 * 머리글에 **전부 고르기 체크박스**가 설 수 있다(`selectAll`). 그 체크박스가 고르는 범위는 보이는 줄이 아니라
 * 걸러 보기에 걸린 전부라, 개수를 `aria-label` 에 실어 말한다 — 좁은 화면에서는 머리글이 없으므로
 * 같은 일을 하는 컨트롤이 표 위 줄(`AdminPageBulkBar`)에 남아 있다.
 *
 * 머리글을 sticky 로 만들지 않았다. 셸의 뒤로가기 줄이 투명하던 때(ADR-010 v3 까지), 붙여 둔 머리글 위의 그
 * 띠로 지나가는 줄이 비쳐 **열 이름 위에 남의 줄 글자가 겹쳤다.** 헤더가 불투명해진 v4 에서 다시 붙이려면
 * `top` 을 그 헤더 높이만큼 내려야 한다. 덮개를 깔면 안 붙어 있을 때 걸러 보기
 * 줄을 덮는다. 열의 정체는 세로선이 이미 말하고 있다.
 */
/**
 * 머리글의 **전부 고르기** 체크박스. 없으면 머리글의 고르기 칸은 빈 자리다.
 *
 * ⚠️ 이것이 고르는 것은 **화면에 그린 줄이 아니라 걸러 보기에 걸린 전부**다(무한 스크롤로 아직 안 그린 것까지).
 * 머리글의 체크박스는 "내가 보는 줄들" 을 가리키는 것처럼 보이므로, 개수를 `label` 에 실어 그 차이를 말한다 —
 * 141묶음 중 40묶음만 그려진 상태에서 눌러도 141묶음이 골라진다.
 */
export type TAdminTableSelectAll = {
  isSelected: boolean;
  /** 일부만 골랐을 때. '전부 골랐다' 로 보이면 한 번 더 눌러 풀릴 줄 알고 눌렀다가 나머지가 켜진다. */
  isIndeterminate: boolean;
  isDisabled?: boolean;
  /** 스크린리더가 읽는 말 — 개수를 여기 싣는다(보이는 글자를 둘 자리가 없다). */
  label: string;
  onChange: (selected: boolean) => void;
};

export function AdminTable({
  grid,
  columns,
  children,
  lead = false,
  selectAll,
}: {
  grid: string;
  columns: string[];
  children: ReactNode;
  /** 줄 맨 앞에 고르기 칸이 있는가. 머리글에 같은 폭의 빈 자리를 둬 열을 맞춘다(`ADMIN_LEAD_CELL`). */
  lead?: boolean;
  /** 주면 머리글의 고르기 칸에 전부 고르기 체크박스가 선다. `lead` 가 false 면 무시된다(칸이 없다). */
  selectAll?: TAdminTableSelectAll;
}) {
  return (
    <div className="px-4 md:px-6">
      {/* 머리글은 `md` 이상에서만 — 그 아래에서는 줄이 grid 가 아니라 세로로 쌓여 이름표가 가리킬 열이 없다. */}
      {/*
        * `aria-hidden` 은 **열 이름 쪽에만** 둔다. 예전에는 머리글 상자 전체에 걸려 있었는데, 그 안에
        * 체크박스가 들어오면 보조기기에서 통째로 사라진다 — 보이는데 없는 컨트롤이 된다.
        */}
      <div className="hidden border-t border-secondary md:flex">
        {lead ? (
          <span className={ADMIN_LEAD_CELL}>
            {selectAll ? (
              <Checkbox
                size="sm"
                aria-label={selectAll.label}
                isSelected={selectAll.isSelected}
                isIndeterminate={selectAll.isIndeterminate}
                isDisabled={selectAll.isDisabled}
                onChange={selectAll.onChange}
              />
            ) : null}
          </span>
        ) : null}
        <div className={cx('min-w-0 flex-1 px-4 text-xs font-semibold text-quaternary', grid)} aria-hidden="true">
          {columns.map((column, index) => (
            <span key={column || `blank-${index}`} className="truncate">
              {column}
            </span>
          ))}
        </div>
      </div>
      {/* 줄을 가르는 선은 `<ul>` 이 긋는다 — 줄마다 테두리를 두면 선이 두 겹으로 겹쳐 굵기가 들쭉날쭉해진다. */}
      <ul className="divide-y divide-secondary border-y border-secondary bg-primary">{children}</ul>
    </div>
  );
}
