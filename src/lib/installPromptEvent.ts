'use client';

import { useSyncExternalStore } from 'react';

/**
 * 브라우저의 설치 신호(`beforeinstallprompt`)를 받아 두는 곳(07 U9).
 *
 * 이 신호는 **페이지 로드당 한 번**, 어느 화면에서든 온다 — 사용자가 `/places` 로 들어와 나중에 홈으로 올 수 있다.
 * 홈 화면의 effect 에서 듣기 시작하면 그 사이에 온 신호를 놓친다. 그래서 모듈이 읽히는 순간 듣고, 셸(`appShell`)이
 * 이 모듈을 import 해 번들이 깨어나자마자 걸리게 한다. 받으면 `preventDefault` 로 브라우저 기본 미니 배너를 막고
 * 홈 하단 한 줄(`HomePageInstall`)이 그 신호로 설치 창을 연다.
 */

/** lib.dom 에 없다(Chromium 전용). 쓰는 두 칸만 적는다. */
type TBeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

let deferred: TBeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

const notify = () => {
  for (const listener of listeners) listener();
};

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferred = event as TBeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    notify();
  });
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** 설치 창을 열 수 있나. 서버(정적 HTML)에서는 늘 false. */
export const useCanPromptInstall = (): boolean =>
  useSyncExternalStore(
    subscribe,
    () => deferred !== null,
    () => false,
  );

/**
 * 설치 창을 연다. 신호는 **한 번만** 쓸 수 있어(두 번째 `prompt()` 는 거절된다) 결과와 상관없이 비운다 —
 * 사용자가 닫았으면 한 줄도 사라지고, 다음 로드에서 브라우저가 다시 신호를 주면 다시 선다.
 */
export async function promptInstall(): Promise<void> {
  const event = deferred;
  if (!event) return;
  deferred = null;
  notify();
  await event.prompt();
  await event.userChoice;
}
