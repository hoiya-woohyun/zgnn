'use client';

import { useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  clearAppStatus,
  getAppStatus,
  getServerAppStatus,
  holdAppStatus,
  pressAppStatusAction,
  releaseAppStatus,
  shouldClearStatusOnRoute,
  statusBottomAboveAction,
  subscribeAppStatus,
} from '../../lib/appStatus';

/** 주 버튼 줄이 화면 아래에 붙는 폭(`max-md:sticky`) — 데스크톱에선 줄이 흐름 속이라 비켜 서지 않는다. */
const PHONE_QUERY = '(width < 48rem)';

/** 지금 화면의 주 버튼 줄. 스택 전환이 띄운 떠나는 화면의 복제본(`inert` 층, `appShellStack`)은 뺀다. */
const liveStickyAction = (): HTMLElement | null =>
  [...document.querySelectorAll<HTMLElement>('[data-sticky-action]')].find((element) => !element.closest('[inert]')) ?? null;

/**
 * 셸의 상태 한 줄 자리. 무엇을 띄울지는 `lib/appStatus.ts` 의 `showAppStatus` 를 부른 쪽이 정한다.
 *
 * **셸이 `<main>` 바깥에 그린다**(ADR-014). 스와이프 중 `<main>` 에 transform 이 걸리면 그 안의
 * `fixed` 는 화면이 아니라 `<main>` 기준이 되어 알림이 끌리는 화면과 함께 밀려난다. 탭바처럼
 * 화면들을 담는 틀 쪽에 두면 화면이 움직여도 제자리에 있다.
 *
 * `role="status"` 상자는 **늘 DOM 에 있다** — 라이브 영역은 먼저 있어야 나중에 바뀐 글을 읽어 준다.
 * 비었을 때는 아무것도 그리지 않아 눈에도, 손가락에도 걸리지 않는다(`pointer-events-none`).
 *
 * 자리는 모바일에서 탭바 바로 위(`--tab-bar-h` + 솟은 원 16px + 여유 — 가운데 원에 가리지 않게),
 * 데스크톱은 사이드바를 뺀 콘텐츠 폭의 가운데 아래. 폰에서 화면 아래에 붙는 주 버튼 줄이 있으면 그 위(14 W261010.7c).
 */
export function AppStatusToast() {
  const status = useSyncExternalStore(subscribeAppStatus, getAppStatus, getServerAppStatus);
  const pathname = usePathname();

  /*
   * 화면이 바뀌면 그 화면의 알림을 걷고, 링크가 가리키는 화면에 와 있으면 걷는다(`shouldClearStatusOnRoute`). 알림이 바뀔 때도 묻는다 —
   * 저장한 곳에서 띄운 '저장한 곳 보기'. 그리기 전(layout)에 걷어야 새 화면에 옛 알림이 한 프레임도 비치지 않는다. 새 화면의 마운트
   * effect 가 띄운 알림은 이보다 뒤(passive)라 걷히지 않는다.
   */
  const lastPathname = useRef(pathname);
  useLayoutEffect(() => {
    const from = lastPathname.current;
    lastPathname.current = pathname;
    if (shouldClearStatusOnRoute(status, { from, to: pathname })) clearAppStatus();
  }, [pathname, status]);

  /*
   * 폰에서 화면 아래에 붙는 주 버튼 줄(`data-sticky-action`)이 있으면 그 윗선 위로 비켜 선다(14 W261010.7c) — 기본 자리는 줄의
   * '고치기' 와 겹쳐, 한 마리를 빼고 곧장 누른 손가락이 '되돌리기' 에 맞아 뺀 강아지가 되살아난 채 저장될 뻔했다.
   * 줄의 높이(안내 한 줄·몸무게 되묻기)와 자리(폼 끝까지 내리면 붙지 않고 위로)가 바뀌어 떠 있는 동안 다시 잰다.
   * 상태가 아니라 style 을 직접 고친다 — 스크롤마다 다시 그릴 일이 아니다. 그리기 전(layout)에 재야 한 프레임도 겹쳐 비치지 않는다.
   */
  const boxRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box || !status) return;
    const phone = window.matchMedia(PHONE_QUERY);
    const place = () => {
      const action = phone.matches ? liveStickyAction() : null;
      const bottom = action ? statusBottomAboveAction(window.innerHeight, action.getBoundingClientRect().top) : null;
      if (bottom === null) box.style.removeProperty('bottom');
      else box.style.bottom = `${bottom}px`;
    };
    place();
    const action = liveStickyAction();
    const observer = action ? new ResizeObserver(place) : null;
    if (action) observer?.observe(action);
    window.addEventListener('scroll', place, { passive: true });
    window.addEventListener('resize', place);
    return () => {
      observer?.disconnect();
      window.removeEventListener('scroll', place);
      window.removeEventListener('resize', place);
    };
  }, [pathname, status]);

  return (
    <div
      ref={boxRef}
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--tab-bar-h)+28px+env(safe-area-inset-bottom,0px))] z-50 flex justify-center px-4 md:bottom-6 md:left-64"
    >
      {status && (
        <p
          key={status.id}
          // 누르려고 겨누는 동안은 사라지지 않는다(12 U3.5). 터치는 mouseleave 가 안 와서 멈춘 채 남을 수 있어 마우스만 본다.
          onPointerEnter={(e) => e.pointerType === 'mouse' && holdAppStatus()}
          onPointerLeave={(e) => e.pointerType === 'mouse' && releaseAppStatus()}
          onFocus={holdAppStatus}
          onBlur={releaseAppStatus}
          className="pointer-events-auto flex max-w-md items-center gap-3 rounded-xl bg-primary-solid px-4 py-3 text-sm font-semibold text-white shadow-lg"
        >
          <span>{status.text}</span>
          {status.link && (
            <Link
              href={status.link.href}
              onClick={clearAppStatus}
              className="-my-3 -mr-2 flex min-h-11 items-center px-2 whitespace-nowrap text-white underline underline-offset-4"
            >
              {status.link.label} ›
            </Link>
          )}
          {status.action && (
            <button
              type="button"
              // 먼저 닫고 누른다(onPress 가 새 알림을 띄우면 그 알림이 남아야 한다) — 그래도 `onDismiss` 는 안 간다(14 W261010.7g).
              onClick={() => pressAppStatusAction(status.id)}
              className="-my-3 -mr-2 flex min-h-11 items-center px-2 whitespace-nowrap text-white underline underline-offset-4"
            >
              {status.action.label}
            </button>
          )}
        </p>
      )}
    </div>
  );
}
