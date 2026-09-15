import { LinkExternal01, MarkerPin01, Share01 } from '@untitledui/icons';
import { useParams } from 'react-router';
import { PlaceDetailHeader } from './placeDetailHeader';
import { PlaceDetailGallery } from './placeDetailGallery';
import { PlaceDetailNearby } from './placeDetailNearby';
import { Button } from '../components/base/button';
import { EmptyState } from '../components/layout/emptyState';
import { PetBadges } from '../components/petBadges';
import { SaveButton } from '../components/saveButton';
import { formatStayPrice } from '../lib/format';
import { TYPE_META, getPlace } from '../lib/places';

export function PlaceDetailPage() {
  const { id } = useParams();
  const place = getPlace(id);

  if (!place) {
    return (
      <div className="px-4 pt-16 md:px-6">
        <EmptyState
          Icon={MarkerPin01}
          title="찾을 수 없는 장소예요"
          description="주소가 바뀌었거나 삭제된 장소입니다."
          action={
            <Button color="primary" size="md" href="/">
              홈으로 가기
            </Button>
          }
        />
      </div>
    );
  }

  const canShare = typeof navigator !== 'undefined' && 'share' in navigator;
  const share = () => {
    void navigator
      .share({ title: `${place.name} | 강아지랑 제주`, text: place.features, url: window.location.href })
      .catch(() => undefined);
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
        <div className="mt-2 rounded-2xl border border-secondary bg-primary p-4">
          {/* 파서가 조건을 놓쳤을 수 있어, 구조화 배지와 원문을 함께 보여준다. */}
          <PetBadges policy={place.policy} className="mb-3" />
          <p className="whitespace-pre-line text-sm text-secondary">{place.petPolicyText}</p>
          <p className="mt-3 text-xs text-tertiary">
            {TYPE_META[place.type].label} 정보는 바뀔 수 있어요. 방문 전 한 번 더 확인해 주세요.
          </p>
        </div>
      </section>

      {place.stay && (
        <section className="mt-6 px-4 md:px-6">
          <h2 className="text-lg font-bold text-primary">숙박 요금과 용품</h2>
          <dl className="mt-2 divide-y divide-secondary rounded-2xl border border-secondary bg-primary">
            <div className="p-4">
              <dt className="text-xs text-tertiary">1박 요금</dt>
              <dd className="mt-0.5 text-lg font-bold text-primary">{formatStayPrice(place.stay.price)}</dd>
              {place.stay.price.text !== formatStayPrice(place.stay.price) && (
                <dd className="mt-1 whitespace-pre-line text-xs text-tertiary">{place.stay.price.text}</dd>
              )}
            </div>
            <div className="p-4">
              <dt className="text-xs text-tertiary">반려동물 용품</dt>
              <dd className="mt-0.5 text-sm text-secondary">{place.stay.amenitiesText}</dd>
            </div>
          </dl>
        </section>
      )}

      <section className="mt-6 space-y-2 px-4 md:px-6">
        {place.naverUrl && (
          <Button
            color="primary"
            size="lg"
            iconTrailing={LinkExternal01}
            href={place.naverUrl}
            target="_blank"
            rel="noreferrer"
            className="w-full"
          >
            네이버 지도에서 열기
          </Button>
        )}

        {(place.reviewUrl || canShare) && (
          <div className="flex gap-2">
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
            {canShare && (
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
            )}
          </div>
        )}

        <SaveButton id={place.id} name={place.name} variant="full" className="w-full" />
      </section>

      <PlaceDetailNearby place={place} />

      <div className="h-8" />
    </article>
  );
}
