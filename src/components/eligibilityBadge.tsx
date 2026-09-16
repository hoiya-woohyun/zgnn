import { Badge } from './base/badges';
import type { BadgeColors } from './base/badge-types';
import type { TEligibilityLevel } from '../lib/eligibility';

/**
 * 판정 레벨 하나를 배지로. 카드·상세·지도 시트가 같은 라벨과 색을 쓴다.
 *
 * 색은 PetBadges(파서 배지)와 겹치지 않게 골랐다 — 파서 배지는 brand/gray/indigo 를 쓰므로
 * 판정은 "가능" 만 brand 로 같고, 조건부는 orange, 정보 없음은 gray 테두리, 어려움은 slate(잉크).
 * 어려움을 error(빨강)로 두지 않은 것은 "불가" 가 아니라 "어려움" 이라는 톤 때문(ADR-005).
 */
export const ELIGIBILITY_META: Record<TEligibilityLevel, { label: string; color: BadgeColors }> = {
  ok: { label: '가능', color: 'brand' },
  cond: { label: '조건부', color: 'orange' },
  unknown: { label: '정보 없음', color: 'gray' },
  hard: { label: '어려움', color: 'slate' },
};

type TEligibilityBadgeProps = {
  level: TEligibilityLevel;
  /** 상세 상단처럼 크게 보여줄 때 */
  size?: 'sm' | 'md';
  className?: string;
};

export function EligibilityBadge({ level, size = 'sm', className }: TEligibilityBadgeProps) {
  const meta = ELIGIBILITY_META[level];
  return (
    <Badge size={size} color={meta.color} className={className}>
      {meta.label}
    </Badge>
  );
}
