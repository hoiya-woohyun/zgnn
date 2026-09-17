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
      뒤로가기 줄은 셸이 이 화면 위에 이미 얹어 두었다(appShell). 그 줄은 투명하고 문서 흐름
      안에 있어서, 그냥 두면 종류 색 판이 그 줄 아래에서 시작해 맨 위에 회색 띠가 남는다.
      판을 그 줄 높이만큼 끌어올려 같은 크기의 위 여백으로 되돌리면, 색은 화면 맨 위까지
      이어지고 뒤로가기 버튼은 그 색 위에 얹힌다.

      그 줄의 실제 높이는 h-14 가 아니라 **h-14 + safe-area**다(appBar 의 pt-safe). 홈 화면
      PWA(viewportFit: cover)의 노치 기기에서는 safe-area 가 0 이 아니라, -mt-14 만 쓰면 딱 그
      높이만큼 회색 띠가 남는다. h-14 는 --spacing 축을 따라 커지므로(ADR-006) 3.5rem 으로
      고정하지 않고 같은 식으로 계산한다.
    */
    <header
      style={{
        background: typeHeaderBackground(place.type),
        marginTop: 'calc(-1 * (var(--spacing) * 14 + env(safe-area-inset-top, 0px)))',
        paddingTop: 'calc(var(--spacing) * 14 + env(safe-area-inset-top, 0px))',
      }}
    >
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
