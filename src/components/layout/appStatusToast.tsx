'use client';

import { useEffect, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  clearAppStatus,
  getAppStatus,
  getServerAppStatus,
  holdAppStatus,
  isAtStatusLink,
  releaseAppStatus,
  subscribeAppStatus,
} from '../../lib/appStatus';

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
 * 데스크톱은 사이드바를 뺀 콘텐츠 폭의 가운데 아래.
 */
export function AppStatusToast() {
  const status = useSyncExternalStore(subscribeAppStatus, getAppStatus, getServerAppStatus);
  const pathname = usePathname();

  // 링크가 가리키는 화면에 (링크가 아닌 길로) 와 있으면 걷는다 — 저장한 곳 위의 '저장한 곳 보기'. 다른 이동에는 알림이 그대로 남는다.
  const linkHref = status?.link?.href;
  useEffect(() => {
    if (linkHref && isAtStatusLink(pathname, linkHref)) clearAppStatus();
  }, [pathname, linkHref]);

  return (
    <div
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
              onClick={() => {
                // 먼저 닫는다 — onPress 가 새 알림을 띄우면 그 알림이 남아야 한다.
                const { onPress } = status.action!;
                clearAppStatus();
                onPress();
              }}
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
