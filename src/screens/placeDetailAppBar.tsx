import { AppBarSlot } from '../components/layout/appBarSlot';
import { PLACE_TYPE_ICON } from '../components/icons/placeTypeIcon';
import { categoryLabel } from '../lib/category';
import { TYPE_COLOR, TYPE_META, type TPlaceEntry } from '../lib/places';

/**
 * 상세를 내려 읽을 때 헤더에 올라오는 한 줄 — 왼쪽에 종류 아이콘·이름, 오른쪽에 동네·종류.
 *
 * 무엇을 보고 있는지(이름)와 **어디의 무엇인지**(애월읍 · 펜션)를 헤더 한 줄로 남긴다. 본문 제목 블록의 두 줄을 줄인 것이다.
 * - **아이콘은 타일 없이 글리프만**, 종류 색으로. 목록 썸네일(`PlaceThumb`)은 크기를 둘로 못 박아 둔 규칙이 있고, 헤더 한 줄에는
 *   16px 제목과 나란한 작은 표식이 맞는다(홈 헤더의 발바닥과 같은 자리).
 * - **동네는 읍면까지만**(방위 `제주시 서부` 는 뺀다) — 헤더에서는 두루뭉술한 쪽이 빨리 읽힌다. 정확한 주소는 본문에 있다.
 * - 이름이 길면 이름이 줄고 오른쪽은 그대로다 — 오른쪽이 짧고 고정된 말이라 잘리면 뜻이 사라진다.
 */
export function PlaceDetailAppBar({ place }: { place: TPlaceEntry }) {
  const Icon = PLACE_TYPE_ICON[place.type];
  return (
    <AppBarSlot>
      <Icon className="size-5 shrink-0" style={{ color: TYPE_COLOR[place.type] }} />
      <span className="clamp-1 min-w-0 flex-1 text-md font-bold text-primary">{place.name}</span>
      <span className="shrink-0 pr-3 text-sm text-tertiary">
        {place.region.town} · {categoryLabel(place.category, TYPE_META[place.type].label)}
      </span>
    </AppBarSlot>
  );
}
