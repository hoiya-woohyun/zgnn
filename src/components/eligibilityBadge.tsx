import { Badge } from './base/badges';
import type { BadgeColors } from './base/badge-types';
import type { TEligibilityLevel } from '../lib/eligibility';

/**
 * 판정 레벨 하나를 배지로. 카드·상세·지도 시트가 같은 라벨과 색을 쓴다.
 *
 * 색 이름은 Untitled UI 의 키를 그대로 쓰지만, 값은 theme.css 에서 팔레트 안으로 덮어 놨다.
 * 특히 slate 는 원래 주석이 "잉크" 라고 적어 뒀는데 Tailwind 기본 slate 는 H 257° 의 차가운
 * 청회색이라 의도와 반대였다 — placeCard 의 배지 줄에서 크림 gray 칩(H 78°)과 맞닿아
 * 회색 두 개가 색상환 179° 차이로 붙어 보였다. 지금은 neutral 을 한 단계 진하게 당겨 쓴다.
 *
 * 네 단계는 "무게" 로 읽히게 정렬돼 있다: ok "갈 수 있어요"(브랜드 핑크) → cond "확인이 필요해요"(앰버) →
 * unknown "정보가 없어요"(크림 뉴트럴) → hard "이용하기 어려워요"(잉크, 가장 무거움).
 * hard 를 error(빨강)로 두지 않은 것은 "불가" 가 아니라 "어려움" 이라는 톤 때문(ADR-005).
 *
 * 라벨은 문장형이다 — "조건부"·"정보 없음" 같은 축약 명사형은 처음 보는 사람이 뜻을 되물어야 했다.
 * 상세 머리글(placeDetailEligibilityCard 의 HEADLINE)은 앞에 이름이 붙어 어미가 조금 다르다.
 */
export const ELIGIBILITY_META: Record<TEligibilityLevel, { label: string; color: BadgeColors }> = {
  ok: { label: '갈 수 있어요', color: 'brand' },
  cond: { label: '확인이 필요해요', color: 'orange' },
  unknown: { label: '정보가 없어요', color: 'gray' },
  hard: { label: '이용하기 어려워요', color: 'slate' },
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
    <Badge type="color" size={size} color={meta.color} className={className}>
      {meta.label}
    </Badge>
  );
}
