'use client';

import { notFound } from 'next/navigation';
import { PlaceDetailActions } from './placeDetailActions';
import { PlaceDetailFreshness } from './placeDetailFreshness';
import { PlaceDetailHeader } from './placeDetailHeader';
import { PlaceDetailGallery } from './placeDetailGallery';
import { PlaceDetailHomepage } from './placeDetailHomepage';
import { PlaceDetailEligibilityCard } from './placeDetailEligibilityCard';
import { PlaceDetailMiniMap } from './placeDetailMiniMap';
import { PlaceDetailNearby } from './placeDetailNearby';
import { PlaceDetailPolicyText, POLICY_EVIDENCE_LABEL } from './placeDetailPolicyText';
import { PlaceDetailReport } from './placeDetailReport';
import { PlaceDetailRoomConditions } from './placeDetailRoomConditions';
import { PlaceItemsNote } from '../components/placeItemsNote';
import { formatStayPrice, stayPriceSourceLine } from '../lib/format';
import { policyEvidence } from '../lib/petPolicyPublic';
import { getPlace } from '../lib/places';
import { environmentPhrases } from '../lib/stayEnvironmentView';
import { CARD_SURFACE } from '../components/cardSurface';

/**
 * id 는 라우트가 정해 준다(`app/place/[id]/page.tsx`). 거기서 이미 존재를 확인하므로
 * 여기 notFound 는 실제로는 걸리지 않는다 — 타입을 좁히려고 둔다.
 */
export function PlaceDetailPage({ id }: { id: string }) {
  const place = getPlace(id);
  if (!place) notFound();
  const environment = environmentPhrases(place.environment);
  // 원문을 그릴지, 판단에서 만든 문장을 그릴지(21 S5) — 근거 칸과 그 이름표가 같은 값을 본다.
  const evidence = policyEvidence(place);

  return (
    <article>
      <PlaceDetailHeader place={place} />
      <PlaceDetailActions place={place} />

      {/* 사진이 있을 때만 갤러리를 낀다. 지금 데이터에는 사진이 없다. */}
      {place.images.length > 0 && <PlaceDetailGallery place={place} />}

      {/*
        배지는 아래 '반려동물 이용' 카드에서 근거 문장과 함께 한 번만 보여준다.
        여기에도 같은 배지를 깔면 한 화면에 똑같은 줄이 두 번 나와서, 두 줄이 서로
        다른 것을 말하는 줄 알고 읽게 된다. 여기는 특징 문장만 남긴다(저장은 위 액션 줄).
      */}
      {/* 소개가 없는 곳(목록·명단 글에서 온 곳 — 21 S7)은 칸째 그리지 않는다. */}
      {place.features && (
        <section className="px-4 pt-5 md:px-6">
          <p className="text-sm text-secondary">{place.features}</p>
        </section>
      )}

      <section className="mt-6 px-4 md:px-6">
        <h2 className="text-lg font-bold text-primary">반려동물 이용</h2>
        <div className="mt-2">
          {/* 우리 강아지 기준 판정이 먼저, 근거(원문 또는 정리한 조건)는 그 면 안에 딸린다 — 사용자가 먼저 알고 싶은 건
              "우리 강아지가 갈 수 있는가"다. 근거는 따로 상자를 갖지 않는다(ADR-003 v15). */}
          <PlaceDetailEligibilityCard
            place={place}
            evidenceLabel={POLICY_EVIDENCE_LABEL[evidence.kind]}
            evidence={
              <>
                <PlaceDetailPolicyText place={place} evidence={evidence} />
                <PlaceDetailRoomConditions place={place} />
                {/* 확인 날짜(있을 때만, 10 F3) + 모든 장소 공통의 AI 정리 안내. */}
                <PlaceDetailFreshness place={place} />
              </>
            }
          />
        </div>

        <PlaceItemsNote place={place} className="mt-3" />
      </section>

      {/* 블로그에서 들어온 신규 숙소는 요금·용품 원문이 비어 있을 수 있다 — 있는 항목만 그리고, 둘 다 없으면 절을 통째로 뺀다. */}
      {place.stay && (place.stay.price.text !== '' || place.stay.amenitiesText !== '' || environment.length > 0) && (
        <section className="mt-6 px-4 md:px-6">
          <h2 className="text-lg font-bold text-primary">숙박 요금과 용품</h2>
          <dl className={`mt-2 divide-y divide-secondary ${CARD_SURFACE}`}>
            {place.stay.price.text !== '' && (
              <div className="p-4">
                <dt className="text-xs text-tertiary">1박 요금</dt>
                <dd className="mt-0.5 text-lg font-bold text-primary">{formatStayPrice(place.stay.price)}</dd>
                {stayPriceSourceLine(place.stay.price) !== null && (
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
            {/* 숙소 환경(10 F6) — 판정이 아니라 선호라 이용 카드가 아닌 이 절에 둔다. 아는 것만 말한다. */}
            {environment.length > 0 && (
              <div className="p-4">
                <dt className="text-xs text-tertiary">숙소 환경</dt>
                <dd className="mt-0.5 text-sm text-secondary">{environment.join(' · ')}</dd>
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

      {/* 제보는 다녀온 뒤의 동작이라 맨 아래(10 F1). 가기 전의 동작은 위 액션 줄이 맡는다. */}
      <PlaceDetailReport place={place} />

      <div className="h-8" />
    </article>
  );
}
