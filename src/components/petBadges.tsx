import { Check } from '@untitledui/icons';
import { Badge, BadgeWithIcon } from './base/badges';
import type { BadgeColors } from './base/badge-types';
import { feeChipForWeight } from '../lib/dogFee';
import { isFeeBadgeRepeatedIn, NO_INFO_BADGE_LABEL, toPetBadges, type TBadgeTone, type TPetPolicy } from '../lib/petPolicy';

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
 *
 * ok 는 brand 핑크였다가 **gray + 체크 아이콘**으로 내렸다 — "실내 OK" 가 판정 "갈 수 있어요" 와 같은
 * 핑크 알약이라 원문 속성이 판정처럼 읽혔다(D1). brand 핑크는 판정 ok 전용으로 남긴다(ADR-003).
 * 같은 gray 인 cond 와는 체크 아이콘이 가른다.
 */
const TONE_COLOR: Record<TBadgeTone, BadgeColors> = {
  ok: 'gray',
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
  /** 이 배지 줄 바로 밑에 원문을 같이 보여 줄 때 넘긴다 — 원문에 그대로 적힌 요금 배지는 같은 말이라 뺀다. */
  sourceText?: string;
  /** 우리 강아지(가장 무거운 아이) 몸무게. 있으면 `limit` 자리의 요금 칩 하나를 그 구간 줄로 고른다(`feeChipForWeight`). */
  weightKg?: number;
  /** 우리 강아지 마릿수. 캄 "2마리 또는 10kg 이상 4만원" 처럼 마릿수로도 갈리는 줄을 고를 때 쓴다. 없으면 한 마리로 본다. */
  dogCount?: number;
  /**
   * 카드가 배지 줄 위에 세우는 우리 강아지 요금 한 줄(`eligibility.fee`). 고른 요금 칩이 그 줄에 그대로 들어 있으면 칩을 뺀다 —
   * "두부는 3만원 (1마리당 3만원)" 밑에 `1마리당 3만원` 칩이 또 섰다(14 W261007.6). 다른 줄로 바꿔 세우지 않는다:
   * 캄에서 칩이 기본 줄로 물러나면 한 카드가 4만원과 3만원을 같이 말한다(07 U5 후속).
   */
  feeLine?: string;
  className?: string;
};

export function PetBadges({ policy, limit, hideNoInfo = false, sourceText, weightKg, dogCount, feeLine, className = '' }: TPetBadgesProps) {
  const all = toPetBadges(policy).filter((badge) => !(hideNoInfo && badge.label === NO_INFO_BADGE_LABEL))
    .filter((badge) => !(sourceText !== undefined && isFeeBadgeRepeatedIn(badge, sourceText)));
  /*
   * **자리가 정해진 곳에서는 요금 줄을 첫 줄만 세운다.** 요금은 기준마다 한 줄이라 개수 상한이 없고
   * (`1마리당 3만원`·`청소비 5만원`·`주말 5만원`…), `toPetBadges` 의 순서에서 크기·무게·확인 필요보다 **앞**에 있다.
   * 그대로 자르면 요금 두세 줄이 예산을 다 먹어 `대형견 불가`·`원문 확인 필요` 같은 **경고가 `+N` 뒤로 숨는다** —
   * 카드에서 먼저 보여야 하는 것은 정반대다. 상세(`limit` 없음)는 전부 보여 준다: 그 화면엔 자리가 있고,
   * 우리 강아지 기준 금액도 따로 한 줄로 나온다(`dogFee.ts`).
   *
   * 숨긴 요금 줄은 `+N` 에 들어간다 — 접힌 수가 실제와 달라지면 "더 있다" 는 신호가 거짓이 된다.
   */
  const firstFee = all.findIndex((b) => b.axis === 'fee');
  // 프로필이 있으면 그 하나는 첫 줄이 아니라 **우리 강아지 구간**이다(07 U5) — 20kg 아이에게 "1~5kg 1만원" 을 세우지 않는다.
  const pickedFee =
    firstFee >= 0 && weightKg !== undefined
      ? feeChipForWeight(all.filter((b) => b.axis === 'fee').map((b) => b.label), weightKg, dogCount)
      : all[firstFee]?.label;
  const feeInLine = pickedFee != null && feeLine !== undefined && isFeeBadgeRepeatedIn({ label: pickedFee, axis: 'fee', tone: 'cond' }, feeLine);
  const feeLabel = feeInLine ? null : pickedFee;
  const badges = limit
    ? all.flatMap((badge, index) => {
        if (badge.axis !== 'fee') return [badge];
        if (index !== firstFee || feeLabel === null || feeLabel === undefined) return [];
        return [{ ...badge, label: feeLabel }];
      })
    : all;
  if (badges.length === 0) return null;

  const shown = limit ? badges.slice(0, limit) : badges;
  // 접힌 수는 **거른 뒤가 아니라 전부**에서 센다 — 빼 둔 요금 줄이 `+N` 에 안 들어가면 "더 있다" 가 거짓이 된다.
  // 요금 한 줄에 그대로 있어 뺀 칩은 숨긴 게 아니라 이미 보이는 것이라 `+N` 에서 뺀다.
  const hidden = all.length - shown.length - (limit && feeInLine ? 1 : 0);

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
      {hidden > 0 && <li className="text-xs font-semibold text-tertiary">+{hidden}</li>}
    </ul>
  );
}
