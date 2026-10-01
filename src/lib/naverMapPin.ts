import { SAVED_MARKER_COLOR, TYPE_COLOR } from './places';
import { PLACE_TYPE_GLYPH } from './placeTypeGlyph';
import type { TPlaceType } from '../types';

/*
 * 지도 마커 — 지도 화면(`mapPageCanvas`)과 상세의 미니 지도(`placeDetailMiniMap`)가 같은 마커를 쓴다.
 * 두 곳의 모양이 갈라지지 않게 여기 한 벌만 둔다.
 */

/**
 * 마커는 두 모양이다(2026-10-01 사용자 결정, ADR-008 v17).
 *
 * - **평소에는 원**: 종류 색 원 + 흰 테두리 + 흰 종류 아이콘. 이 지도는 81곳이 북·동 해안에 몰려
 *   마커가 겹치는데, 꼬리가 없는 원은 같은 자리에 덜 겹치고 겹쳐도 아이콘이 덜 가려진다.
 *   같은 크기에서 아이콘도 핀의 흰 원 안보다 크게 들어간다.
 * - **고른 곳 하나만 핀**: 네이버 표준 핀의 몸통(아래)에 같은 색·같은 아이콘. 원은 가운데가
 *   좌표라 "정확히 어디" 가 흐린데, 고른 곳에서만 그 답이 필요하다. 상세의 미니 지도도 그 장소를
 *   고른 상태라 핀이다.
 *
 * 아이콘은 화면 아이콘과 같은 선 데이터(`PLACE_TYPE_GLYPH`)다. 색을 종류별로 두는 이유는 이 앱에
 * 장소 사진이 없어서다(ADR-002) — 색값은 `TYPE_COLOR` 그대로 쓴다.
 *
 * 흰 테두리는 겹친 마커끼리 색이 붙어 경계가 뭉개지지 않게 하는 후광이다. 지우려면 겹치는 구간을
 * 먼저 눈으로 확인할 것.
 */

/** 원 마커의 캔버스(px = viewBox 칸). 가운데가 좌표다. */
const CIRCLE = 28;
const CIRCLE_CENTER = CIRCLE / 2;
/** 색 원 반지름. 흰 테두리 2 의 절반이 밖으로 나가 12.5 — 그 밖 1.5 는 그림자 몫이다. */
const CIRCLE_RADIUS = 11.5;

/**
 * 저장한 곳의 원. 원 오른쪽 위에 하트 배지(반지름 5.5 · 흰 테두리 1.5)를 얹는다 — 원 안의 아이콘을
 * 하트로 바꾸면 저장한 곳만 종류를 잃는다. 배지가 위·오른쪽으로 넘으므로 캔버스를 32 로 넓히고
 * 원을 아래로 3 내린다. 앵커는 원의 중심이라 **저장 여부와 무관하게 원은 같은 자리**에 온다.
 */
const SAVED_CIRCLE = 32;
const SAVED_CIRCLE_SHIFT_Y = 3;

const PIN_SELECTED = { width: 32, height: 48 } as const;

/**
 * 고른 곳의 핀 — 네이버 표준 핀(`marker-default.png`, 22×33)의 픽셀을 재서 옮긴 몸통이다(2026-09-28).
 * 가로:세로 2:3, 머리 반지름 10.5 를 흰 테두리가 잘리지 않게 10.2 로만 줄였다. `stroke` 는 선 중앙에
 * 걸려 절반(0.75)이 밖으로 나가는데, 10.5 로 두면 좌우가 viewBox 를 0.25 넘어가 **테두리만 납작하게
 * 잘린다**(빌드는 통과한다). 꼬리 끝을 32.2 에 두는 것도 같은 이유다.
 *
 * 꼬리 끝의 `stroke-linejoin` 을 `round` 로 두는 것도 같은 계산이다. 기본값 miter 면 획이 꼭짓점
 * **너머로** 뻗어(0.75 × 1.61 = 1.21) 32.2 + 1.21 = 33.41 로 viewBox 를 넘어 끝만 잘린다.
 *
 * 표준 핀은 흰 원 안에 색 ▼ 를 두지만, 이 핀은 원 마커와 같은 말을 해야 해서 **색 머리 + 흰 아이콘**이다.
 */
const PIN_VIEWBOX = { width: 22, height: 33 } as const;

/** 핀 + 하트 배지. 배지가 viewBox 를 넘으므로 캔버스를 29×35 로 넓히고 핀을 2 내린다. 몸통 크기·앵커는 같다. */
const SAVED_PIN_VIEWBOX = { width: 29, height: 35 } as const;
const SAVED_PIN_SHIFT_Y = 2;

/** 24 칸 기준 하트(가로 3~21, 세로 4.3~20.5, 중심 12, 12.4). 배지 안에 줄여 넣는다. */
const HEART =
  'M12 20.5C12 20.5 3 15 3 9.2 3 6.3 5.2 4.3 7.7 4.3c1.8 0 3.4 1 4.3 2.5.9-1.5 2.5-2.5 4.3-2.5 2.5 0 4.7 2 4.7 4.9 0 5.8-9 11.3-9 11.3Z';

/**
 * 24 칸 종류 아이콘을 `scale` 로 줄여 (cx, cy) 가운데에 흰 선으로 놓는다.
 *
 * 획(`GLYPH_STROKE`)은 화면 아이콘의 2 보다 굵다 — 줄이면 획도 같이 가늘어져 1px 아래로 떨어지고,
 * 지도 위에서 흐릿하게 사라진다. 그림을 고칠 때는 **원 마커 크기에서** 읽히는지 본다.
 */
const GLYPH_STROKE = 2.5;

function glyphSvg(type: TPlaceType, cx: number, cy: number, scale: number): string {
  const x = +(cx - 12 * scale).toFixed(2);
  const y = +(cy - 12 * scale).toFixed(2);
  const paths = PLACE_TYPE_GLYPH[type].map((d) => `<path d="${d}"/>`).join('');
  return (
    `<g transform="translate(${x} ${y}) scale(${scale})" fill="none" stroke="#fff" ` +
    `stroke-width="${GLYPH_STROKE}" stroke-linecap="round" stroke-linejoin="round">${paths}</g>`
  );
}

/** 저장 하트 배지. (cx, cy) 는 배지 중심. */
function heartBadgeSvg(cx: number, cy: number): string {
  return (
    `<circle cx="${cx}" cy="${cy}" r="5.5" fill="${SAVED_MARKER_COLOR}" stroke="#fff" stroke-width="1.5"/>` +
    `<path d="${HEART}" fill="#fff" transform="translate(${cx} ${cy + 0.1}) scale(0.34) translate(-12 -12.4)"/>`
  );
}

const dataUri = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

/**
 * 원 마커 SVG. 외부 이미지를 받지 않아 오프라인에서도 그려진다(런타임 외부 요청을 늘리지 않는다).
 * 그림자는 필터 대신 살짝 내린 반투명 원 하나다 — 마커 수십 개에 SVG 필터를 걸면 지도를 끌 때 무겁다.
 */
function circleSvg(type: TPlaceType, saved: boolean): { url: string; size: number; cy: number } {
  const size = saved ? SAVED_CIRCLE : CIRCLE;
  const cy = CIRCLE_CENTER + (saved ? SAVED_CIRCLE_SHIFT_Y : 0);
  const cx = CIRCLE_CENTER;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    `<circle cx="${cx}" cy="${cy + 0.6}" r="13" fill="#000" fill-opacity="0.18"/>` +
    `<circle cx="${cx}" cy="${cy}" r="${CIRCLE_RADIUS}" fill="${TYPE_COLOR[type]}" stroke="#fff" stroke-width="2"/>` +
    glyphSvg(type, cx, cy, 0.58) +
    (saved ? heartBadgeSvg(cx + 9.5, cy - 9.5) : '') +
    `</svg>`;
  return { url: dataUri(svg), size, cy };
}

/** 고른 곳의 핀 SVG. 머리는 중심 (11, 11.4)·반지름 10.2 의 원, 꼬리는 (11, 32.2) 까지. */
function pinSvg(type: TPlaceType, saved: boolean, width: number, height: number): string {
  const body =
    'M11 1.2 C5.367 1.2 0.8 5.767 0.8 11.4 c0 7.9 10.2 20.8 10.2 20.8 S21.2 19.3 21.2 11.4 C21.2 5.767 16.633 1.2 11 1.2 Z';
  const pin =
    `<path d="${body}" fill="${TYPE_COLOR[type]}" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/>` +
    glyphSvg(type, 11, 11.4, 0.5);
  const box = saved ? SAVED_PIN_VIEWBOX : PIN_VIEWBOX;
  // width·height 를 박아 둔다 — 없으면 SVG 의 고유 크기가 브라우저 기본값(150 높이)으로 잡힌다.
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${box.width} ${box.height}">` +
    (saved ? `<g transform="translate(0 ${SAVED_PIN_SHIFT_Y})">${pin}</g>` + heartBadgeSvg(22.5, 6.5) : pin) +
    `</svg>`;
  return dataUri(svg);
}

/**
 * 아이콘은 종류 × 선택여부 × 저장여부 12가지뿐이라 한 번 만들어 두고 계속 쓴다.
 * 선택을 옮길 때마다 새 객체를 만들면 SDK 가 이미지를 다시 물어본다.
 */
const PIN_ICONS = new Map<string, naver.maps.ImageIcon>();

/** 마커 아이콘. 고른 곳(`selected`)이면 핀, 아니면 원이다. */
export function pinIcon(
  maps: typeof naver.maps,
  type: TPlaceType,
  selected: boolean,
  saved: boolean,
): naver.maps.ImageIcon {
  const key = `${type}:${selected}:${saved}`;
  const cached = PIN_ICONS.get(key);
  if (cached) return cached;

  let icon: naver.maps.ImageIcon;
  if (selected) {
    // 핀 좌표계 1칸이 몇 px 인가. 저장 핀은 캔버스만 넓고 이 비율은 같다.
    const scale = PIN_SELECTED.width / PIN_VIEWBOX.width;
    const box = saved ? SAVED_PIN_VIEWBOX : PIN_VIEWBOX;
    const width = box.width * scale;
    const height = box.height * scale;
    icon = {
      url: pinSvg(type, saved, width, height),
      size: new maps.Size(width, height),
      // 좌표에 맞출 지점은 핀의 **끝**이다 — 가운데로 두면 핀이 장소보다 아래를 가리킨다.
      // 가로는 핀 몸통의 가운데(핀 좌표 11)다 — 저장 핀은 배지 때문에 캔버스 가운데가 아니다.
      anchor: new maps.Point((PIN_VIEWBOX.width / 2) * scale, height),
    };
  } else {
    const { url, size, cy } = circleSvg(type, saved);
    icon = {
      url,
      size: new maps.Size(size, size),
      // 원은 **가운데**가 좌표다. 저장 원은 배지 때문에 원이 아래로 내려가 있어 캔버스 가운데가 아니다.
      anchor: new maps.Point(CIRCLE_CENTER, cy),
    };
  }
  PIN_ICONS.set(key, icon);
  return icon;
}
