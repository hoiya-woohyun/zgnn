import Link from 'next/link';
import { EligibilityBadge } from '../components/eligibilityBadge';
import { PlaceItemsNote } from '../components/placeItemsNote';
import { PetBadges } from '../components/petBadges';
import { PlaceThumb } from '../components/placeThumb';
import { SaveButton } from '../components/saveButton';
import { TownChip } from '../components/townChip';
import { Button } from '@/components/base/button';
import { categoryLabel } from '../lib/category';
import { TYPE_META, type TPlaceEntry } from '../lib/places';
import { useEligibility } from '../store/useDogEligibility';

type TMapPageSheetCardProps = {
  place: TPlaceEntry;
};

/**
 * 지도에서 고른 장소의 미니 카드.
 *
 * 모바일에서는 하단 시트 안에, 데스크톱에서는 좌측 결과 패널 아래에 같은 카드가 들어간다.
 * 두 곳이 같은 컴포넌트를 쓰는 이유는, 화면 폭에 따라 보이는 정보가 달라지면
 * "지도에서 고른 것" 과 "목록에서 고른 것" 이 다른 장소처럼 느껴지기 때문이다.
 *
 * 닫기 버튼은 여기 없다 — 시트 껍데기(BottomSheet)가 자기 닫기 버튼을 갖고 있고,
 * 데스크톱 패널에는 닫을 것이 없다.
 */
export function MapPageSheetCard({ place }: TMapPageSheetCardProps) {
  const eligibility = useEligibility(place);

  return (
    <div>
      <Link href={`/place/${place.id}`} className="block">
        <div className="flex items-start gap-3">
          <PlaceThumb src={place.cover ?? place.images[0]} type={place.type} />
          <div className="min-w-0 flex-1 pr-8">
            <p className="text-md font-bold text-primary">{place.name}</p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <TownChip town={place.region.town} type={place.type} />
              <span className="text-sm text-tertiary">
                {categoryLabel(place.category, TYPE_META[place.type].label)}
              </span>
            </div>
          </div>
        </div>

        {eligibility && (
          <div className="mt-2.5 flex items-center gap-2">
            <EligibilityBadge level={eligibility.level} />
            {eligibility.reasons[0] && (
              <span className="truncate text-sm text-secondary">{eligibility.reasons[0].text}</span>
            )}
          </div>
        )}

        <p className="clamp-2 mt-2.5 text-sm text-secondary">{place.features}</p>
        <PetBadges policy={place.policy} limit={3} hideNoInfo={Boolean(eligibility)} className="mt-2.5" />
      </Link>

      {/* 카드 본문 바깥에 둔다 — 자기도 링크라서 위 <Link> 안에 넣으면 a 안에 a 가 된다. */}
      <PlaceItemsNote place={place} className="mt-3" />

      <div className="mt-4 flex gap-2">
        <Button color="primary" size="lg" href={`/place/${place.id}/`} className="flex-1">
          자세히 보기
        </Button>
        <SaveButton id={place.id} name={place.name} variant="full" className="w-24 shrink-0" />
      </div>
    </div>
  );
}
