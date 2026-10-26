import { feeChipForWeight } from './dogFee';
import { headlineFor, isOutdoorSeatOnly, type TEligibility, type TEligibilityLevel } from './eligibility';
import { isFeeBadgeRepeatedIn, NO_INFO_BADGE_LABEL, toPetBadges, type TPetBadge, type TPetPolicy } from './petPolicy';

/*
 * 판정은 배지가 아니라 **글자**다(22 G3.0 · 디자인 감사 A-4 · A-10). 넷 = 글자색 넷, 면·링·점 없음.
 * 예전 배지는 '야외 자리에서 갈 수 있어요' 와 '확인이 필요해요' 가 같은 앰버 알약, '어려워요' 와 '정보 없음' 이 구별 안 되는 회색 둘이었다 —
 * 상태 넷을 색 둘로 칠한 셈이다. 어려움은 빨강이다: 어려운 곳은 목록에서 기본으로 접혀 있어 붉은 글자가 목록을 덮지 않는다(ADR-003 v24).
 */

/** 판정 글자색의 칸 — 레벨과 같되 야외 자리만 되는 곳은 'ok' 다(갈 수 있다 · 조건이 붙을 뿐). */
export type TVerdictTone = TEligibilityLevel;

export const VERDICT_TEXT_CLASS: Record<TVerdictTone, string> = {
  ok: 'text-brand-secondary',
  cond: 'text-warning-primary',
  unknown: 'text-tertiary',
  hard: 'text-error-primary',
};

export const OUTDOOR_SEAT_NOTE = '야외 자리만';

/**
 * 카드·근처·지도 시트가 쓰는 판정 글자. **야외 자리만은 판정이 아니라 조건이다** — '갈 수 있어요 · 야외 자리만'.
 * 셈(`isReachable` · `countByLevel` 의 `ok + outdoor`)도 이미 그곳을 갈 수 있는 곳에 넣는다. 상세 머리글(`verdictFor`)은 문장이라
 * '야외 자리에서 갈 수 있어요' 그대로 두고 색만 이 표를 따른다(`verdictTone`).
 */
export function verdictWords(e: TEligibility): { tone: TVerdictTone; head: string; note?: string } {
  if (isOutdoorSeatOnly(e)) return { tone: 'ok', head: headlineFor({ level: 'ok', reasons: [] }), note: OUTDOOR_SEAT_NOTE };
  return { tone: e.level, head: headlineFor(e) };
}

export const verdictTone = (e: TEligibility): TVerdictTone => verdictWords(e).tone;

export type TCardConditionsInput = {
  policy: TPetPolicy;
  /** 카드에서는 앞에서부터 몇 개만 보여준다. 나머지는 '외 N개' 로 접는다. 없으면 전부(상세). */
  limit?: number;
  /** 같은 줄에 판정이 있을 때 켠다 — 판정이 이미 "정보가 없어요" 라고 말하므로 원문 칩 "확인된 정보 없음" 은 같은 말이다. */
  hideNoInfo?: boolean;
  /**
   * 판정·이유 줄이 이미 말했거나 판정과 반대로 읽히는 칩을 뺀다(`verdictHidesBadge`). 뺀 칩은 '외 N개' 에 세지 않는다:
   * 접어 둔 것이 아니라 카드가 말하지 않기로 한 것이다.
   */
  hide?: (badge: TPetBadge) => boolean;
  /** 이 라벨의 칩을 맨 앞에 세운다 — 이유 줄이 없는 카드(근처 장소)에서 `limit` 자리를 판정을 정한 칩이 차지하게(14 W261013.1c). */
  lead?: string;
  /** 원문을 바로 밑에 같이 보여 줄 때 — 원문에 그대로 적힌 요금 칩은 같은 말이라 뺀다. */
  sourceText?: string;
  /** 우리 강아지(가장 무거운 아이) 몸무게. 있으면 `limit` 자리의 요금 칩 하나를 그 구간 줄로 고른다(`feeChipForWeight`). */
  weightKg?: number;
  /** 우리 강아지 마릿수 — 마릿수로도 갈리는 요금 줄을 고를 때. */
  dogCount?: number;
  /**
   * 카드가 따로 세우는 우리 강아지 요금 한 줄(`eligibility.fee`). 있으면 고른 요금 칩을 뺀다 — 줄이 그 요금을 이미 말했다(14 W261007.6 · W261013.4).
   * 다른 줄로 바꿔 세우지 않는다: 캄에서 칩이 기본 줄로 물러나면 한 카드가 4만원과 3만원을 같이 말한다(07 U5 후속).
   */
  feeLine?: string;
};

/**
 * 판정 옆에 서는 원문 조건(예전의 칩 줄) — 무엇을 보이고 몇 개를 접는가. 카드의 글자 줄(`VerdictLine`)과 상세의 칩(`PetBadges`)이 이 하나를 쓴다.
 *
 * **자리가 정해진 곳(`limit`)에서는 요금 줄을 하나만 세운다.** 요금은 기준마다 한 줄이라 개수 상한이 없고 `toPetBadges` 순서에서
 * 크기·무게·확인 필요보다 앞이다 — 그대로 자르면 요금 두세 줄이 자리를 다 먹어 `대형견 불가` 같은 경고가 '외 N개' 뒤로 숨는다.
 * 숨긴 요금 줄은 `hidden` 에 들어간다 — 접힌 수가 실제와 다르면 "더 있다" 는 신호가 거짓이 된다.
 */
export function cardConditions({
  policy,
  limit,
  hideNoInfo = false,
  hide,
  lead,
  sourceText,
  weightKg,
  dogCount,
  feeLine,
}: TCardConditionsInput): { shown: TPetBadge[]; hidden: number } {
  const all = toPetBadges(policy)
    .filter((badge) => !(hideNoInfo && badge.label === NO_INFO_BADGE_LABEL))
    .filter((badge) => !hide?.(badge))
    .filter((badge) => !(sourceText !== undefined && isFeeBadgeRepeatedIn(badge, sourceText)));
  const firstFee = all.findIndex((b) => b.axis === 'fee');
  // 프로필이 있으면 그 하나는 첫 줄이 아니라 **우리 강아지 구간**이다(07 U5) — 20kg 아이에게 "1~5kg 1만원" 을 세우지 않는다.
  const pickedFee =
    firstFee >= 0 && weightKg !== undefined
      ? feeChipForWeight(all.filter((b) => b.axis === 'fee').map((b) => b.label), weightKg, dogCount)
      : all[firstFee]?.label;
  const feeInLine = pickedFee != null && feeLine !== undefined;
  const feeLabel = feeInLine ? null : pickedFee;
  const picked = limit
    ? all.flatMap((badge, index) => {
        if (badge.axis !== 'fee') return [badge];
        if (index !== firstFee || feeLabel === null || feeLabel === undefined) return [];
        return [{ ...badge, label: feeLabel }];
      })
    : all;
  // 요금 줄을 고른 **뒤에** 옮긴다 — `firstFee` 는 `all` 의 자리라 먼저 옮기면 엉킨다. 순서만 바뀌므로 `hidden` 은 그대로다.
  const badges = lead === undefined ? picked : [...picked.filter((b) => b.label === lead), ...picked.filter((b) => b.label !== lead)];
  const shown = limit ? badges.slice(0, limit) : badges;
  // 접힌 수는 거른 뒤가 아니라 전부에서 센다. 요금 한 줄이 말해 뺀 칩은 숨긴 게 아니라 이미 보이는 것이라 뺀다.
  const hidden = Math.max(0, all.length - shown.length - (limit && feeInLine ? 1 : 0));
  return { shown, hidden };
}
