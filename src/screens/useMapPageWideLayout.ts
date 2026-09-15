import { useSyncExternalStore } from 'react';

/** Tailwind 의 lg. 지도 화면이 2단으로 갈리는 지점이다. */
const WIDE_QUERY = '(min-width: 1024px)';

const subscribe = (onChange: () => void) => {
  const mql = window.matchMedia(WIDE_QUERY);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
};

const getSnapshot = () => window.matchMedia(WIDE_QUERY).matches;

/**
 * 서버에서 미리 그릴 때는 화면 폭을 알 수 없다. 좁은 화면 쪽으로 가정하고,
 * 마운트 뒤 실제 값으로 맞춘다. 지도 자체가 ssr:false 라 실제로는 거의 쓰이지 않는다.
 */
const getServerSnapshot = () => false;

/**
 * 지도 화면이 2단(좌측 결과 패널 + 지도)으로 보이는 폭인지.
 *
 * CSS 클래스(`lg:hidden`)로 시트를 숨길 수 없어서 폭을 자바스크립트로 직접 본다.
 * react-aria 의 ModalOverlay 는 document.body 로 포털되기 때문에, 감싸는 div 에
 * `lg:hidden` 을 걸어도 시트는 그 바깥에 그려져 그대로 열린다.
 * 데스크톱에서는 아예 마운트하지 않아야 포커스 트랩과 바깥 스크롤 잠금도 걸리지 않는다.
 *
 * matchMedia 는 React 밖에 있는 상태라 useSyncExternalStore 로 읽는다 —
 * useEffect 안에서 setState 로 맞추면 첫 렌더가 한 번 더 도는 데다,
 * 구독을 걸기 전에 폭이 바뀌면 그 변화를 놓친다.
 */
export const useMapPageWideLayout = (): boolean =>
  useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
