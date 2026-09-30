'use client';

import { notFound } from 'next/navigation';
import { PlaceDetailActions } from './placeDetailActions';
import { PlaceDetailHeader } from './placeDetailHeader';
import { PlaceDetailGallery } from './placeDetailGallery';
import { PlaceDetailHomepage } from './placeDetailHomepage';
import { HighlightedPolicyText, PlaceDetailEligibilityCard } from './placeDetailEligibilityCard';
import { PlaceDetailMiniMap } from './placeDetailMiniMap';
import { PlaceDetailNearby } from './placeDetailNearby';
import { PlaceItemsNote } from '../components/placeItemsNote';
import { PetBadges } from '../components/petBadges';
import { formatStayPrice } from '../lib/format';
import { TYPE_META, getPlace } from '../lib/places';

/**
 * id 는 라우트가 정해 준다(`app/place/[id]/page.tsx`). 거기서 이미 존재를 확인하므로
 * 여기 notFound 는 실제로는 걸리지 않는다 — 타입을 좁히려고 둔다.
 */
export function PlaceDetailPage({ id }: { id: string }) {
  const place = getPlace(id);
  if (!place) notFound();

  return (
    <article>
      <PlaceDetailHeader place={place} />
      <PlaceDetailActions place={place} />

      {/* 사진이 있을 때만 갤러리를 낀다. 지금 데이터에는 사진이 없다. */}
      {place.images.length > 0 && <PlaceDetailGallery place={place} />}

      {/*
        배지는 아래 '반려동물 이용' 카드에서 원문과 함께 한 번만 보여준다.
        여기에도 같은 배지를 깔면 한 화면에 똑같은 줄이 두 번 나와서, 두 줄이 서로
        다른 것을 말하는 줄 알고 읽게 된다. 여기는 특징 문장만 남긴다(저장은 위 액션 줄).
      */}
      <section className="px-4 pt-5 md:px-6">
        <p className="text-sm text-secondary">{place.features}</p>
      </section>

      <section className="mt-6 px-4 md:px-6">
        <h2 className="text-lg font-bold text-primary">반려동물 이용</h2>
        <div className="mt-2">
          {/* 우리 강아지 기준 판정. 원문 카드보다 먼저 보여준다 — 원문은 판정의 근거일 뿐,
              사용자가 먼저 알고 싶은 건 "우리 강아지가 갈 수 있는가"다. */}
          <PlaceDetailEligibilityCard place={place} />
          <div className="rounded-2xl border border-secondary bg-primary p-4">
            {/* 파서가 조건을 놓쳤을 수 있어, 구조화 배지와 원문을 함께 보여준다. */}
            <PetBadges policy={place.policy} className="mb-3" />
            <p className="whitespace-pre-line text-sm text-secondary">
              <HighlightedPolicyText text={place.petPolicyText} place={place} />
            </p>
            <p className="mt-3 text-xs text-tertiary">
              {TYPE_META[place.type].label} 정보는 바뀔 수 있어요. 방문 전 한 번 더 확인해 주세요.
            </p>
          </div>
        </div>

        <PlaceItemsNote place={place} className="mt-3" />
      </section>

      {/* 블로그에서 들어온 신규 숙소는 요금·용품 원문이 비어 있을 수 있다 — 있는 항목만 그리고, 둘 다 없으면 절을 통째로 뺀다. */}
      {place.stay && (place.stay.price.text !== '' || place.stay.amenitiesText !== '') && (
        <section className="mt-6 px-4 md:px-6">
          <h2 className="text-lg font-bold text-primary">숙박 요금과 용품</h2>
          <dl className="mt-2 divide-y divide-secondary rounded-2xl border border-secondary bg-primary">
            {place.stay.price.text !== '' && (
              <div className="p-4">
                <dt className="text-xs text-tertiary">1박 요금</dt>
                <dd className="mt-0.5 text-lg font-bold text-primary">{formatStayPrice(place.stay.price)}</dd>
                {place.stay.price.text !== formatStayPrice(place.stay.price) && (
                  <dd className="mt-1 whitespace-pre-line text-sm text-tertiary">{place.stay.price.text}</dd>
                )}
              </div>
            )}
            {place.stay.amenitiesText !== '' && (
              <div className="p-4">
                <dt className="text-xs text-tertiary">반려동물 용품</dt>
                <dd className="mt-0.5 text-sm text-secondary">{place.stay.amenitiesText}</dd>
              </div>
            )}
          </dl>
        </section>
      )}

      {/* 공식 홈페이지가 있을 때만(분석이 네이버 지역 검색의 link 에서 찾은 업체 사이트). 사진은 그 사이트의 것이다 — ADR-002 v2. */}
      {place.homepage && (
        <section className="mt-6 px-4 md:px-6">
          <h2 className="text-lg font-bold text-primary">공식 홈페이지</h2>
          <div className="mt-2">
            <PlaceDetailHomepage homepage={place.homepage} />
          </div>
        </section>
      )}

      {/*
        위치는 근처 장소 바로 위 — "어디에 있나" 다음에 "그 옆에 뭐가 있나" 가 이어진다. 앱 밖 길찾기는
        위 액션 줄의 "네이버 지도" 가 맡고, 이 판은 누르면 앱 안 지도 탭으로 간다. 좌표가 없으면 절째 뺀다.
      */}
      {place.geo && (
        <section className="mt-8 px-4 md:px-6">
          <h2 className="text-lg font-bold text-primary">위치</h2>
          <div className="mt-2">
            <PlaceDetailMiniMap place={place} geo={place.geo} />
          </div>
        </section>
      )}

      <PlaceDetailNearby place={place} />

      <div className="h-8" />
    </article>
  );
}
