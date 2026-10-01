import type { FC } from 'react';
import { PLACE_TYPE_GLYPH } from '../../lib/placeTypeGlyph';
import type { TIconProps } from './iconProps';
import type { TPlaceType } from '../../types';

/**
 * 종류 아이콘 하나. 그림은 `PLACE_TYPE_GLYPH` 에 있고 지도 핀도 같은 그림을 쓴다.
 * Untitled UI 규격을 그대로 따른다 — 24×24, stroke 2, round cap/join, currentColor.
 */
function placeTypeIcon(type: TPlaceType): FC<TIconProps> {
  const Icon = ({ size = 24, color = 'currentColor', ...props }: TIconProps) => (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      stroke={color}
      strokeWidth="2"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {PLACE_TYPE_GLYPH[type].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
  Icon.displayName = `PlaceTypeIcon(${type})`;
  return Icon;
}

/**
 * 종류 아이콘. 카드·상세·지도 시트·사이드바가 모두 이것 하나만 쓰고, 지도 핀도 같은 그림이다.
 *
 * 예전에는 네이버 카테고리 문자열마다 이모지를 하나씩 붙였는데(🥓·🍣·🥐…),
 * 이모지는 기기마다 그림이 달라 화면 톤이 흐트러지고 크기도 제각각이었다.
 * 종류가 셋뿐이라 세 개의 선화 아이콘으로 통일하고, 세부 분류는 텍스트로 보여준다.
 */
export const PLACE_TYPE_ICON: Record<TPlaceType, FC<TIconProps>> = {
  stay: placeTypeIcon('stay'),
  restaurant: placeTypeIcon('restaurant'),
  cafe: placeTypeIcon('cafe'),
};
