import { PLACE_TYPE_ICON } from './icons/placeTypeIcon';
import { TYPE_COLOR, typeTint } from '../lib/places';
import { cx } from '../utils/cx';
import type { TPlaceType } from '../types';

/**
 * 썸네일 두 치수. 44 와 40 은 드리프트가 아니라 규칙이다 — 다만 지금까지 숫자 리터럴로만
 * 존재해 규칙인지 실수인지 구분할 수 없었다(2026-09-16 사이즈 감사).
 *
 * - `primary` — 그 화면의 주 목록(`placeCard`, `mapPageSheet`). 카드 전체가 탭 타깃이라
 *   썸네일도 44px 기준에 맞춘다.
 * - `compact` — 지도 사이드바·상세의 "근처 장소" 처럼 이미 맥락이 정해진 조밀한 보조 목록.
 *   한 화면에 더 담으려고 한 단 줄인 것이고, 그래서 40px 이다.
 *
 * 크기를 px 가 아니라 spacing 파생 클래스(`size-11` = `--spacing * 11`)로 적는 이유는
 * 화면이 커지면 이것도 같이 커져야 하기 때문이다(globals.css 의 --spacing 스케일).
 * px 값은 `<img>` 의 width/height 속성 — 폰트·CSS 가 오기 전 자리를 잡아 레이아웃이
 * 튀지 않게 하는 용도이고, 최종 크기는 항상 CSS 가 정한다.
 *
 * 세 번째 치수가 필요하다고 느껴지면 그건 이 규칙을 다시 논의할 신호지, 리터럴을 하나 더
 * 적을 자리가 아니다.
 */
export const PLACE_THUMB = {
  primary: { tile: 'size-11', icon: 'size-5.5', px: 44 },
  compact: { tile: 'size-10', icon: 'size-5', px: 40 },
} as const;

export type TPlaceThumbVariant = keyof typeof PLACE_THUMB;

type TPlaceThumbProps = {
  src?: string;
  type: TPlaceType;
  /** 어느 목록에 놓이는가. 기본은 주 목록. */
  variant?: TPlaceThumbVariant;
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
export function PlaceThumb({ src, type, variant = 'primary', className = '' }: TPlaceThumbProps) {
  const Icon = PLACE_TYPE_ICON[type];
  const { tile, icon, px } = PLACE_THUMB[variant];

  if (src) {
    return (
      <img
        src={src}
        alt=""
        aria-hidden="true"
        loading="lazy"
        width={px}
        height={px}
        className={cx('shrink-0 rounded-xl object-cover', tile, className)}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={cx('grid shrink-0 place-items-center rounded-xl', tile, className)}
      style={{ background: typeTint(type, 14), color: TYPE_COLOR[type] }}
    >
      <Icon className={icon} />
    </span>
  );
}
