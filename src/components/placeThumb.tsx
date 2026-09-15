import { PLACE_TYPE_ICON } from './icons/placeTypeIcon';
import { TYPE_COLOR, typeTint } from '../lib/places';
import type { TPlaceType } from '../types';

type TPlaceThumbProps = {
  src?: string;
  type: TPlaceType;
  /** 아이콘 타일의 한 변(px). 사진이 있으면 사진도 이 크기로 채운다. */
  size?: number;
  className?: string;
};

/**
 * 카드·시트의 썸네일 자리.
 *
 * 장소 사진이 없는 것이 이 앱의 기본 상태다(86곳 중 대부분). 빈 사각형을 두는 대신
 * 종류 아이콘을 타입 색 타일 위에 올려 자리를 채운다.
 *
 * 접근성: 사진이든 아이콘이든 이름을 말하지 않는다. 카드 전체가 이미 장소 이름을 가진
 * 링크라, 여기서 이름을 한 번 더 말하면 스크린리더가 같은 이름을 두 번 읽는다.
 */
export function PlaceThumb({ src, type, size = 44, className = '' }: TPlaceThumbProps) {
  const Icon = PLACE_TYPE_ICON[type];

  if (src) {
    return (
      <img
        src={src}
        alt=""
        aria-hidden="true"
        loading="lazy"
        width={size}
        height={size}
        className={`shrink-0 rounded-xl object-cover ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center rounded-xl ${className}`}
      style={{ width: size, height: size, background: typeTint(type, 14), color: TYPE_COLOR[type] }}
    >
      <Icon size={Math.round(size * 0.5)} />
    </span>
  );
}
