import { SAVED_MARKER_COLOR, TYPE_COLOR } from './places';
import type { TPlaceType } from '../types';

/*
 * 지도 핀 — 지도 화면(`mapPageCanvas`)과 상세의 미니 지도(`placeDetailMiniMap`)가 같은 핀을 쓴다.
 * 두 곳의 핀 모양이 갈라지지 않게 여기 한 벌만 둔다.
 */

/**
 * 핀의 **모양은 네이버 표준을 그대로 따르고**, 우리가 정하는 것은 **색 하나**다.
 *
 * 모양은 추측이 아니라 SDK 가 쓰는 기본 마커 에셋(`marker-default.png`, 22×33)을 받아
 * 픽셀을 재서 옮긴 것이다(2026-09-28). 그 핀의 특징은 셋이다 —
 *  1. 가로:세로가 **2:3**(22×33). 예전 핀은 26×36(1:1.38)이라 더 뭉툭했다.
 *  2. 머리의 **대부분이 흰 원**이다(바깥 반지름 10.5 중 흰 원이 8 — 색 테두리는 2.5뿐).
 *  3. 그 흰 원 안에 **종류 색 역삼각형(▼)** 이 있다. 이게 네이버 핀을 네이버 핀으로 읽히게
 *     하는 부분이라, 흰 ▼ 로 뒤집지 않는다 — 뒤집으면 아무도 네이버 핀으로 보지 않는다.
 *     삼각형은 **무게중심**이 흰 원의 중심에 오게 놓는다(에셋의 구성이 그렇다).
 *
 * 색을 종류별로 남기는 이유는 이 앱에 장소 사진이 없어서다(ADR-002) — 종류를 가르는 신호가
 * 색뿐이라 표준 핀의 파랑 하나로 통일할 수 없다. 색값 자체는 `TYPE_COLOR` 그대로 쓴다.
 *
 * 흰 테두리(`stroke`)는 **표준 에셋에 없는 의도적 이탈**이다. 이 지도는 81곳이 북·동 해안에
 * 몰려 마커가 서로 겹치는데, 표준 핀은 머리가 이미 흰색이라 후광이 없으면 겹친 핀들의
 * 색 테두리끼리 붙어 경계가 뭉갠다. 지우려면 겹치는 구간을 먼저 눈으로 확인할 것.
 *
 * 예전에는 종류마다 원·둥근사각·물방울을 직접 그리고 판정에 따라 테두리를 점선으로 바꾸거나
 * 회색을 입혔는데, 지도 위에서 그 차이는 읽히지 않으면서 코드만 무거웠다. 지금도 지도는
 * "어디에 몇 곳이 있나" 만 답하고, 종류·판정의 자세한 구분은 마커를 눌러 열리는 시트와
 * 목록 화면이 맡는다(→ ADR-008).
 */
const PIN = { width: 24, height: 36 } as const;
const PIN_SELECTED = { width: 32, height: 48 } as const;

/**
 * 표준 핀의 치수. 에셋(22×33)에서 잰 값을 그대로 쓰되, 흰 테두리가 잘리지 않게 머리를
 * 반지름 10.5 → 10.2 로만 줄였다. `stroke` 는 선 중앙에 걸려 절반(0.75)이 밖으로 나가는데,
 * 10.5 로 두면 좌우가 viewBox 를 0.25 넘어가 **테두리만 납작하게 잘린다**(빌드는 통과한다).
 * 꼬리 끝을 32.2 에 두는 것도 같은 이유다 — 33 에 붙이면 끝이 잘리며 앵커가 어긋나 보인다.
 *
 * 꼬리 끝의 `stroke-linejoin` 을 `round` 로 두는 것도 같은 계산이다. 기본값 miter 면 끝이
 * 뾰족해 획이 꼭짓점 **너머로** 뻗는데(두 접선이 이루는 각 ~77° → 0.75 × 1.61 = 1.21),
 * 32.2 + 1.21 = 33.41 로 viewBox 를 넘어 끝만 잘린다. round 는 0.75 로 끝나 32.95 에 멈춘다.
 * 에셋의 끝도 바늘처럼 뾰족하지 않고 살짝 뭉툭하다.
 */
const PIN_VIEWBOX = { width: 22, height: 33 } as const;

/**
 * 저장한 곳의 핀. 핀은 그대로 두고 **머리 오른쪽 위에 하트 배지**를 얹는다 — 흰 원 안의 ▼ 를
 * 하트로 바꾸지 않는 이유는 위 주석과 같다(▼ 가 네이버 핀을 네이버 핀으로 읽히게 한다).
 *
 * 배지(중심 22.5, 6.5 · 반지름 5.5 · 흰 테두리 1.5)가 핀 viewBox 를 오른쪽·위로 넘으므로 캔버스를
 * 29×35 로 넓히고 핀을 아래로 2 내린다. 오른쪽 끝 22.5+5.5+0.75=28.75, 위 끝 6.5-5.5-0.75=0.25,
 * 꼬리 끝 32.2+2+0.75=34.95 — 모두 안쪽이다. 핀 좌표계의 비율(24/22)은 그대로라, 저장 여부와
 * 무관하게 **핀 몸통의 크기와 앵커(꼬리 끝)는 같은 자리**에 온다.
 */
const SAVED_PIN_VIEWBOX = { width: 29, height: 35 } as const;
const SAVED_PIN_SHIFT_Y = 2;

/** 24 칸 기준 하트(가로 3~21, 세로 4.3~20.5, 중심 12, 12.4). 배지 안에 줄여 넣는다. */
const HEART =
  'M12 20.5C12 20.5 3 15 3 9.2 3 6.3 5.2 4.3 7.7 4.3c1.8 0 3.4 1 4.3 2.5.9-1.5 2.5-2.5 4.3-2.5 2.5 0 4.7 2 4.7 4.9 0 5.8-9 11.3-9 11.3Z';

/**
 * 종류 색을 입힌 핀 SVG 를 data URI 로. 외부 이미지를 받지 않아 오프라인에서도 그려진다
 * (이 앱은 글꼴까지 self-host 한다 — 런타임 외부 요청을 늘리지 않는다). 네이버가 내려주는
 * `marker-default.png` 를 그대로 쓰지 않는 이유가 이것이고, 종류별 색도 거기선 못 준다.
 */
function pinSvg(type: TPlaceType, saved: boolean, width: number, height: number): string {
  const color = TYPE_COLOR[type];
  // 물방울: 머리는 중심 (11, 11.4)·반지름 10.2 의 원, 꼬리는 좌우 대칭으로 (11, 32.2) 까지.
  const body =
    'M11 1.2 C5.367 1.2 0.8 5.767 0.8 11.4 c0 7.9 10.2 20.8 10.2 20.8 S21.2 19.3 21.2 11.4 C21.2 5.767 16.633 1.2 11 1.2 Z';
  // 흰 원(r 7.75) 안의 ▼. 에셋에서 잰 밑변 8·높이 5.5 를 머리를 줄인 비율(10.2/10.5)로 옮겼다.
  // 꼭짓점 15 는 무게중심을 맞추려고 고른 값이다 — (9.6+9.6+15)/3 = 11.4 로 원 중심과 **정확히**
  // 겹친다(에셋의 구성이 그렇다). 14.95 로 두면 11.3833 이라 0.017 어긋난다.
  const arrow = 'M7.1 9.6 h7.8 L11 15 Z';
  const pin =
    `<path d="${body}" fill="${color}" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/>` +
    `<circle cx="11" cy="11.4" r="7.75" fill="#fff"/>` +
    `<path d="${arrow}" fill="${color}"/>`;
  const box = saved ? SAVED_PIN_VIEWBOX : PIN_VIEWBOX;
  // width·height 를 박아 둔다 — 없으면 SVG 의 고유 크기가 브라우저 기본값(150 높이)으로 잡힌다.
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${box.width} ${box.height}">` +
    (saved
      ? `<g transform="translate(0 ${SAVED_PIN_SHIFT_Y})">${pin}</g>` +
        `<circle cx="22.5" cy="6.5" r="5.5" fill="${SAVED_MARKER_COLOR}" stroke="#fff" stroke-width="1.5"/>` +
        `<path d="${HEART}" fill="#fff" transform="translate(22.5 6.6) scale(0.34) translate(-12 -12.4)"/>`
      : pin) +
    `</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * 아이콘은 종류 × 선택여부 × 저장여부 12가지뿐이라 한 번 만들어 두고 계속 쓴다.
 * 선택을 옮길 때마다 새 객체를 만들면 SDK 가 이미지를 다시 물어본다.
 */
const PIN_ICONS = new Map<string, naver.maps.ImageIcon>();

export function pinIcon(
  maps: typeof naver.maps,
  type: TPlaceType,
  selected: boolean,
  saved: boolean,
): naver.maps.ImageIcon {
  const key = `${type}:${selected}:${saved}`;
  const cached = PIN_ICONS.get(key);
  if (cached) return cached;

  const pin = selected ? PIN_SELECTED : PIN;
  // 핀 좌표계 1칸이 몇 px 인가. 저장 핀은 캔버스만 넓고 이 비율은 같다.
  const scale = pin.width / PIN_VIEWBOX.width;
  const box = saved ? SAVED_PIN_VIEWBOX : PIN_VIEWBOX;
  const width = box.width * scale;
  const height = box.height * scale;
  const icon: naver.maps.ImageIcon = {
    url: pinSvg(type, saved, width, height),
    size: new maps.Size(width, height),
    // 좌표에 맞출 지점은 핀의 **끝**이다 — 가운데로 두면 핀이 장소보다 아래를 가리킨다.
    // Kakao 의 MarkerImage `offset` 과 같은 뜻이고, 원점은 이미지 좌상단이다.
    // 가로는 핀 몸통의 가운데(핀 좌표 11)다 — 저장 핀은 배지 때문에 캔버스 가운데가 아니다.
    anchor: new maps.Point((PIN_VIEWBOX.width / 2) * scale, height),
  };
  PIN_ICONS.set(key, icon);
  return icon;
}
