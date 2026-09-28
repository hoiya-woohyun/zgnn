import { useState } from 'react';
import type { TPlaceEntry } from '../lib/places';

/**
 * 사진 갤러리. 장소에 사진이 있을 때만 상세 화면이 이걸 렌더한다.
 * 지금 데이터에는 사진이 없어서 화면에 나오지 않지만, 나중에 직접 찍은 사진을
 * places.json 에 넣으면 바로 동작하도록 남겨 둔 경로다.
 *
 * PlaceThumb 은 사진을 장식으로 다뤄 alt="" 로 감춘다(카드에서는 링크 이름이 이미 있어서).
 * 여기 사진은 장식이 아니라 그 자체가 콘텐츠라 PlaceThumb 을 쓰지 않고 각 사진에 고유한
 * alt 를 직접 단다.
 */
export function PlaceDetailGallery({ place }: { place: TPlaceEntry }) {
  const photos = place.images;
  const [index, setIndex] = useState(0);

  if (photos.length === 0) return null;

  return (
    <div className="relative">
      <div
        className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto"
        onScroll={(event) => {
          const el = event.currentTarget;
          setIndex(Math.round(el.scrollLeft / el.clientWidth));
        }}
      >
        {photos.map((src, position) => (
          <img
            key={src}
            src={src}
            alt={`${place.name} 사진 ${position + 1}`}
            loading={position === 0 ? 'eager' : 'lazy'}
            className="h-56 w-full shrink-0 snap-center object-cover"
          />
        ))}
      </div>

      {photos.length > 1 && (
        <p className="absolute right-3 bottom-3 rounded-md bg-overlay/70 px-2.5 py-1 text-xs font-semibold text-white">
          {Math.min(index + 1, photos.length)} / {photos.length}
        </p>
      )}
    </div>
  );
}
