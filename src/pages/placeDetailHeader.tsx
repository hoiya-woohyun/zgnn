import { ArrowLeft } from '@untitledui/icons';
import { Link } from 'react-router';
import { AppBar } from '../components/layout/appBar';
import { PLACE_TYPE_ICON } from '../components/icons/placeTypeIcon';
import { categoryLabel } from '../lib/category';
import { DIRECTION_LABEL, TYPE_META, typeHeaderBackground, type TPlaceEntry } from '../lib/places';

/**
 * 상세 화면의 제목 판.
 * 사진이 없는 것이 기본 상태라, 사진 자리를 비워 두는 대신 타입 색을 꽉 채운 면으로 만들고
 * 그 위에 이름을 크게 올린다. 흰 글씨 대비는 세 타입 모두 7:1 이상이다.
 */
export function PlaceDetailHeader({ place }: { place: TPlaceEntry }) {
  const Icon = PLACE_TYPE_ICON[place.type];
  const backTo = `/places/${place.type}`;

  return (
    <header className="text-white" style={{ background: typeHeaderBackground(place.type) }}>
      {/* 딥링크로 바로 들어와도 앱 밖으로 나가지 않게 하는 처리는 AppBar 안에 이미 있다. */}
      <AppBar title={place.name} backTo={backTo} tone="onColor" />

      <div className="px-4 pt-2 pb-7 md:px-6 md:pt-6">
        {/*
          AppBar 는 md:hidden 이라 데스크톱엔 뒤로가기가 없다. 데스크톱은 사이드바가 있으므로
          여기 헤더판 안에 별도의 뒤로가기 링크를 하나 둔다.
        */}
        <Link
          to={backTo}
          className="hidden items-center gap-1.5 text-sm font-semibold text-white/85 hover:text-white md:flex"
        >
          <ArrowLeft size={18} aria-hidden="true" />
          목록으로
        </Link>

        <div className="mt-3 md:mt-4">
          <Icon size={32} />
        </div>

        {/*
          모바일은 위 AppBar 가 이미 같은 이름을 제목으로 읽어 주므로(중복 낭독 방지),
          여기 큰 이름은 데스크톱에서만 보인다 — pageHeader.tsx 의 desktopOnlyTitle 과 같은 처리.
        */}
        <h1 className="sr-only mt-2 text-display-sm font-bold text-white md:not-sr-only">{place.name}</h1>

        <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-sm text-white/80">
          <span className="font-semibold text-white">
            {DIRECTION_LABEL[place.region.direction]} {place.region.town}
          </span>
          <span className="h-3 w-px bg-white/35" aria-hidden="true" />
          <span>{categoryLabel(place.category, TYPE_META[place.type].label)}</span>
        </p>

        {place.address && <p className="mt-1 text-sm text-white/70">{place.address}</p>}
      </div>
    </header>
  );
}
