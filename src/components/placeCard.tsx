import { Link } from 'react-router';
import { PetBadges } from './petBadges';
import { PlaceThumb } from './placeThumb';
import { SaveButton } from './saveButton';
import { TownChip } from './townChip';
import { categoryLabel } from '../lib/category';
import { formatStayPrice } from '../lib/format';
import { TYPE_META, type TPlaceEntry } from '../lib/places';

type TPlaceCardProps = {
  place: TPlaceEntry;
};

/**
 * 목록 카드.
 *
 * 장소 사진이 없는 것이 기본 상태라 이름과 특징 문장이 카드를 이끌고, 타입 색 타일과
 * 읍면 칩이 종류·위치를 알려준다. 반려동물 조건은 앞 세 개만 배지로 보여준다 —
 * 전부 늘어놓으면 카드마다 높이가 크게 달라져 목록을 훑기 어려워진다.
 */
export function PlaceCard({ place }: TPlaceCardProps) {
  return (
    <li className="relative">
      <Link
        to={`/place/${place.id}`}
        className="block rounded-2xl border border-secondary bg-primary p-4 transition-colors hover:bg-secondary"
      >
        <div className="flex items-start gap-3">
          <PlaceThumb src={place.cover ?? place.images[0]} type={place.type} size={44} />
          <div className="min-w-0 flex-1 pr-10">
            <p className="text-md font-bold text-primary">{place.name}</p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <TownChip town={place.region.town} type={place.type} />
              <span className="text-sm text-tertiary">
                {categoryLabel(place.category, TYPE_META[place.type].label)}
              </span>
            </div>
          </div>
        </div>

        {place.stay && (
          <p className="mt-3 text-sm font-bold text-brand-secondary">
            {formatStayPrice(place.stay.price)}
          </p>
        )}

        <p className="clamp-2 mt-2 text-sm text-secondary">{place.features}</p>

        <PetBadges policy={place.policy} limit={3} className="mt-3" />
      </Link>

      <SaveButton id={place.id} name={place.name} className="absolute top-2 right-2" />
    </li>
  );
}
