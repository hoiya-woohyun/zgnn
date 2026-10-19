/**
 * 지도 시야(중심·줌)를 history 항목에 적어 두고 다시 읽는다(14 W261019.15b).
 *
 * 지도 시트 카드로 상세에 갔다가 뒤로 오면 지도 화면은 **새로 마운트**된다. 고른 곳은 주소(`?place=`)가 되살리지만 시야는 어디에도 없어,
 * 그대로 두면 미니 지도에서 들어온 것처럼 고른 곳으로 확대해 열린다 — 섬 전체를 보다가 핀 하나를 열고 돌아온 사람에게 지도가 저절로 줌 14 가 된다.
 * 그래서 떠나는 링크를 누를 때 그 항목에 시야를 적고(`mapPageCanvas`), 지도를 만들 때 있으면 그 시야로 연다.
 *
 * 값을 history.state 에 두는 이유는 깊이 새김(`appHistory`)과 같다 — **항목마다** 다르다. 탭으로 다시 온 지도는 다른(갈아 끼운) 항목이라 첫 화면으로,
 * 미니 지도에서 온 지도는 새 항목이라 고른 곳으로, 뒤로 온 지도만 떠날 때의 시야로 열린다. 새로고침도 브라우저가 state 를 남겨 같다.
 */

const VIEW_KEY = 'zgnnMapView';

export type TMapPageView = { lat: number; lng: number; zoom: number };

/** history.state 에 적힌 시야. 없거나 모양이 틀리면 null — 그때는 평소처럼 연다. */
export const mapPageViewMemoOf = (state: unknown): TMapPageView | null => {
  if (typeof state !== 'object' || state === null) return null;
  const view = (state as Record<string, unknown>)[VIEW_KEY];
  if (typeof view !== 'object' || view === null) return null;
  const { lat, lng, zoom } = view as Record<string, unknown>;
  if (typeof lat !== 'number' || typeof lng !== 'number' || typeof zoom !== 'number') return null;
  if (![lat, lng, zoom].every(Number.isFinite) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || zoom < 1 || zoom > 22) return null;
  return { lat, lng, zoom };
};

/**
 * 지금 state 에 시야를 얹은 새 state. 다른 값(Next 의 `__NA`·트리, 깊이·탭 새김)은 그대로 둔다 — `__NA` 가 남아야 Next 의 replaceState
 * 패치가 이 호출을 자기 것으로 보고 라우터를 건드리지 않는다(`appHistory` 의 `stampHistoryDepth` 와 같은 길).
 */
export const withMapPageViewMemo = (state: unknown, view: TMapPageView): Record<string, unknown> => ({
  ...(typeof state === 'object' && state !== null ? (state as Record<string, unknown>) : {}),
  [VIEW_KEY]: view,
});
