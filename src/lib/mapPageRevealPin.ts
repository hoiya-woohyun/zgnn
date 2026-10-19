/**
 * 고른 핀이 하단 시트 밑에 가려질 때 지도를 얼마나 밀어야 하나(14 W261019.14a, haeun-11a).
 *
 * 전부 **뷰포트 좌표(px)** 다 — 핀은 마커 요소의 `getBoundingClientRect()`, 시트는 화면 맨 아래에 붙어 높이만큼 덮는다.
 * 보이는 띠는 `위 칩 줄 ~ (시트 윗변 − 여백)` 이다. 핀 밑끝(뾰족한 곳)이 띠 밑 밖이면 그만큼, 핀 윗끝이 칩 줄에 걸리면 반대로
 * (밑끝이 띠를 넘지 않는 만큼만) 민다. 이미 띠 안이면 0 — 안 움직인다.
 *
 * 돌려주는 값은 `map.panBy(0, dy)` 의 dy: 양수면 지도 내용이 위로 올라간다. 시트가 없으면(넓은 화면의 옆 패널·시트 닫힘) 0.
 */
export type TRevealPinInput = {
  /** 지도 칸의 윗변·아랫변. */
  mapTop: number;
  mapBottom: number;
  /** 지도 위에 뜬 칩 줄이 덮는 높이. */
  topInset: number;
  /** 시트 높이 — 0 이면 가려지는 게 없다. */
  sheetHeight: number;
  /** 시트가 붙은 뷰포트 아랫변(`window.innerHeight`). */
  viewportBottom: number;
  pinTop: number;
  pinBottom: number;
  /** 핀과 시트·칩 줄 사이 숨 쉴 틈. */
  margin: number;
};

export function mapPageRevealPin(input: TRevealPinInput): number {
  const { mapTop, mapBottom, topInset, sheetHeight, viewportBottom, pinTop, pinBottom, margin } = input;
  const values = [mapTop, mapBottom, topInset, sheetHeight, viewportBottom, pinTop, pinBottom, margin];
  if (values.some((value) => !Number.isFinite(value)) || sheetHeight <= 0 || pinBottom <= pinTop) return 0;

  const bandTop = mapTop + topInset;
  const bandBottom = Math.min(mapBottom, viewportBottom - sheetHeight) - margin;
  // 띠가 핀보다 좁으면(시트가 화면 대부분) 뾰족한 끝이 보이는 쪽을 택한다.
  if (bandBottom <= bandTop) return pinBottom > bandBottom ? Math.round(pinBottom - bandBottom) : 0;

  if (pinBottom > bandBottom) return Math.round(pinBottom - bandBottom);
  if (pinTop < bandTop) return Math.round(Math.max(pinTop - bandTop, pinBottom - bandBottom));
  return 0;
}
