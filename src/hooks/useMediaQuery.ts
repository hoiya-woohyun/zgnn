import { useSyncExternalStore } from 'react';

/**
 * 미디어 쿼리 결과를 React 상태처럼 읽는다.
 *
 * CSS(`md:hidden`)로 못 가르는 경우에만 쓴다 — react-aria 의 ModalOverlay/Popover 는
 * document.body 로 포털되기 때문에, 감싸는 div 를 숨겨도 그 바깥에 그려진다.
 * 이런 것은 폭에 따라 아예 마운트하지 말아야 포커스 트랩·스크롤 잠금도 안 걸린다.
 *
 * matchMedia 는 React 밖의 상태라 useSyncExternalStore 로 읽는다 — useEffect 안에서
 * setState 로 맞추면 첫 렌더가 한 번 더 도는 데다, 구독을 걸기 전에 폭이 바뀌면 놓친다.
 *
 * 정적 HTML 을 미리 그릴 때는 화면 폭을 알 수 없으므로 `false` 로 가정하고 마운트 뒤
 * 실제 값으로 맞춘다. 쿼리를 쓰는 쪽은 "false 인 쪽"이 첫 프레임에 보여도 되는 쪽이어야 한다.
 */
export const useMediaQuery = (query: string): boolean =>
  useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
