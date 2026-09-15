import type { FC } from 'react';
import { IconBed } from './iconBed';
import { IconCoffee } from './iconCoffee';
import { IconUtensils } from './iconUtensils';
import type { TIconProps } from './iconProps';
import type { TPlaceType } from '../../types';

/**
 * 종류 아이콘. 카드·상세·지도 시트·사이드바가 모두 이것 하나만 쓴다.
 *
 * 예전에는 네이버 카테고리 문자열마다 이모지를 하나씩 붙였는데(🥓·🍣·🥐…),
 * 이모지는 기기마다 그림이 달라 화면 톤이 흐트러지고 크기도 제각각이었다.
 * 종류가 셋뿐이라 세 개의 선화 아이콘으로 통일하고, 세부 분류는 텍스트로 보여준다.
 */
export const PLACE_TYPE_ICON: Record<TPlaceType, FC<TIconProps>> = {
  stay: IconBed,
  restaurant: IconUtensils,
  cafe: IconCoffee,
};
