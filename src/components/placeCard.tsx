import Link from 'next/link';
import type { ReactNode } from 'react';
import { EligibilityBadge } from './eligibilityBadge';
import { PetBadges } from './petBadges';
import { PlaceThumb } from './placeThumb';
import { SaveButton } from './saveButton';
import { TownChip } from './townChip';
import { categoryLabel } from '../lib/category';
import { primaryReason } from '../lib/eligibility';
import { formatStayPrice } from '../lib/format';
import { TYPE_META, type TPlaceEntry } from '../lib/places';
import { useEligibility } from '../store/useDogEligibility';

type TPlaceCardProps = {
  place: TPlaceEntry;
  /** 카드 아래, 링크 **밖**에 붙는 것(저장 화면의 메모 줄). 링크 안에 두면 입력 칸을 누르는 것이 상세로 가는 것이 된다. */
  footer?: ReactNode;
};

/**
 * 목록 카드.
 *
 * 장소 사진이 없는 것이 기본 상태라 이름과 특징 문장이 카드를 이끌고, 타입 색 타일과
 * 읍면 칩이 종류·위치를 알려준다. 반려동물 조건은 앞 세 개만 배지로 보여준다 —
 * 전부 늘어놓으면 카드마다 높이가 크게 달라져 목록을 훑기 어려워진다.
 *
 * 우리 강아지 프로필이 있으면(`useEligibility`) 판정 배지를 배지 줄 맨 앞에 얹고, 파서 배지는
 * 그만큼 줄여 카드 높이(총 배지 개수)를 그대로 유지한다. 프로필이 없으면 이 훅은 null 을
 * 돌려주므로 카드는 지금과 완전히 같은 모습이다.
 */
export function PlaceCard({ place, footer }: TPlaceCardProps) {
  const eligibility = useEligibility(place);
  const reason = eligibility ? primaryReason(eligibility) : undefined;

  return (
    <li className="relative">
      <Link
        href={`/place/${place.id}`}
        className="block rounded-2xl border border-secondary bg-primary p-4 transition-colors hover:bg-secondary"
      >
        <div className="flex items-start gap-3">
          <PlaceThumb src={place.cover ?? place.images[0]} type={place.type} />
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

        {/* 블로그에서 들어온 신규 숙소는 요금 원문이 비어 있을 수 있다 — 빈 굵은 줄을 그리지 않는다. */}
        {place.stay && place.stay.price.text !== '' && (
          // brand-700 은 CTA 색이라 26개 숙소 가격이 전부 그 색이면 "눌러야 할 것"과
          // "읽을 것"이 섞인다(2026-09-15 디자인 리뷰 ①) — 본문 색 + bold 로 내린다.
          <p className="mt-3 text-sm font-bold text-primary">{formatStayPrice(place.stay.price)}</p>
        )}

        <p className="clamp-2 mt-2 text-sm text-secondary">{place.features}</p>

        {/* "두부는 1만원 (1~5kg)" — 이름까지 붙은 완성 문장(lib/dogFee.ts)이라 그대로 출력한다.
            상세의 info 근거와 같은 문자열이어야 한다(2026-09-15 디자인 리뷰 §1 "이름 넣은 요금 한 줄"). */}
        {eligibility?.fee && <p className="mt-1 text-sm text-secondary">{eligibility.fee}</p>}

        {/* 왜 "확인"·"어려움" 인지 한 줄 — 7곳을 다 눌러 봐야 알던 것을 목록에서 읽게(민준 N1).
            카드 높이가 들쭉날쭉하지 않게 한 줄로 자른다. 상세의 첫 근거와 같은 문장이다. */}
        {reason && <p className="clamp-1 mt-1 text-xs text-tertiary">{reason.text}</p>}

        <div className="mt-3 flex flex-wrap items-center gap-1">
          {eligibility && <EligibilityBadge level={eligibility.level} />}
          <PetBadges policy={place.policy} limit={eligibility ? 2 : 3} hideNoInfo={Boolean(eligibility)} />
        </div>
      </Link>

      <SaveButton id={place.id} name={place.name} className="absolute top-2 right-2" />
      {footer}
    </li>
  );
}
