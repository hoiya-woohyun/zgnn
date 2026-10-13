import { headlineFor, type TEligibility } from './eligibility';
import { TYPE_META, type TPlaceEntry } from './places';

/**
 * 지도 마커의 접근성 이름 — "이름, 종류, 판정". 판정은 목록 배지·상세 머리글과 같은 `headlineFor` 에서 온다.
 *
 * 레벨 이름(배지 색표의 라벨)을 붙이던 동안 목록이 '야외 자리에서 갈 수 있어요' 라고 한 곳을 스크린리더는
 * '확인이 필요해요' 로, '확인된 정보가 없어요' 는 '정보가 없어요' 로 읽었다 — 보는 사람과 듣는 사람이 다른 답을 받았다(14 W261013.3).
 */
export const mapPageCanvasMarkerLabel = (place: Pick<TPlaceEntry, 'name' | 'type'>, eligibility?: TEligibility): string =>
  [place.name, TYPE_META[place.type].label, eligibility && headlineFor(eligibility)].filter(Boolean).join(', ');
