import { useEffect, useState } from 'react';

/** Tailwind 의 lg. 지도 화면이 2단으로 갈리는 지점이다. */
const WIDE_QUERY = '(min-width: 1024px)';

/**
 * 지도 화면이 2단(좌측 결과 패널 + 지도)으로 보이는 폭인지.
 *
 * CSS 클래스(`lg:hidden`)로 시트를 숨길 수 없어서 폭을 자바스크립트로 직접 본다.
 * react-aria 의 ModalOverlay 는 document.body 로 포털되기 때문에, 감싸는 div 에
 * `lg:hidden` 을 걸어도 시트는 그 바깥에 그려져 그대로 열린다.
 * 데스크톱에서는 아예 마운트하지 않아야 포커스 트랩과 바깥 스크롤 잠금도 걸리지 않는다.
 */
export const useMapPageWideLayout = (): boolean => {
  const [isWide, setIsWide] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(WIDE_QUERY).matches,
  );

  useEffect(() => {
    const mql = window.matchMedia(WIDE_QUERY);
    const onChange = (event: MediaQueryListEvent) => setIsWide(event.matches);
    setIsWide(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return isWide;
};
