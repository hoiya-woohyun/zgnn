import { useMediaQuery } from '@/hooks/useMediaQuery';

/** Tailwind 의 lg. 지도 화면이 2단으로 갈리는 지점이다. */
const WIDE_QUERY = '(min-width: 1024px)';

/**
 * 지도 화면이 2단(좌측 결과 패널 + 지도)으로 보이는 폭인지.
 *
 * CSS 클래스(`lg:hidden`)로 시트를 숨길 수 없어서 폭을 자바스크립트로 직접 본다
 * (이유는 useMediaQuery 참조). 서버에서는 좁은 화면 쪽으로 가정하는데, 지도 자체가
 * ssr:false 라 실제로는 거의 쓰이지 않는다.
 */
export const useMapPageWideLayout = (): boolean => useMediaQuery(WIDE_QUERY);
