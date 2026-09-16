import { Badge } from './base/badges';
import type { BadgeColors } from './base/badge-types';
import { toPetBadges, type TBadgeTone, type TPetPolicy } from '../lib/petPolicy';

/**
 * 파서가 매긴 톤을 Untitled UI 배지 색으로 옮긴다.
 * ok=가능·무료, cond=조건부, warn=확인 필요.
 *
 * success(초록)·warning(앰버)은 팔레트 밖이라 뺐다. 특히 warning 은 식당 타입 색(#cf8330,
 * 앰버 계열)과 같은 색상대라 식당 카드에서 "확인 필요" 배지가 타입 색에 묻혔다(2026-09-15
 * 디자인 리뷰 P2). ok 는 브랜드 핑크로, warn 은 어느 타입 색과도 겹치지 않는 indigo 로 옮겼다.
 */
const TONE_COLOR: Record<TBadgeTone, BadgeColors> = {
  ok: 'brand',
  cond: 'gray',
  warn: 'indigo',
};

type TPetBadgesProps = {
  policy: TPetPolicy;
  /** 카드에서는 앞에서부터 몇 개만 보여준다. 나머지는 +N 으로 접는다. */
  limit?: number;
  className?: string;
};

export function PetBadges({ policy, limit, className = '' }: TPetBadgesProps) {
  const badges = toPetBadges(policy);
  if (badges.length === 0) return null;

  const shown = limit ? badges.slice(0, limit) : badges;
  const hidden = badges.length - shown.length;

  return (
    <ul className={`flex flex-wrap items-center gap-1 ${className}`}>
      {shown.map((badge) => (
        <li key={badge.label}>
          <Badge size="sm" color={TONE_COLOR[badge.tone]}>
            {badge.label}
          </Badge>
        </li>
      ))}
      {hidden > 0 && <li className="text-xs font-semibold text-quaternary">+{hidden}</li>}
    </ul>
  );
}
