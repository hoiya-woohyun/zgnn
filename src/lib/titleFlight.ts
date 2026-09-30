import type { TScrollMorphRange } from './stickyMorph';

/**
 * 상세 제목 줄(아이콘 타일 + 상호명)이 스크롤을 따라 **헤더 안의 제자리로 날아 들어가는** 기하 — 순수.
 * 쓰는 곳은 `src/screens/placeDetailHeader.tsx`.
 *
 * 세로는 계산하지 않는다. 줄은 본문과 같이 스크롤되므로, 줄의 세로 중심이 헤더 줄의 세로 중심에 닿는 스크롤(`range.to`)에서
 * 저절로 맞는다 — 크기는 왼쪽 가운데를 고정점으로(`origin-left`) 줄이므로 세로 중심이 움직이지 않는다.
 * 그 구간 동안 가로 이동과 배율만 0 → 1 로 바꾼다.
 */
export type TTitleFlightInput = {
  /** 스크롤 0 에서 줄의 세로 중심(스크롤 상자 기준). */
  rowCenter: number;
  /** 헤더 줄의 세로 중심(화면 기준 — 헤더는 맨 위에 붙어 있어 스크롤과 무관하다). */
  barCenter: number;
  /** 본문 타일의 왼쪽·폭, 타일 폭 대비 안쪽 글리프 폭의 비. */
  thumbLeft: number;
  thumbWidth: number;
  glyphRatio: number;
  /** 헤더 아이콘의 가운데·폭. */
  barIconCenterX: number;
  barIconWidth: number;
  /** 본문 상호명의 왼쪽·글자 크기, 헤더 상호명의 왼쪽·글자 크기. */
  titleLeft: number;
  titleFontSize: number;
  barTitleLeft: number;
  barTitleFontSize: number;
};

export type TTitleFlight = {
  range: TScrollMorphRange;
  thumb: { tx: number; scale: number };
  title: { tx: number; scale: number };
};

export function titleFlight(input: TTitleFlightInput): TTitleFlight {
  const to = Math.max(input.rowCenter - input.barCenter, 1);

  // 타일 안 글리프가 헤더 아이콘과 같은 크기가 되게 줄이고, 타일의 가운데를 헤더 아이콘의 가운데에 맞춘다.
  // 도착하면 타일(색 판)이 빠지고 같은 자리·같은 크기의 헤더 글리프가 남는다.
  const glyph = input.thumbWidth * input.glyphRatio;
  const thumbScale = glyph > 0 ? input.barIconWidth / glyph : 1;
  const thumbTx = input.barIconCenterX - (thumbScale * input.thumbWidth) / 2 - input.thumbLeft;

  const titleScale = input.titleFontSize > 0 ? input.barTitleFontSize / input.titleFontSize : 1;
  const titleTx = input.barTitleLeft - input.titleLeft;

  return {
    range: { from: 0, to },
    thumb: { tx: thumbTx, scale: thumbScale },
    title: { tx: titleTx, scale: titleScale },
  };
}
