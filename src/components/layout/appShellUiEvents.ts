import { useEffect, useRef } from 'react';
import { isAdminRoute, rememberTap, tapOf, type TTapMemory } from '../../lib/uiEvents';
import { flushUiEvents, markOperatorDevice, recordUiEvent } from '../../lib/uiEventsSend';

/**
 * 셸이 듣는 실사용 이벤트(ADR-029). 화면마다 코드를 붙이지 않는다 — 이동은 셸이 이미 다 알고(경로가 바뀔 때 `view` 한 줄),
 * 탭은 문서에 단 click 하나가 받는다. 화면 쪽 몫은 이름표(`data-ev`)뿐이고, 그것도 없으면 요소 종류로 적힌다(`uiEvents.ts`).
 *
 * **click 은 문서 capture 로 듣는다.** react-aria 의 `usePress`(Untitled 의 `Button`)는 누름을 처리한 뒤 `stopPropagation()` 을 부르는데,
 * React 17+ 에서는 그게 네이티브 이벤트를 위임 루트에서 멈춰서 문서의 bubble 리스너까지 오지 않는다. capture 는 루트보다 먼저 본다 —
 * `appShellStack` 이 링크를 먼저 보는 것과 같은 자리다.
 *
 * `/admin` 은 적지 않고, 그 화면을 연 기기는 운영자 기기로 표시해 그 뒤로도 안 적는다.
 */
export function useAppShellUiEvents(pathname: string) {
  useEffect(() => {
    if (isAdminRoute(pathname)) {
      markOperatorDevice();
      return;
    }
    recordUiEvent('view', { pathname });
  }, [pathname]);

  const lastTap = useRef<TTapMemory>(null);
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const tap = tapOf(event.target instanceof Element ? event.target : null, window.location.origin);
      if (!tap) return;
      const { memory, echo, rage } = rememberTap(lastTap.current, tap.target, event.timeStamp);
      lastTap.current = memory;
      if (echo) return;
      recordUiEvent(tap.name, { target: tap.target });
      if (rage) recordUiEvent('rage', { target: tap.target });
    };
    // 화면을 내릴 때 남은 꼬리를 보낸다. 홈 화면에 띄운 PWA 는 앱을 바꿀 때 `pagehide` 없이 숨기만 하므로 둘 다 듣는다.
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flushUiEvents();
    };
    document.addEventListener('click', onClick, { capture: true, passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flushUiEvents);
    return () => {
      document.removeEventListener('click', onClick, { capture: true });
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flushUiEvents);
    };
  }, []);
}
