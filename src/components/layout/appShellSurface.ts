/**
 * `<main>` 한 장의 규격. **셸과 엿보기가 같은 것을 쓴다.**
 *
 * 화면을 좌우로 미는 동안 옆에서 따라 들어오는 엿보기(`appShellSwipePeek`)는 도착했을 때의
 * 모습과 픽셀이 이어져야 한다. 폭·가운데 정렬·상태바 여백·탭바 여백이 한 군데라도 어긋나면
 * 손가락을 놓는 순간 내용이 옆으로 몇 픽셀 튄다 — 그 튐은 "덜 만든 느낌" 으로 읽힌다.
 * 그래서 규격을 여기 한 곳에 두고 양쪽이 같은 함수를 부른다.
 */

/**
 * 스크롤 화면의 아래 여백. 탭바 높이(appTabBar)에 여유를 더해
 * 마지막 줄이 탭바에 가리지 않게 한다.
 */
export const CONTENT_BOTTOM_SPACE = 'calc(76px + env(safe-area-inset-bottom, 0px))';

/**
 * 지도 화면만 예외로 콘텐츠 폭을 제한하지 않고 아래 여백도 두지 않는다 —
 * 지도는 남는 공간을 전부 쓰는 편이 쓸모 있고, 아래 여백을 두면 타일이 안 깔린 띠가 남는다.
 * 상태바 여백도 없다 — 타일이 상태바 밑까지 깔리는 편이 지도답다(ADR-010).
 */
export const mainSurfaceProps = (isMap: boolean) => ({
  className: isMap ? '' : 'mx-auto w-full max-w-3xl',
  style: isMap
    ? undefined
    : { paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: CONTENT_BOTTOM_SPACE },
});
