import { PLACE_TYPE_ICON } from '../components/icons/placeTypeIcon';
import { categoryLabel } from '../lib/category';
import { DIRECTION_LABEL, TYPE_COLOR_DEEP, TYPE_META, typeHeaderBackground, type TPlaceEntry } from '../lib/places';

/**
 * 상세 화면의 제목 판.
 * 사진이 없는 것이 기본 상태라, 사진 자리를 비워 두는 대신 타입 색의 파스텔 워시 면으로 만들고
 * 그 위에 이름을 크게 올린다. 아이콘·읍면은 TYPE_COLOR_DEEP, 나머지 글씨는 잉크 계열이라
 * 옅은 바탕 위에서도 대비가 넉넉하다.
 */
export function PlaceDetailHeader({ place }: { place: TPlaceEntry }) {
  const Icon = PLACE_TYPE_ICON[place.type];

  return (
    /*
      **크림 위에 뜬 라운드 판이다**(ADR-010 v4). 위의 헤더(appBar)와 상태바 자리가 바탕과 같은
      크림이라, 판이 화면 끝까지 깔리면 크림 줄과 종류 색 사이에 가로 경계가 생겨 헤더가 색 판
      위에 얹힌 딴 조각처럼 보였다. 좌우를 띄우고 모서리를 둥글리면 헤더는 바탕의 일부, 이 판은
      그 위의 첫 카드로 읽힌다 — 홈의 잉크 히어로와 같은 어법이다.

      **자기를 위로 끌어올리지 않는다.** 예전에는 `under-app-bar`(앱바 h-14 + 인셋)로, 그 전에는
      `-mt-14 pt-14` 로 끌어올려 색을 맨 위까지 이었다(ADR-010 v3 에서 없앴다).
    */
    <header className="mx-4 mt-1 rounded-2xl md:mx-6" style={{ backgroundImage: typeHeaderBackground(place.type) }}>
      <div className="px-5 pt-5 pb-6 md:px-6 md:pt-6">
        <div style={{ color: TYPE_COLOR_DEEP[place.type] }}>
          <Icon size={32} />
        </div>

        {/*
          모바일에서 워시 판이 빈 면으로 보이던 문제(2026-09-15 리뷰 §0 ①) — 큰 이름을
          모바일에도 보이게 한다. 이 이름이 폭과 무관하게 이 화면의 유일한 h1 이고, 내려 읽으면
          셸의 헤더(appBar)가 이 h1 을 읽어 같은 이름을 띄운다.
        */}
        <h1 className="mt-2 text-display-sm font-bold text-primary">{place.name}</h1>

        <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-sm text-secondary">
          <span className="font-semibold" style={{ color: TYPE_COLOR_DEEP[place.type] }}>
            {DIRECTION_LABEL[place.region.direction]} {place.region.town}
          </span>
          <span className="h-3 w-px bg-quaternary" aria-hidden="true" />
          <span>{categoryLabel(place.category, TYPE_META[place.type].label)}</span>
        </p>

        {place.address && <p className="mt-1 text-sm text-tertiary">{place.address}</p>}
      </div>
    </header>
  );
}
