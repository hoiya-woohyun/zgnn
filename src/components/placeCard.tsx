import Link from 'next/link';
import type { ReactNode } from 'react';
import { EligibilityBadge } from './eligibilityBadge';
import { PetBadges } from './petBadges';
import { PlaceThumb } from './placeThumb';
import { SaveButton } from './saveButton';
import { SavedNoteLine } from './savedNoteLine';
import { TownChip } from './townChip';
import { categoryLabel } from '../lib/category';
import { distanceLabel } from '../lib/distanceSort';
import { primaryReason } from '../lib/eligibility';
import { formatStayPrice } from '../lib/format';
import { freshnessShortLabel } from '../lib/placeFreshness';
import { TYPE_META, type TPlaceEntry } from '../lib/places';
import { useToday } from '../hooks/useToday';
import { useDogCount, useDogMaxWeightKg, useEligibility } from '../store/useDogEligibility';
import { CARD_SURFACE } from './cardSurface';
import { cx } from '../utils/cx';

type TPlaceCardProps = {
  place: TPlaceEntry;
  /** 가까운 순일 때 내 위치에서의 거리(km). 있으면 종류 옆에 붙는다(10 F7). */
  distanceKm?: number;
  /**
   * 목록 머리가 이미 한 번 말한 근거 문장(`placesPageRepeatedReason`). 이 카드의 근거가 그 문장과 같으면 줄을 뺀다 —
   * 식당 34곳 중 29곳이 같은 문장을 되풀이했다(14 W261006.5). 판정 배지와 원문 칩("케이지 필요")은 그대로 남는다.
   */
  hideReasonText?: string;
  /** 하트 **왼쪽**에 함께 서는 버튼(저장 화면의 메모 연필). 이름 줄 오른쪽 여백이 그만큼 넓어진다. */
  actions?: ReactNode;
  /**
   * 있으면 메모 줄 자리에 이것(입력 폼)을 그리고, 카드는 그동안 **링크가 아니다** — 링크 안의 입력 칸은 누르는 것이
   * 상세로 가는 것이 된다(a 안의 input 도 HTML 위반). 닫히면 다시 링크다.
   */
  noteEditor?: ReactNode;
  /**
   * 카드 **안** 오른쪽 아래, 배지 줄 끝에 서는 것(저장 화면의 길찾기 알약). 카드가 링크라 그 안에 링크를 넣을 수 없어
   * 하트처럼 카드 위에 겹쳐 세우고, 배지 줄은 그만큼 오른쪽을 비우고 알약 높이(h-9)를 바닥으로 갖는다 — 배지와 알약이 한 줄에 선다.
   */
  cornerAction?: ReactNode;
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
export function PlaceCard({ place, distanceKm, hideReasonText, actions, noteEditor, cornerAction }: TPlaceCardProps) {
  const eligibility = useEligibility(place);
  const reason = eligibility ? primaryReason(eligibility) : undefined;
  const weightKg = useDogMaxWeightKg();
  const dogCount = useDogCount();
  const verified = freshnessShortLabel(place, useToday());

  const body = (
    <>
      <div className="flex items-start gap-3">
        <PlaceThumb src={place.cover ?? place.images[0]} type={place.type} />
        <div className={cx('min-w-0 flex-1', actions ? 'pr-20' : 'pr-10')}>
          <p className="text-md font-bold text-primary">{place.name}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <TownChip town={place.region.town} type={place.type} />
            <span className="text-sm text-tertiary">
              {categoryLabel(place.category, TYPE_META[place.type].label, place.type)}
              {distanceKm !== undefined && ` · ${distanceLabel(distanceKm)}`}
              {/* 확인 날짜는 상세에만 있었다 — 신뢰가 우리 차별점인데 들어가야 보였다(14 C2610.3). 한 단어로 종류 줄 끝에. */}
              {verified && ` · ${verified}`}
            </span>
          </div>
        </div>
      </div>

      {/* 내 메모는 이름 바로 밑 — 이 장소에 대한 내 표시라 가게 설명보다 먼저. 저장 화면만이 아니라 카드가 보이는 모든 자리에. */}
      {noteEditor ? <div className="mt-3">{noteEditor}</div> : <SavedNoteLine id={place.id} className="mt-3" />}

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
          카드 높이가 들쭉날쭉하지 않게 한 줄로 자른다. 상세의 첫 근거와 같은 문장이다.
          목록 머리가 같은 문장을 이미 말했으면 빼서, 다른 이유를 가진 카드만 줄이 남게 한다. */}
      {reason && reason.text !== hideReasonText && <p className="clamp-1 mt-1 text-xs text-tertiary">{reason.text}</p>}

      <div className={cx('mt-3 flex flex-wrap items-center gap-1', cornerAction && 'min-h-9 pr-24')}>
        {eligibility && <EligibilityBadge eligibility={eligibility} />}
        <PetBadges
          policy={place.policy}
          // 오른쪽 알약이 배지 하나 몫을 차지한다 — 하나 덜 보여(나머지는 +N) 배지 줄이 두 줄로 꺾이지 않게.
          limit={(eligibility ? 2 : 3) - (cornerAction ? 1 : 0)}
          hideNoInfo={Boolean(eligibility)}
          weightKg={weightKg}
          dogCount={dogCount}
        />
      </div>
    </>
  );

  return (
    <li className="relative">
      {noteEditor ? (
        <div className={`${CARD_SURFACE} p-4`}>{body}</div>
      ) : (
        <Link href={`/place/${place.id}`} className={`block ${CARD_SURFACE} p-4 transition-colors hover:bg-secondary`}>
          {body}
        </Link>
      )}

      <div className="absolute top-2 right-2 flex">
        {actions}
        <SaveButton id={place.id} name={place.name} />
      </div>
      {cornerAction && <div className="absolute right-4 bottom-4">{cornerAction}</div>}
    </li>
  );
}
