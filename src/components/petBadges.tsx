import { Check } from '@untitledui/icons';
import { Badge, BadgeWithIcon } from './base/badges';
import type { BadgeColors } from './base/badge-types';
import type { TBadgeTone, TPetPolicy } from '../lib/petPolicy';
import { cardConditions } from '../lib/verdictLine';

/**
 * 파서가 매긴 톤을 Untitled UI 배지 색으로 옮긴다.
 * ok=허용·무료, cond=제한 조건, warn=확인 필요.
 *
 * warn 은 한동안 indigo 였다 — 식당 타입 색(#cf8330, 앰버 계열)과 겹쳐 배지가 타입 색에
 * 묻혔기 때문이다(2026-09-15 디자인 리뷰 P2). 제약은 맞았지만 해법이 팔레트 밖으로 나가는
 * 것이었고, Tailwind 기본 indigo 는 H 277°·채도 0.240 으로 앱에서 가장 진한 색이라
 * "확인 필요" 라는 부가 정보가 주 버튼(브랜드, 0.205)보다 시선을 먼저 끄는 위계 역전이 났다.
 * 이제 앰버로 돌아오되 theme.css 에서 채도를 0.110 까지 눌러 뒀다.
 *
 * ok 는 brand 핑크였다가 **gray + 체크 아이콘**으로 내렸다 — "실내 OK" 가 판정 "갈 수 있어요" 와 같은
 * 핑크 알약이라 원문 속성이 판정처럼 읽혔다(D1). 같은 gray 인 cond 와는 체크 아이콘이 가른다.
 */
const TONE_COLOR: Record<TBadgeTone, BadgeColors> = {
  ok: 'gray',
  cond: 'gray',
  warn: 'orange',
};

type TPetBadgesProps = {
  policy: TPetPolicy;
  /** 판정이 같은 화면에 있을 때 켠다 — 판정이 이미 "정보가 없어요" 라고 말한다. */
  hideNoInfo?: boolean;
  /** 이 칩 줄 바로 밑에 원문을 같이 보여 줄 때 넘긴다 — 원문에 그대로 적힌 요금 칩은 같은 말이라 뺀다. */
  sourceText?: string;
  className?: string;
};

/**
 * 상세 원문 위의 조건 칩 — 전부 보여 준다. **카드에서는 칩을 쓰지 않는다**: 목록·근처·지도 시트는 판정 줄 글자(`VerdictLine`)로 말한다
 * (22 G3.0 · 디자인 감사 A-4). 무엇을 보일지는 둘이 같은 함수(`cardConditions`)로 고른다. 상세 칩 정리는 22 G7.1 몫이다.
 */
export function PetBadges({ policy, hideNoInfo = false, sourceText, className = '' }: TPetBadgesProps) {
  const { shown } = cardConditions({ policy, hideNoInfo, sourceText });
  if (shown.length === 0) return null;

  return (
    <ul className={`flex flex-wrap items-center gap-1 ${className}`}>
      {shown.map((badge) => (
        <li key={badge.label}>
          {badge.tone === 'ok' ? (
            <BadgeWithIcon type="color" size="sm" color={TONE_COLOR.ok} iconLeading={Check}>
              {badge.label}
            </BadgeWithIcon>
          ) : (
            <Badge type="color" size="sm" color={TONE_COLOR[badge.tone]}>
              {badge.label}
            </Badge>
          )}
        </li>
      ))}
    </ul>
  );
}
