import { PLACE_TYPE_ICON } from './icons/placeTypeIcon';
import { TYPE_COLOR } from '../lib/places';
import { cx } from '../utils/cx';
import type { TPlaceType } from '../types';

/**
 * 종류가 섞이는 목록(지도 시트·사이드바·상세 근처·날짜별 정리)에서 업체명 앞에 서는 종류 표시 —
 * 바탕 없는 16px 종류색 선 아이콘이다(22 G3.1b, design-audit B-5). 예전 44/40 색 상자(`PlaceThumb`)는
 * 사진이 없는 앱이라 정보 0 인 그래픽 슬롯이 행마다 한 칸을 차지했다.
 *
 * 크기는 spacing 파생 클래스(`size-4`)라 화면이 커지면 글자와 함께 커진다(ADR-006). 이름을 말하지 않는다
 * (`aria-hidden`) — 행 전체가 이미 장소 이름을 가진 링크이고, 종류는 옆 메타가 글자로 말한다.
 * 이름 줄이 `text-md`(24px 줄 높이)이면 한 줄 위쪽에 맞추려고 호출부가 `mt-1` 을 준다.
 */
export function PlaceTypeMark({ type, className = '' }: { type: TPlaceType; className?: string }) {
  const Icon = PLACE_TYPE_ICON[type];
  return <Icon className={cx('size-4 shrink-0', className)} style={{ color: TYPE_COLOR[type] }} />;
}
