/**
 * 둘러보기 목록에서 '이용하기 어려워요' 곳을 **목록 끝에 접는다**(08 T5.3). 순수 — 접힘 열림 상태는 화면 몫이다.
 *
 * '어려운 곳 숨기기'(`hideHard`)와는 다른 것이다. 숨기기는 조건이라 칩·곳 수·빈 상태에 들어가고, 접기는 **기본 보기**라
 * 머리의 곳 수("26곳 · 어려움 14")를 바꾸지 않는다 — 접힌 곳도 목록에 있다. 숨기기를 켜면 어려운 곳이 이미 없으므로 접을 것도 없다.
 *
 * 접지 않는 때:
 *  - 어려운 곳이 없다 — 접을 것이 없다.
 *  - **전부** 어렵다 — 접으면 빈 목록 위에 버튼 하나만 남는다. 그때 할 말(케이지·야외 자리 출구)은 머리 상자가 이미 한다(08 T2.5).
 *
 * 순서는 건드리지 않는다 — 각 쪽 안에서 들어온 순서 그대로다(판정순이면 어려운 곳이 원래 끝이라 그대로, 가까운 순·가격순이면 그 순서로 나뉜다).
 */
export function placesPageHardFold<T>(places: readonly T[], isHard: (place: T) => boolean): { shown: T[]; folded: T[] } {
  const shown = places.filter((place) => !isHard(place));
  if (shown.length === 0 || shown.length === places.length) return { shown: [...places], folded: [] };
  return { shown, folded: places.filter(isHard) };
}
