import { MARKER_HIT, mapPageMarkerClusterSize, type TClusterSummary } from './mapPageMarkerLayout';
import { pinIcon } from './naverMapPin';
import { SAVED_MARKER_COLOR, TYPE_COLOR } from './places';
import type { TPlaceType } from '../types';

/*
 * 지도 화면(`mapPageCanvas`)의 마커 아이콘 — 그림은 `naverMapPin` 그대로이고, 여기서는 **손이 닿는 자리**와 묶음 원을 만든다.
 * 상세의 미니 지도는 누를 수 없는 그림이라 이 파일을 거치지 않는다.
 */

/** 종류 × 선택 × 저장 12가지. 내용 문자열은 마커마다 SDK 가 DOM 으로 만들므로 나눠 써도 된다. */
const HIT_ICONS = new Map<string, { content: string; anchorX: number; anchorY: number }>();

/**
 * 장소 마커 — `pinIcon` 의 그림을 HTML 아이콘으로 감싼다.
 *
 * - **원은 44px 투명 상자 가운데에.** SDK 의 이미지 아이콘은 바깥 div 를 그림 크기(28px)·`overflow:hidden` 으로 박아
 *   히트 영역을 넓힐 길이 없다. HTML 아이콘의 바깥 div 는 내용 크기를 따르고, 상자 아무 데나 눌러도 SDK click 이 온다
 *   (2026-10-16 headless 실측 — 여백 자리 실제 클릭 1회). 넓혀도 되는 조건은 묶기다(`MARKER_GAP`).
 * - **고른 핀은 여백 없이 그림 크기 그대로.** 고른 곳은 묶음에서 꺼내 이웃과 간격을 못 지킬 수 있고 맨 위 층이라,
 *   여백을 두면 이웃 원의 몸통을 누른 손이 이미 고른 곳을 다시 고른다(아무 일도 안 일어난다).
 * - 셋 다 HTML 아이콘이다 — 이미지 ↔ HTML 을 `setIcon` 으로 오가면 이미지 쪽이 박은 크기·`overflow:hidden` 이 남을 수 있다.
 * - `<img draggable="false">` — 없으면 데스크톱에서 마커 위를 끌 때 지도 대신 그림이 끌려 나온다.
 *
 * `offset` 은 최대 확대의 고리(`mapPageMarkerLayout` 의 `spread`)가 그림을 옮기는 픽셀이다 — 좌표는 그대로, 앵커만 민다.
 */
export function mapPageMarkerIcon(
  maps: typeof naver.maps,
  type: TPlaceType,
  selected: boolean,
  saved: boolean,
  offset: { dx: number; dy: number } = { dx: 0, dy: 0 },
): naver.maps.HtmlIcon {
  const key = `${type}:${selected}:${saved}`;
  let base = HIT_ICONS.get(key);
  if (!base) {
    const image = pinIcon(maps, type, selected, saved);
    const { width, height } = image.size as naver.maps.Size;
    const { x: anchorX, y: anchorY } = image.anchor as naver.maps.Point;
    const boxWidth = selected ? width : Math.max(MARKER_HIT, width);
    const boxHeight = selected ? height : Math.max(MARKER_HIT, height);
    // 원은 앵커(원의 중심)가 상자 가운데에 오게, 핀은 그림이 곧 상자다.
    const left = selected ? 0 : boxWidth / 2 - anchorX;
    const top = selected ? 0 : boxHeight / 2 - anchorY;
    base = {
      content:
        `<div style="position:relative;width:${boxWidth}px;height:${boxHeight}px">` +
        `<img src="${image.url}" alt="" draggable="false" ` +
        `style="position:absolute;left:${left}px;top:${top}px;width:${width}px;height:${height}px;display:block;max-width:none"></div>`,
      anchorX: left + anchorX,
      anchorY: top + anchorY,
    };
    HIT_ICONS.set(key, base);
  }
  return { content: base.content, anchor: new maps.Point(base.anchorX - offset.dx, base.anchorY - offset.dy) };
}

/** 묶음 원의 테두리 두께(px) — 종류 비율을 이 고리의 색 몫으로 그린다. */
const CLUSTER_RING = 4;

/**
 * 24 칸 하트 — `naverMapPin` 의 저장 배지와 같은 선이다(그쪽은 data URI 안이라 꺼내 쓸 수 없다).
 * 모양만 같으면 되는 그림이라 한쪽을 고쳐도 아무것도 깨지지 않는다.
 */
const HEART =
  'M12 20.5C12 20.5 3 15 3 9.2 3 6.3 5.2 4.3 7.7 4.3c1.8 0 3.4 1 4.3 2.5.9-1.5 2.5-2.5 4.3-2.5 2.5 0 4.7 2 4.7 4.9 0 5.8-9 11.3-9 11.3Z';

/**
 * 종류 비율 고리 — `conic-gradient` 로 숙소·식당·카페의 몫을 12시부터 시계 방향으로.
 * 기본 줌(390px 에서 10)이면 첫 화면 대부분이 묶음이라, 섞인 묶음을 한 색으로 칠하면 지도가 답하는 단 하나
 * ("숙소·식당·카페가 어디 있나", ADR-008)가 첫 화면에서 사라진다.
 */
export function mapPageMarkerClusterRing(types: TClusterSummary['types']): string {
  const total = types.reduce((sum, entry) => sum + entry.count, 0);
  if (types.length === 1) return TYPE_COLOR[types[0].type];
  let from = 0;
  const stops = types.map(({ type, count }) => {
    const to = from + (count / total) * 100;
    const stop = `${TYPE_COLOR[type]} ${+from.toFixed(2)}% ${+to.toFixed(2)}%`;
    from = to;
    return stop;
  });
  return `conic-gradient(${stops.join(', ')})`;
}

/**
 * 묶음 원 — 흰 원 안에 "N곳", 테두리는 종류 비율 고리, 저장한 곳이 들어 있으면 오른쪽 위에 하트 배지.
 * 원 마커(종류 색으로 칠한 원)와 모양부터 달라 "장소 하나" 가 아니라 "여럿" 으로 읽힌다.
 * 히트 영역은 원 마커와 같은 44px 상자다. 크기는 마커처럼 px 고정(ADR-006 의 축 밖).
 */
export function mapPageMarkerClusterIcon(maps: typeof naver.maps, summary: TClusterSummary): naver.maps.HtmlIcon {
  const size = mapPageMarkerClusterSize(summary.count);
  const box = Math.max(MARKER_HIT, size);
  const inset = (box - size) / 2;
  const badge = 16;
  // 배지 중심을 원의 오른쪽 위 45° 테두리 위에 — 원 마커의 저장 배지와 같은 자리다.
  const badgeCenter = box / 2 + (size / 2) * Math.SQRT1_2;
  const badgeTop = box - badgeCenter - badge / 2;
  return {
    content:
      `<div style="position:relative;width:${box}px;height:${box}px">` +
      `<div class="shadow-md" style="position:absolute;left:${inset}px;top:${inset}px;width:${size}px;height:${size}px;` +
      `box-sizing:border-box;padding:${CLUSTER_RING}px;border-radius:9999px;background:${mapPageMarkerClusterRing(summary.types)}">` +
      `<div class="bg-primary text-primary" style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;` +
      `border-radius:9999px;font-size:${summary.count < 100 ? 12 : 11}px;font-weight:700;line-height:1;letter-spacing:-0.02em;white-space:nowrap">` +
      `${summary.count}곳</div></div>` +
      (summary.saved > 0
        ? `<svg width="${badge}" height="${badge}" viewBox="0 0 16 16" aria-hidden="true" ` +
          `style="position:absolute;left:${badgeCenter - badge / 2}px;top:${badgeTop}px">` +
          `<circle cx="8" cy="8" r="7" fill="${SAVED_MARKER_COLOR}" stroke="#fff" stroke-width="1.5"/>` +
          `<path d="${HEART}" fill="#fff" transform="translate(8 8.1) scale(0.4) translate(-12 -12.4)"/></svg>`
        : '') +
      `</div>`,
    anchor: new maps.Point(box / 2, box / 2),
  };
}
