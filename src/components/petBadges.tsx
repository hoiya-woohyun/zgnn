import { Badge } from './base/badges';
import type { BadgeColors } from './base/badge-types';
import { NO_INFO_BADGE_LABEL, toPetBadges, type TBadgeTone, type TPetPolicy } from '../lib/petPolicy';

/**
 * 파서가 매긴 톤을 Untitled UI 배지 색으로 옮긴다.
 * ok=허용·무료, cond=제한 조건, warn=확인 필요.
 *
 * warn 은 한동안 indigo 였다 — 식당 타입 색(#cf8330, 앰버 계열)과 겹쳐 배지가 타입 색에
 * 묻혔기 때문이다(2026-09-15 디자인 리뷰 P2). 제약은 맞았지만 해법이 팔레트 밖으로 나가는
 * 것이었고, Tailwind 기본 indigo 는 H 277°·채도 0.240 으로 앱에서 가장 진한 색이라
 * "확인 필요" 라는 부가 정보가 주 버튼(브랜드, 0.205)보다 시선을 먼저 끄는 위계 역전이 났다.
 *
 * 이제 앰버로 돌아오되 theme.css 에서 채도를 0.110 까지 눌러 뒀다 — 원래 충돌은 채도 높은
 * 앰버끼리의 일이었고, 작은 칩과 큰 파스텔 워시는 형태가 달라 같은 색상대라도 부딪히지 않는다.
 * 판정 배지의 cond("확인이 필요해요")와 같은 앰버를 쓰는 것도 의도다: 이 앱에서 앰버는 언제나 "주의" 를 뜻한다.
 */
const TONE_COLOR: Record<TBadgeTone, BadgeColors> = {
  ok: 'brand',
  cond: 'gray',
  warn: 'orange',
};

type TPetBadgesProps = {
  policy: TPetPolicy;
  /** 카드에서는 앞에서부터 몇 개만 보여준다. 나머지는 +N 으로 접는다. */
  limit?: number;
  /**
   * 같은 줄에 판정 배지가 있을 때 켠다. 판정이 이미 "정보가 없어요" 라고 말하므로 원문 배지
   * "확인된 정보 없음" 을 나란히 두면 같은 말을 두 번 하는 셈이라 뺀다.
   */
  hideNoInfo?: boolean;
  className?: string;
};

export function PetBadges({ policy, limit, hideNoInfo = false, className = '' }: TPetBadgesProps) {
  const badges = toPetBadges(policy).filter((badge) => !(hideNoInfo && badge.label === NO_INFO_BADGE_LABEL));
  if (badges.length === 0) return null;

  const shown = limit ? badges.slice(0, limit) : badges;
  const hidden = badges.length - shown.length;

  return (
    <ul className={`flex flex-wrap items-center gap-1 ${className}`}>
      {shown.map((badge) => (
        <li key={badge.label}>
          <Badge type="color" size="sm" color={TONE_COLOR[badge.tone]}>
            {badge.label}
          </Badge>
        </li>
      ))}
      {hidden > 0 && <li className="text-xs font-semibold text-tertiary">+{hidden}</li>}
    </ul>
  );
}
