'use client';

import { useEffect } from 'react';
import { showAppStatus } from '../../lib/appStatus';

/**
 * 새 서비스워커가 이 화면을 맡으면 알린다 — "새 정보가 있어요 · 새로고침"(12 U2.4). 그리는 것은 없다(셸 토스트가 그린다).
 *
 * **처음 설치는 알리지 않는다.** `clientsClaim` 이라 첫 방문에도 서비스워커가 화면을 맡으며 `controllerchange` 가 한 번 오는데,
 * 그때는 바뀐 것이 없다. 마운트 때 이미 맡은 서비스워커가 있었을 때만 "새" 버전이다.
 * 알림은 새로고침을 강요하지 않는다 — 폼을 쓰던 사람이 있다. 10초 동안 떠 있다.
 */
export function AppShellUpdateNotice() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const container = navigator.serviceWorker;
    const hadController = container.controller !== null;
    const onChange = () => {
      if (!hadController) return;
      showAppStatus('새 정보가 있어요', {
        action: { label: '새로고침', onPress: () => window.location.reload() },
        durationMs: 10_000,
      });
    };
    container.addEventListener('controllerchange', onChange);
    return () => container.removeEventListener('controllerchange', onChange);
  }, []);

  return null;
}
