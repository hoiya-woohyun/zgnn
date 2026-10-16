'use client';

import { Button as AriaButton, Dialog as AriaDialog, DialogTrigger as AriaDialogTrigger, Popover as AriaPopover } from 'react-aria-components';

/**
 * 검수 화면 머리글의 `?` 도움말(todo/13 T4.5 → 14 W261010.8). **누르면 열리고, 바깥을 탭하거나 Esc 면 닫힌다.**
 *
 * `<details>` 이던 동안 두 가지가 깨졌다. 바깥을 탭해도 안 닫혔고(`<details>` 는 원래 그렇다 — 다시 `?` 를 눌러야 한다),
 * 펼친 목록이 트리거 기준 `absolute right-0` 이라 트리거가 어디 서느냐에 따라 왼쪽 화면 밖으로 나갔다(폰 29px · parttime-04).
 * react-aria 팝오버(검수 화면의 `Select` 가 이미 쓰는 부품)는 그 둘을 한 번에 가진다 — 화면 가장자리에서 `containerPadding` 만큼
 * 안쪽에 가두고, 바깥 탭·Esc 로 닫히고, body 로 portal 되어 셸이 `<main>` 에 거는 스와이프 transform 밖에 선다(ADR-014).
 *
 * `base/popover.tsx` 를 감싸지 않는 것은 그것이 Select 의 목록용이라서다 — 폭이 트리거 폭(`--trigger-width`, 여기선 24px)이고
 * 세로 스크롤·`py-1` 이 박혀 있어 덮어쓸 것이 더 많다.
 * 펼친 카드는 떠 있는 면이라 흰 바탕(`bg-primary`)이다(크롬이 아니다 — ADR-010 v4).
 */
export function AdminPageHelp({ lines }: { lines: readonly string[] }) {
  return (
    <AriaDialogTrigger>
      <AriaButton
        aria-label="도움말"
        className="flex size-6 cursor-pointer items-center justify-center rounded-full border border-secondary text-xs text-tertiary outline-brand focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        ?
      </AriaButton>
      <AriaPopover
        placement="bottom end"
        offset={8}
        containerPadding={16}
        className="w-80 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-lg border border-secondary bg-primary shadow-lg"
      >
        <AriaDialog aria-label="도움말" className="outline-hidden">
          <ul className="space-y-1.5 p-3 text-xs text-secondary">
            {lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </AriaDialog>
      </AriaPopover>
    </AriaDialogTrigger>
  );
}
