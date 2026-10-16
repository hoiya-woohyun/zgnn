import Link from 'next/link';
import { EligibilityBadge } from '../components/eligibilityBadge';
import { NaverLinkButton } from '../components/naverLinkButton';
import { PlaceItemsNote } from '../components/placeItemsNote';
import { PlaceThumb } from '../components/placeThumb';
import { SaveButton } from '../components/saveButton';
import { SavedNoteLine } from '../components/savedNoteLine';
import { TownChip } from '../components/townChip';
import { Button } from '@/components/base/button';
import { categoryLabel } from '../lib/category';
import { distanceLabel } from '../lib/distanceSort';
import { primaryReason } from '../lib/eligibility';
import { naverDirectionsUrl } from '../lib/naverPlaceLink';
import { freshnessShortLabel } from '../lib/placeFreshness';
import { TYPE_META, distanceKm, type TPlaceEntry } from '../lib/places';
import { useToday } from '../hooks/useToday';
import { useEligibility } from '../store/useDogEligibility';

type TMapPageSheetCardProps = {
  place: TPlaceEntry;
  /** '내 위치' 로 받은 좌표. 있으면 주소 줄 앞에 거리를 붙인다(둘러보기 '가까운 순' 카드와 같은 표기). 지도 화면 state 에만 있다. */
  origin?: { lat: number; lng: number } | null;
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
 *
 * **훑어보는 카드다 — 판정·거리·주소·길찾기만**(14 W261013.6). 마커 하나에 시트가 화면 3/4~80% 를 덮었고 그 대부분이
 * 준비물 칩 7개였다(도넛 카페에도 기저귀) — 지도를 보려고 연 것인데 지도가 안 보였다. 그래서 목록 카드와 일부러 갈린다:
 * 소개 두 줄과 조건 칩은 상세의 몫으로 넘기고(대표 근거 한 줄 `primaryReason` 은 목록과 같은 말로 남긴다 — 12 U1.7),
 * 목록 카드엔 없는 주소·거리를 더하고, 준비물은 머리 줄로 접는다. 데스크톱 패널도 같은 카드라 고른 카드가 패널 절반을 먹던 것이 함께 준다(ADR-008 v24).
 */
export function MapPageSheetCard({ place, origin }: TMapPageSheetCardProps) {
  const eligibility = useEligibility(place);
  const reason = eligibility ? primaryReason(eligibility) : undefined;
  const verified = freshnessShortLabel(place, useToday());
  const directions = naverDirectionsUrl(place);
  const distance = origin && place.geo ? distanceLabel(distanceKm(origin, place.geo)) : null;
  // 주소가 없는 곳(8곳)은 비었다고 말한다 — 다른 카드엔 다 있는 줄이 말없이 빠지면 "여기만 왜" 가 된다(14 W261013.7).
  const address = place.address || '주소는 아직 확인하지 못했어요';

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
                {categoryLabel(place.category, TYPE_META[place.type].label, place.type)}
                {/* 목록 카드와 같은 자리·같은 말(14 C2610.3). */}
                {verified && ` · ${verified}`}
              </span>
            </div>
            <p className="mt-1 truncate text-sm text-secondary">
              {distance && <span className="font-semibold text-primary">{distance} · </span>}
              {address}
            </p>
          </div>
        </div>

        {/* 목록 카드와 같은 자리의 내 메모(저장 화면에서 적은 것). */}
        <SavedNoteLine id={place.id} className="mt-2.5" />

        {eligibility && (
          <div className="mt-2.5">
            <EligibilityBadge eligibility={eligibility} />
            {/*
              목록 카드와 같은 대표 근거(`primaryReason`) — `reasons[0]` 이면 같은 장소를 두 화면이 다른 말로 설명한다(12 U1.7).
              배지 옆 한 줄(`truncate`)이 아니라 **배지 밑 줄 + 두 줄까지**(14 W261010.33u): 320px 에서 배지 옆 칸이 좁아
              "두부(12.5kg)는 13kg 미만까지 0…." 는 숫자가, "…이동가방도 되는지 확인해 주세요" 는 할 일이 잘려 나갔다.
            */}
            {reason && <p className="clamp-2 mt-1.5 text-sm text-secondary">{reason.text}</p>}
          </div>
        )}
      </Link>

      {/* 카드 본문 바깥에 둔다 — 자기도 링크라서 위 <Link> 안에 넣으면 a 안에 a 가 된다. */}
      {/* 접어 둔다 — 머리 줄(몇 가지 중 몇 챙김)만. 마커를 바꾸면 접힘·누른 흔적이 다음 곳으로 새지 않게 장소마다 새로 단다. */}
      <PlaceItemsNote key={place.id} place={place} folded className="mt-3" />

      {/* 지도에서 고른 곳은 "지금 여기로" 가 가장 잦은 동작(16 T1.5) — 저장 카드·상세와 같은 한 곳짜리 길찾기. 버튼 줄에 세 번째로 넣으면 좁아 따로 한 줄. */}
      {directions && (
        <NaverLinkButton href={directions} className="mt-3">
          길찾기
        </NaverLinkButton>
      )}

      <div className="mt-4 flex gap-2">
        <Button color="primary" size="lg" href={`/place/${place.id}/`} className="flex-1">
          자세히 보기
        </Button>
        <SaveButton id={place.id} name={place.name} variant="full" className="w-24 shrink-0" />
      </div>
    </div>
  );
}
