/**
 * 지도 첫 화면 — 섬 경계를 지도 칸의 **보이는 자리**(위 칩 줄·아래 저작권 줄을 뺀 나머지)에 맞춘다.
 *
 * 네이버 `zoom` 은 **정수이고 클수록 확대**다(2026-10-19 실측: `zoom: 9.5` → `getZoom()` 10, `fitBounds` 도 정수).
 * 그래서 "맞춘다" 는 것은 섬이 드는 **가장 큰** 정수 줌을 고르는 일이고, 중심은 섬 한가운데가 보이는 자리의
 * 한가운데에 오도록 지도 중심을 위로 밀어 준다(지도 칸 전체의 중심이 아니라).
 *
 * 경계는 장소 좌표 분포가 아니라 **고정된 섬 경계**다 — 데이터가 늘어도 첫 화면이 흔들리지 않는다.
 * 제주 본섬(한경 126.15 · 성산·우도 126.98 · 북 제주시 33.57 · 남 모슬포·서귀포 33.20)이고,
 * 마라도(33.11)·추자도는 뺀다 — 둘 다 이 앱의 장소가 거의 없고 넣으면 섬이 절반 크기가 된다.
 */
import { JEJU_CENTER, JEJU_ZOOM } from './places';

const JEJU_SOUTH = 33.2;
const JEJU_NORTH = 33.57;
const JEJU_WEST = 126.15;
const JEJU_EAST = 126.98;

/** 지도 위에 뜬 칩 줄(저장·종류 칩 + "지도에 없는 N곳") 높이(px) — 저장 모드 맞춤 여백(`FIT_MARGIN.top`)과 같다. */
const CHIP_ROW_HEIGHT = 88;
/** 아래 저작권·축척 줄(px). 탭바는 지도 칸 밖이라 더하지 않는다. */
const ATTRIBUTION_HEIGHT = 28;
/** 좌우·위아래 최소 숨 쉴 틈(px). */
const EDGE = 8;

const MIN_ZOOM = 6;
const MAX_ZOOM = 21;

const TILE = 256;

/** 위도 → 웹 메르카토르 y(0~1, 북쪽이 0). */
function mercatorY(lat: number): number {
  const sin = Math.sin((lat * Math.PI) / 180);
  return 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI);
}

function latFromMercatorY(y: number): number {
  const n = Math.PI * (1 - 2 * y);
  return (Math.atan(Math.sinh(n)) * 180) / Math.PI;
}

export type TMapFirstView = { zoom: number; center: [number, number] };

/**
 * @param widthPx 지도 칸 폭 · @param heightPx 지도 칸 높이(탭바 위까지). 못 재면(0·NaN) 기본값으로 물러선다.
 */
export function mapPageFirstView(widthPx: number, heightPx: number): TMapFirstView {
  const fallback: TMapFirstView = { zoom: JEJU_ZOOM, center: JEJU_CENTER };
  if (!Number.isFinite(widthPx) || !Number.isFinite(heightPx) || widthPx <= 0 || heightPx <= 0) return fallback;

  const visibleWidth = widthPx - 2 * EDGE;
  const visibleHeight = heightPx - CHIP_ROW_HEIGHT - ATTRIBUTION_HEIGHT - 2 * EDGE;
  if (visibleWidth <= 0 || visibleHeight <= 0) return fallback;

  const lonSpan = (JEJU_EAST - JEJU_WEST) / 360; // 세계 폭에 대한 비율
  const latSpan = mercatorY(JEJU_SOUTH) - mercatorY(JEJU_NORTH);
  // 줌 z 에서 세계는 256·2^z px — 섬이 보이는 자리에 드는 가장 큰 정수 z.
  const fitLon = Math.log2(visibleWidth / (TILE * lonSpan));
  const fitLat = Math.log2(visibleHeight / (TILE * latSpan));
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.floor(Math.min(fitLon, fitLat))));

  // 보이는 자리의 한가운데가 지도 칸 한가운데보다 (위 − 아래)/2 만큼 아래다 — 섬 중심을 거기에 두려면 지도 중심은 그만큼 북쪽.
  const world = TILE * 2 ** zoom;
  const lowerBy = (CHIP_ROW_HEIGHT - ATTRIBUTION_HEIGHT) / 2;
  const islandY = (mercatorY(JEJU_SOUTH) + mercatorY(JEJU_NORTH)) / 2;
  const lat = latFromMercatorY(islandY - lowerBy / world);
  const lng = (JEJU_WEST + JEJU_EAST) / 2;
  return { zoom, center: [lat, lng] };
}
