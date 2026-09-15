import { Badge } from './base/badges';
import type { BadgeColors } from './base/badge-types';
import { toPetBadges, type TBadgeTone, type TPetPolicy } from '../lib/petPolicy';

/**
 * 파서가 매긴 톤을 Untitled UI 배지 색으로 옮긴다.
 * ok=가능·무료, cond=조건부, warn=확인 필요.
 */
const TONE_COLOR: Record<TBadgeTone, BadgeColors> = {
  ok: 'success',
  cond: 'gray',
  warn: 'warning',
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
