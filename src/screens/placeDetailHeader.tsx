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
      **자기를 위로 끌어올리지 않는다.** 셸이 얹어 둔 뒤로가기 줄(appShell) 아래에서 그냥
      시작하므로, 그 줄 자리와 그 위 상태바 인셋이 전부 크림으로 남는다 — 맨 위 면을 전 화면
      크림으로 통일한 결과다(ADR-010 v3). `/saved`·`/dog` 같은 다른 하위 화면이 원래 그랬고,
      상세만 예외였던 것이 없어졌다.

      예전에는 `under-app-bar`(앱바 h-14 + 인셋)로, 그 전에는 `-mt-14 pt-14` 로 끌어올려 색을
      맨 위까지 이었다. 그 음수 마진이 사라지면서 **앱바를 `fixed` 로 못 바꾸던 이유도 함께
      사라졌다**(appBar 주석 참고).
    */
    <header style={{ backgroundImage: typeHeaderBackground(place.type) }}>
      <div className="px-4 pt-2 pb-7 md:px-6 md:pt-4">
        <div style={{ color: TYPE_COLOR_DEEP[place.type] }}>
          <Icon size={32} />
        </div>

        {/*
          모바일에서 워시 판이 빈 면으로 보이던 문제(2026-09-15 리뷰 §0 ①) — 큰 이름을
          모바일에도 보이게 한다. 셸의 뒤로가기 줄에는 제목이 없으므로(경로만 알고 이름은
          모른다) 이 이름이 폭과 무관하게 이 화면의 유일한 h1 이다.
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
