import type { TEligibility } from '../lib/eligibility';
import { cardConditions, verdictWords, VERDICT_TEXT_CLASS, type TCardConditionsInput } from '../lib/verdictLine';
import { cx } from '../utils/cx';

/**
 * 판정 글자 — '갈 수 있어요'(브랜드) · '확인이 필요해요'(앰버) · '확인된 정보가 없어요'(회색) · '이용하기 어려워요'(빨강).
 * 야외 자리만 되는 곳은 '갈 수 있어요 · 야외 자리만'(뒤는 회색). 면·링·점이 없다(22 G3.0).
 */
export function VerdictText({ eligibility, className }: { eligibility: TEligibility; className?: string }) {
  const { tone, head, note } = verdictWords(eligibility);
  return (
    <span className={cx('font-semibold whitespace-nowrap', VERDICT_TEXT_CLASS[tone], className)}>
      {head}
      {note && <span className="font-normal text-tertiary"> · {note}</span>}
    </span>
  );
}

type TVerdictLineProps = Omit<TCardConditionsInput, 'hideNoInfo'> & {
  /** 우리 강아지 판정. 강아지가 없으면 null — 조건 글자만 선다. */
  eligibility: TEligibility | null | undefined;
  className?: string;
};

/**
 * 카드의 판정 줄 한 줄 — '갈 수 있어요 · 최대 2마리 · 1만원 외 1개'. 예전 배지 줄(판정 알약 + 조건 알약 + '조건 N개 더')을 글자로 바꿨다
 * (22 G3.0 · 디자인 감사 A-4: 카드 하나에 면 있는 알약이 넷이었다). 목록 카드·근처 장소가 이 하나를 쓴다.
 *
 * 한 줄에서 넘치면 **조건 글자만** 말줄임이 된다 — 판정과 '외 N개' 는 줄지 않는다(`shrink-0`). 끝을 말줄임에 맡기면 접힌 수가 먼저 잘린다.
 */
export function VerdictLine({ eligibility, className, ...input }: TVerdictLineProps) {
  const { shown, hidden } = cardConditions({ ...input, hideNoInfo: Boolean(eligibility) });
  if (!eligibility && shown.length === 0) return null;
  const conditions = shown.map((badge) => badge.label).join(' · ');
  return (
    <p className={cx('flex min-w-0 items-baseline text-sm text-tertiary', className)}>
      {eligibility && <VerdictText eligibility={eligibility} className="shrink-0" />}
      {conditions && (
        <span className="min-w-0 truncate">
          {/* 플렉스 칸의 맨 앞 공백은 접힌다 — 가운뎃점 앞뒤 공백을 살린다. */}
          {eligibility && <span className="whitespace-pre"> · </span>}
          {conditions}
        </span>
      )}
      {hidden > 0 && <span className="shrink-0 whitespace-pre"> 외 {hidden}개</span>}
    </p>
  );
}
