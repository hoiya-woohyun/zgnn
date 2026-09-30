'use client';

import type { ReactNode } from 'react';
import { Checkbox } from '../components/base/checkbox';
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
 * 장소 · 지역 · 동반 조건 · 강아지 요금 · 필요 장비 · AI 요약 · 근거 · 종류 · (펼침).
 *
 * **동반 정보 한 칸이 세 칸으로 갈렸다**(2026-09-30). 운영자가 그 칸에서 실제로 찾는 것은 둘("얼마 드나" ·
 * "무엇을 챙기나")인데, 한 칸이던 동안 그 둘이 실내·크기·무게·확인 필요와 같은 줄에 섞여 서 있었다.
 * 가르는 기준은 라벨이 아니라 배지의 축이다(`adminPreview.ts` 의 `policySplit`).
 *
 * `필요 장비` 가 고정폭(`6rem`)인 것은 들어올 값이 둘뿐이라서다 — `케이지 필요`·`리드줄`. fr 로 두면 빈 칸이
 * 대부분인 열이 글자가 찬 열의 몫을 먹는다.
 *
 * **종류가 맨 뒤에 고정폭으로 선다.** 이름 앞에 칩으로 두던 자리에서 옮긴 것이고(2026-09-30), 세로로 훑히는
 * 성질은 그대로다 — 자기 열이 되면 이름 길이와 아예 무관해져 오히려 더 곧게 선다. `4rem` 은 선이 먹는
 * 24px 을 빼고 칩의 최소폭(`min-w-9` = 36px)이 들어가는 값이다.
 *
 * **폭 배분은 "무엇이 줄 높이를 정하는가" 로 정하고, 그 답은 재 봐야 안다.**
 *
 * 세 열(장소·동반 정보·AI 요약)이 전부 줄바꿈으로 키가 자라므로, 한 열을 넓히면 그 열은 낮아지고 나머지가
 * 높아진다 — 총합이 가장 낮은 지점은 계산이 아니라 실측으로 찾는다. AI 요약을 두 줄에서 자르던 동안에는
 * 그 열이 높이에 관여하지 않아 앞의 둘이 몫을 받는 것이 옳았고, **자르기를 없앤 지금은 반대**다.
 *
 * 실측(40줄 · 격자 1136px · 요약 평균 80자 · **열 7개였을 때**):
 *   AI 요약 243px → 평균 90px · 목록 3656px · 최대 124px
 *   AI 요약 357px → 평균 74px · 목록 2981px · 최대 121px  ← 그때의 값
 *   AI 요약 455px → 평균 79px · 목록 3188px · 최대 149px  (장소·동반 정보가 접히기 시작한다)
 * 최적은 넓은 분지라 357~392px 사이가 사실상 같았다.
 *
 * ⚠️ **지금 값은 다시 잰 것이 아니라 계산으로 옮긴 것이다.** 열이 둘 늘어 고정폭이 96px 더 들어갔고(필요 장비 +
 * 칸 사이 선 2벌), 그만큼은 누군가 내놔야 한다 — AI 요약 4.2fr 은 그대로 두고 **동반 조건이 갈리며 내놓은 몫**
 * (옛 2.8fr → 1.5 + 2.0fr)에서 메웠다. 계산: 고정폭 8.5rem+6rem+5rem+4rem+2.5rem = 416px, 남는 720px 을
 * fr 합 10.1 로 나눠 1fr ≈ 71px → 장소 170 · 동반 조건 107 · 요금 142 · 장비 96 · AI 요약 300px.
 * AI 요약이 분지(357~392)보다 좁아졌으니 줄 높이는 조금 올라갔을 것이다 — **다음 `/admin` 방문 때 다시 재고** 고친다.
 *
 * `max-w-7xl`(1280px)은 걸리지 않는다 — 사이드바를 빼면 격자에 오는 것이 그보다 좁다. 폭을 늘리려면
 * 캡이 아니라 셸을 봐야 한다(`appShellSurface.ts`).
 *
 * 지역이 `8.5rem` 인 것은 `동쪽 (구좌읍)`(9자 × 12px)이 선 24px 을 빼고 들어가는 최소값이라서다.
 * 이 화면은 `--spacing` 이 4px 에 못 박혀 있어(`adminDensity.css`) `text-xs` 가 12px 로 고정이다.
 */
export const ADMIN_CANDIDATE_GRID = cx(
  'md:grid md:grid-cols-[minmax(0,2.4fr)_8.5rem_minmax(0,1.5fr)_minmax(0,2.0fr)_6rem_minmax(0,4.2fr)_5rem_4rem_2.5rem]',
  CELL_RULES,
  /* 끝의 펼침 표시(∨)는 값이 아니라 손잡이다 — 선을 그으면 빈 열 하나가 더 있는 것처럼 읽힌다. */
  'md:[&>*:last-child]:border-l-0 md:[&>*:last-child]:pl-0',
);

/** 장소 · 지역 · 상태 · 내린 사유 · 종류 · (버튼). 종류의 자리를 후보 표와 맞춘다 — 칸을 오갈 때 눈이 다시 적응하지 않게. */
export const ADMIN_PLACE_GRID = cx(
  'md:grid md:grid-cols-[minmax(0,2fr)_8.5rem_7rem_minmax(0,2fr)_4rem_7.5rem]',
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
