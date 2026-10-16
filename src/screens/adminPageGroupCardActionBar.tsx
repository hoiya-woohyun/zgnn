'use client';

import { useLayoutEffect, useState, type RefObject } from 'react';
import { ArrowDown, ChevronDown } from '@untitledui/icons';
import { Button } from '../components/base/button';
import type { TGroupQuickAction } from '../lib/adminCandidates';
import { cx } from '../utils/cx';
import { BUSY_LABEL } from './adminPageGroupActions';
import type { TAdminPageGroupState } from './adminPageGroupCard';
import { ADMIN_ROW_OPEN } from './adminTable';

/**
 * 줄 높이. 두 모양(동작 · 접기만)이 같은 높이라 바뀔 때 밑의 줄이 출렁이지 않고, 결정 줄이 이만큼 올라와야 "보인다" 로 친다
 * (그 전에는 이 줄이 결정 줄의 머리를 덮고 있다). `min-h-12` 와 같은 값 — `/admin` 은 `--spacing` 이 4px 에 못 박혀 있다(ADR-018 결정 10).
 * 버튼 37px + 위아래 4px 이 그 안에 든다. 폰에서 이름과 버튼이 두 줄로 접히면 그만큼 커진다(그때도 판정은 이 값으로 — 결정 줄을 덮는 것은 한 줄 높이다).
 */
const BAR_PX = 48;

/**
 * 펼친 줄의 **붙는 동작 줄**(14 W261010.11). 결정 줄은 근거 아래에 있어(ADR-018 — 근거를 다 읽은 자리에서 누른다) 펼친 직후의
 * 올리기가 1280×800 에서 y=1419, 폰에서 1,400~1,700px 아래였다. 이 줄은 패널 맨 끝(옛 '여기까지 · 접기' 자리)에 서서
 * `sticky bottom-0` 으로 화면 바닥에 붙는다 — 패널이 화면 밖으로 이어지는 동안만 붙고, 패널 끝이 올라오면 제자리에 눕는다.
 *
 * **결정 줄이 화면 아래 밖일 때만 동작을 그린다**(`decisionRef` 를 본다). 결정 줄이 보이면 같은 줄이 '접기' 만 남는다 —
 * 한 화면에 같은 이름의 올리기가 둘 서면 "어느 쪽이 무엇을 싣나" 가 흐려진다(결정 줄의 표 주석과 같은 이유).
 *
 * - **가게 이름이 맨 앞이다.** 1,400px 아래에서는 줄 머리가 안 보인다 — 어느 줄의 패널인지 모르고 누르는 것이 곧 다른 가게를 올리는 길이다(`ADMIN_ROW_OPEN`).
 * - 주 칸은 바로 올리기이거나 결정 줄로 내려가기다(`groupQuickAction`). 근거 없음은 내려가기 — 결정 줄의 확인(W261010.28)을 비켜 가지 않게.
 * - 제외는 폼이 결정 줄 자리에서 열리므로 누르면 그리로 데려간다(`onReject` 쪽 책임) — 화면 밖 아래에서 열리면 아무 일도 안 일어난 것처럼 보인다.
 * - 도는 중·실패 한 줄도 여기 짧게 선다. 결정 줄의 같은 줄은 화면 밖이다.
 * - `fixed` 가 아니라 `sticky` 다 — `<main>` 안의 `fixed` 는 스와이프 중에 어긋난다(CLAUDE.md). 부모는 근거와 결정을 함께 감싼 패널이어야 한다:
 *   결정 줄 상자 안에 두면 그 상자 높이 안에서만 붙어 소용이 없다.
 * - 바탕이 불투명해 `<li>` 의 왼쪽 줄기 그림자를 덮으므로 같은 줄기를 제 몸에 다시 칠한다(`ADMIN_ROW_OPEN`). 일괄 줄(위에 붙는다)과 자리가 겹치지 않는다.
 */
export function AdminPageGroupCardActionBar({
  name,
  quick,
  state,
  rejectPrimary,
  decisionRef,
  onApprove,
  onReject,
  onJump,
  onCollapse,
}: {
  name: string;
  quick: TGroupQuickAction;
  state: TAdminPageGroupState;
  /** 근거 없음 — 제외가 주 버튼이다(결정 줄과 같은 규칙, ADR-018 결정 11). */
  rejectPrimary: boolean;
  /** 결정 줄 `<section>`. 이것이 화면 아래 밖에 있는 동안만 동작을 그린다. */
  decisionRef: RefObject<HTMLElement | null>;
  onApprove: () => void;
  onReject: () => void;
  onJump: () => void;
  onCollapse: () => void;
}) {
  const below = useDecisionBelow(decisionRef);
  const off = Boolean(state.busy);
  // 제외 폼·재분석 확인이 열려 있으면 주 칸이 그리로 데려간다 — 여기서 또 제외를 누르면 두 확인이 겹친다.
  const canReject = !state.rejecting && !state.reanalyzing;

  return (
    <div
      className={cx(
        'sticky bottom-0 z-10 -mx-4 mt-3 flex min-h-12 items-center border-t border-secondary px-4 py-1 md:-ml-14 md:pl-14',
        ADMIN_ROW_OPEN,
        below ? 'flex-wrap gap-x-2 gap-y-1' : 'justify-center',
      )}
    >
      {below ? (
        <>
          <span className="max-w-full min-w-0 truncate text-xs font-semibold text-primary md:max-w-64">{name}</span>
          {quick.kind === 'approve' ? (
            <Button color="primary" size="sm" isDisabled={off} isLoading={state.busy === 'approving'} onClick={onApprove}>
              {quick.approve.label}
            </Button>
          ) : (
            <Button color="secondary" size="sm" iconTrailing={ArrowDown} isDisabled={off} onClick={onJump}>
              {quick.label}
            </Button>
          )}
          {canReject && (
            <Button color={rejectPrimary ? 'primary' : 'tertiary'} size="sm" isDisabled={off} onClick={onReject}>
              제외
            </Button>
          )}
          {state.busy ? (
            <span className="text-xs text-tertiary" role="status">
              {BUSY_LABEL[state.busy]}
            </span>
          ) : state.error ? (
            <span className="min-w-0 truncate text-xs text-error-primary" title={state.error}>
              {state.error}
            </span>
          ) : null}
          <Button color="link-gray" size="sm" className="ml-auto" iconLeading={<ChevronDown aria-hidden="true" className="size-3.5 rotate-180" />} onClick={onCollapse}>
            접기
          </Button>
        </>
      ) : (
        <button type="button" onClick={onCollapse} className="flex items-center gap-1 py-1.5 text-xs text-tertiary hover:text-secondary">
          <ChevronDown aria-hidden="true" className="size-3.5 rotate-180" />
          여기까지 · 접기
        </button>
      )}
    </div>
  );
}

/**
 * 결정 줄이 화면 **아래 밖**에 있나 — 머리가 화면 바닥에서 이 줄 높이만큼 올라오기 전까지(그동안은 이 줄이 그 머리를 덮는다).
 * 위로 지나갔으면 아니다: 그때 이 줄은 패널 끝 제자리에 누워 화면 밖이다.
 *
 * 첫 값은 그리기 전에 한 번 잰다(`useLayoutEffect`) — 관찰자의 첫 알림은 다음 프레임이라, 그 사이 '접기' 만 한 번 번쩍인다.
 */
function useDecisionBelow(decisionRef: RefObject<HTMLElement | null>): boolean {
  const [below, setBelow] = useState(false);
  useLayoutEffect(() => {
    const target = decisionRef.current;
    if (!target) return;
    setBelow(target.getBoundingClientRect().top >= window.innerHeight - BAR_PX);
    if (typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        const bottom = entry.rootBounds?.bottom ?? window.innerHeight - BAR_PX;
        setBelow(!entry.isIntersecting && entry.boundingClientRect.top >= bottom);
      },
      { rootMargin: `0px 0px -${BAR_PX}px 0px` },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [decisionRef]);
  return below;
}
