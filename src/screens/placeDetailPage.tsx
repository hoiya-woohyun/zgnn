'use client';

import { Image01, LinkExternal01, Share01 } from '@untitledui/icons';
import { notFound } from 'next/navigation';
import { PlaceDetailHeader } from './placeDetailHeader';
import { PlaceDetailGallery } from './placeDetailGallery';
import { HighlightedPolicyText, PlaceDetailEligibilityCard } from './placeDetailEligibilityCard';
import { PlaceDetailMiniMap } from './placeDetailMiniMap';
import { PlaceDetailNearby } from './placeDetailNearby';
import { Button } from '../components/base/button';
import { PlaceItemsNote } from '../components/placeItemsNote';
import { PetBadges } from '../components/petBadges';
import { SaveButton } from '../components/saveButton';
import { showAppStatus } from '../lib/appStatus';
import { formatStayPrice } from '../lib/format';
import { naverPlacePhotoUrl } from '../lib/naverPlaceLink';
import { shareMethodOf, shareTextFor } from '../lib/placeShare';
import { TYPE_META, getPlace } from '../lib/places';
import { useDog } from '../store/useAppStore';
import { useEligibility } from '../store/useDogEligibility';

/**
 * id 는 라우트가 정해 준다(`app/place/[id]/page.tsx`). 거기서 이미 존재를 확인하므로
 * 여기 notFound 는 실제로는 걸리지 않는다 — 타입을 좁히려고 둔다.
 */
export function PlaceDetailPage({ id }: { id: string }) {
  const place = getPlace(id);
  if (!place) notFound();

  const dog = useDog();
  const eligibility = useEligibility(place);
  const photoUrl = naverPlacePhotoUrl(place.naverPlaceId);

  /*
   * 공유 버튼은 **늘 그린다**(지수 ⑤ — 카톡 인앱·데스크톱엔 Web Share 가 없어 버튼이 아예 없었다).
   * 화면은 빌드 때 미리 그려지므로 렌더 중에 navigator 를 보면 하이드레이션이 어긋난다. 그래서
   * 버튼의 존재는 서버·클라가 같고(항상 있음), 공유냐 복사냐는 누른 순간에만 가른다.
   */
  const share = () => {
    const url = window.location.href;
    const method = shareMethodOf(navigator);
    if (method === 'share') {
      const text = shareTextFor(place.features, dog?.dogs.map((d) => d.name) ?? null, eligibility);
      // 사용자가 공유 시트를 닫아도 reject 된다 — 실패가 아니라 취소라 조용히 넘긴다.
      void navigator.share({ title: `${place.name} | 강아지랑 제주`, text, url }).catch(() => undefined);
      return;
    }
    if (method === 'copy') {
      navigator.clipboard.writeText(url).then(
        () => showAppStatus('링크를 복사했어요'),
        () => showAppStatus('링크를 복사하지 못했어요. 주소창의 주소를 보내 주세요'),
      );
      return;
    }
    showAppStatus('이 브라우저에서는 공유할 수 없어요. 주소창의 주소를 보내 주세요');
  };

  return (
    <article>
      <PlaceDetailHeader place={place} />

      {/* 사진이 있을 때만 갤러리를 낀다. 지금 데이터에는 사진이 없다. */}
      {place.images.length > 0 && <PlaceDetailGallery place={place} />}

      {/*
        배지는 아래 '반려동물 이용' 카드에서 원문과 함께 한 번만 보여준다.
        여기에도 같은 배지를 깔면 한 화면에 똑같은 줄이 두 번 나와서, 두 줄이 서로
        다른 것을 말하는 줄 알고 읽게 된다. 여기는 특징 문장과 저장만 남긴다.
      */}
      <section className="px-4 pt-5 md:px-6">
        <div className="flex items-start gap-3">
          <p className="flex-1 text-sm text-secondary">{place.features}</p>
          <SaveButton id={place.id} name={place.name} className="-mt-2.5 -mr-2.5 shrink-0" />
        </div>
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

        {/*
          네이버 지도 버튼을 '반려동물 이용' 카드 바로 아래로 옮겼다(2026-09-15 리뷰 §2③ —
          숙소는 아래 요금 섹션에 밀려 네이버 버튼이 한 화면 아래로 내려갔다). 어려움 판정이어도
          네이버로 가서 직접 확인할 수 있어야 하므로 판정과 무관하게 항상 보여준다.
        */}
        {place.naverUrl && (
          <Button
            color="primary"
            size="lg"
            iconTrailing={LinkExternal01}
            href={place.naverUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-3 w-full"
          >
            네이버 지도에서 열기
          </Button>
        )}
        {/* 사진은 가져오지 않고 네이버 플레이스 사진 탭으로 보낸다(ADR-002 v2) — 권리가 업주·방문자에게 있다. */}
        {photoUrl && (
          <Button
            color="secondary"
            size="lg"
            iconLeading={Image01}
            iconTrailing={LinkExternal01}
            href={photoUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-2 w-full"
          >
            네이버에서 사진 보기
          </Button>
        )}
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

      {/*
        저장은 위 특징 옆 하트 하나로 충분하다(2026-09-15 리뷰 §2② — 하단 풀버튼 저장까지
        있으면 같은 기능이 두 곳에 있어 헷갈린다). 네이버 버튼도 위 '반려동물 이용' 아래로
        옮겼으니, 여기 남는 건 후기·공유뿐이다. 공유는 늘 있으므로 절도 늘 있다.
      */}
      <section className="mt-6 flex gap-2 px-4 md:px-6">
        {place.reviewUrl && (
          <Button
            color="secondary"
            size="lg"
            href={place.reviewUrl}
            target="_blank"
            rel="noreferrer"
            className="flex-1"
          >
            후기 보기
          </Button>
        )}
        <Button
          color="secondary"
          size="lg"
          iconLeading={Share01}
          onClick={share}
          aria-label={`${place.name} 공유하기`}
          className="flex-1"
        >
          공유
        </Button>
      </section>

      {/*
        위치는 근처 장소 바로 위 — "어디에 있나" 다음에 "그 옆에 뭐가 있나" 가 이어진다. 앱 밖 길찾기는
        위의 "네이버 지도에서 열기" 가 맡고, 이 판은 누르면 앱 안 지도 탭으로 간다. 좌표가 없으면 절째 뺀다.
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
