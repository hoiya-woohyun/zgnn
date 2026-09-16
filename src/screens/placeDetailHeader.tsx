import { ArrowLeft } from '@untitledui/icons';
import Link from 'next/link';
import { AppBar } from '../components/layout/appBar';
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
  const backTo = `/places/${place.type}`;

  return (
    <header style={{ background: typeHeaderBackground(place.type) }}>
      {/* 딥링크로 바로 들어와도 앱 밖으로 나가지 않게 하는 처리는 AppBar 안에 이미 있다. */}
      <AppBar title={place.name} backTo={backTo} tone="overlay" />

      <div className="px-4 pt-2 pb-7 md:px-6 md:pt-6">
        {/*
          AppBar 는 md:hidden 이라 데스크톱엔 뒤로가기가 없다. 데스크톱은 사이드바가 있으므로
          여기 헤더판 안에 별도의 뒤로가기 링크를 하나 둔다.
        */}
        <Link
          href={backTo}
          className="hidden items-center gap-1.5 text-sm font-semibold text-secondary hover:text-primary md:flex"
        >
          <ArrowLeft size={18} aria-hidden="true" />
          목록으로
        </Link>

        <div className="mt-3 md:mt-4" style={{ color: TYPE_COLOR_DEEP[place.type] }}>
          <Icon size={32} />
        </div>

        {/*
          모바일에서 워시 판이 빈 면으로 보이던 문제(2026-09-15 리뷰 §0 ①) — 큰 이름을
          모바일에도 보이게 한다. 다만 위 AppBar 가 이미 같은 이름을 실제 h1 로 읽어 주므로
          (모바일에서만 보이는 md:hidden 헤더), 여기 큰 이름을 h1 으로 또 두면 스크린리더가
          같은 이름을 두 번 듣는다. 그래서 모바일에서는 이 텍스트를 aria-hidden 순수 장식으로,
          데스크톱에서는(AppBar 가 md:hidden 이라 안 보임) 이걸 유일한 h1 으로 쓴다 —
          하나의 h1 이 화면 폭에 따라 자리만 바뀌는 게 아니라, 폭마다 "진짜 제목" 을 담당하는
          쪽이 다르다.
        */}
        <p aria-hidden="true" className="mt-2 text-display-sm font-bold text-primary md:hidden">
          {place.name}
        </p>
        <h1 className="mt-2 hidden text-display-sm font-bold text-primary md:block">{place.name}</h1>

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
