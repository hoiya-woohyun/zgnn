import { PlaceThumb } from '../components/placeThumb';
import { categoryLabel } from '../lib/category';
import { DIRECTION_LABEL, TYPE_COLOR_DEEP, TYPE_META, type TPlaceEntry } from '../lib/places';

/**
 * 상세 화면의 제목 블록.
 *
 * **색 판을 깔지 않는다**(ADR-010 v4). 예전에는 종류 색의 파스텔 워시 판 위에 이름을 올렸는데,
 * 하위 화면 중 이 화면만 본문이 색 면으로 시작해 헤더(크림) 바로 밑에 다른 색 덩어리가 끼어
 * 있었다 — 끝까지 깔면 가로 경계가, 라운드 판으로 띄우면 "뭔가 올라와 있는" 덩어리가 됐다.
 * 지금은 `/saved`·`/dog` 의 PageHeader 처럼 크림 위에 글자만 두고, 종류는 **목록 카드와 같은
 * 썸네일 타일**(PlaceThumb)로 말한다 — 목록에서 누른 카드의 그 아이콘이 상세 맨 위에 그대로
 * 있어 이어져 보인다. 종류 색은 타일과 읍면 글씨에만 남는다.
 */
export function PlaceDetailHeader({ place }: { place: TPlaceEntry }) {
  return (
    <header className="px-4 pt-2 md:px-6 md:pt-4">
      <PlaceThumb type={place.type} />

      {/*
        이 이름이 폭과 무관하게 이 화면의 유일한 h1 이고, 내려 읽으면 셸의 헤더(appBar)가
        이 h1 을 읽어 같은 이름을 띄운다.
      */}
      <h1 className="mt-3 text-display-xs font-bold text-primary">{place.name}</h1>

      <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-sm text-secondary">
        <span className="font-semibold" style={{ color: TYPE_COLOR_DEEP[place.type] }}>
          {DIRECTION_LABEL[place.region.direction]} {place.region.town}
        </span>
        <span className="h-3 w-px bg-quaternary" aria-hidden="true" />
        <span>{categoryLabel(place.category, TYPE_META[place.type].label)}</span>
      </p>

      {place.address && <p className="mt-1 text-sm text-tertiary">{place.address}</p>}
    </header>
  );
}
