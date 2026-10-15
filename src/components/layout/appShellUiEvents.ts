import { useEffect, useRef } from 'react';
import {
  coversViewport,
  INTERACTIVE_SELECTOR,
  isAdminRoute,
  isDragClick,
  rememberTap,
  tapOf,
  type TTapMemory,
} from '../../lib/uiEvents';
import { flushUiEvents, markOperatorDevice, recordUiEvent } from '../../lib/uiEventsSend';

/**
 * 셸이 듣는 실사용 이벤트(ADR-029). 화면마다 코드를 붙이지 않는다 — 이동은 셸이 이미 다 알고(경로가 바뀔 때 `view` 한 줄),
 * 탭은 문서에 단 click 하나가 받는다. 화면 쪽 몫은 이름표(`data-ev`)뿐이고, 그것도 없으면 요소 종류로 적힌다(`uiEvents.ts`).
 *
 * **click 은 문서 capture 로 듣는다.** react-aria 의 `usePress`(Untitled 의 `Button`)는 누름을 처리한 뒤 `stopPropagation()` 을 부르는데,
 * React 17+ 에서는 그게 네이티브 이벤트를 위임 루트에서 멈춰서 문서의 bubble 리스너까지 오지 않는다. capture 는 루트보다 먼저 본다 —
 * `appShellStack` 이 링크를 먼저 보는 것과 같은 자리다.
 *
 * 세지 않는 클릭 셋 — 끌다 놓은 것(페이저가 React 쪽에서 멈추지만 문서 capture 가 먼저 본다) · 화면을 덮는 바탕(시트·모달을 닫는 손짓) ·
 * label 이 안의 input 에 넘기는 메아리(`rememberTap`).
 *
 * **iOS Safari 는 눌리지 않는 요소의 click 을 문서 위임만으로는 보내지 않는다**(MDN 「Safari Mobile」 — 요소나 `body` 아래 조상에 리스너가 있어야 한다).
 * 그래서 `<main>` 에 빈 리스너를 하나 단다. 탭 하이라이트는 전역에서 투명이라(globals.css) 화면에는 아무 차이가 없다. 실기기 확인 전이다(ADR-029).
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
    let down: { x: number; y: number } | null = null;
    const onPointerDown = (event: PointerEvent) => {
      down = { x: event.clientX, y: event.clientY };
    };
    const onClick = (event: MouseEvent) => {
      const dragged = isDragClick(down, { x: event.clientX, y: event.clientY });
      down = null;
      // 키보드로 누른 click 은 좌표가 0 이다 — 누른 자리가 없으면 끌기로 보지 않는다(`down` 이 null).
      if (dragged) return;
      const el = event.target instanceof Element ? event.target : null;
      if (
        el &&
        !el.closest(INTERACTIVE_SELECTOR) &&
        coversViewport(el.getBoundingClientRect(), { width: window.innerWidth, height: window.innerHeight })
      ) {
        return;
      }
      const tap = tapOf(el, window.location.origin);
      if (!tap) return;
      const { memory, echo, rage } = rememberTap(lastTap.current, tap.node, event.timeStamp);
      lastTap.current = memory;
      if (echo) return;
      recordUiEvent(tap.name, { target: tap.target });
      if (rage) recordUiEvent('rage', { target: tap.target });
    };
    // 화면을 내릴 때 남은 꼬리를 보낸다. 홈 화면에 띄운 PWA 는 앱을 바꿀 때 `pagehide` 없이 숨기만 하므로 둘 다 듣는다.
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flushUiEvents(true);
    };
    const onPageHide = () => flushUiEvents(true);
    const iosClickable = () => {};
    const main = document.getElementById('main-content');
    main?.addEventListener('click', iosClickable);
    document.addEventListener('pointerdown', onPointerDown, { capture: true, passive: true });
    document.addEventListener('click', onClick, { capture: true, passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      main?.removeEventListener('click', iosClickable);
      document.removeEventListener('pointerdown', onPointerDown, { capture: true });
      document.removeEventListener('click', onClick, { capture: true });
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, []);
}
