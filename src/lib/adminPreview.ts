/**
 * 접힌 카드의 표식·동반 조건 한 칸을 **화면 말**로 옮기는 층.
 *
 * `scripts/analyze/reviewCandidates.mjs` 는 CLI 정본이고 그 테스트가 문자열을 정확히 단정하므로 건드리지 않는다
 * (`reviewCandidates.test.mjs:41·43·51·61`). 그래서 그 파일이 내는 한국어 문자열을 **키로** 받아
 * 라벨·색·자리를 여기서 정한다. 대가는 하나다 — `pnpm data:review` 는 옛 말을 계속 쓴다(의도된 갈라짐,
 * docs/features/admin-review.md 에 적어 둔다).
 *
 * 색을 라벨 문자열로 찾던 `FLAG_COLOR`(옛 adminPageGroupCard.tsx:65-69)를 이 표가 대체한다 —
 * 그 표는 보간 표식(`AI≠정규식(...)`)을 절대 못 잡아 그 뱃지가 영구히 회색이었다.
 *
 * **전수성을 지키는 것은 테스트가 아니라 `unknownRule` 이다.** 테스트는 지금 아는 표식만 확인할 수 있고
 * (`adminPreview.test.ts`), `.mjs` 에 표식이 하나 더 생기면 그 목록은 모르는 채로 초록이다. 그래서 모르는 표식을
 * **주황 뱃지로 원문 그대로** 보여 준다 — 못생기게 드러나는 것이 조용히 묻히는 것보다 낫다.
 */

import { factsLine, FACTS_EMPTY, type TPolicyPreview } from './adminCandidates';

export type TFlagTone = 'gray' | 'warning' | 'error';
export type TFlagBadge = { key: string; label: string; tone: TFlagTone };
/** 뱃지로 그릴 것과, 뱃지에서 강등해 둘째 줄 끝에 붙일 한마디. */
export type TAdminFlagView = { badges: TFlagBadge[]; notes: string[] };

type TRule =
  | { kind: 'badge'; label: string; tone: TFlagTone; rank: number }
  | { kind: 'note'; note: string }
  | { kind: 'hidden' };

/** 키 = reviewCandidates.mjs 가 내는 문자열 그대로. `groupFlags`(:91-95) 5개 + `previewPolicy`(:79-83) 5개. */
const RULES: Record<string, TRule> = {
  '지역 없음': { kind: 'badge', label: '지역 없음', tone: 'error', rank: 0 }, // 승인을 막는다
  '동반불가 문장': { kind: 'badge', label: '동반불가 문장', tone: 'error', rank: 1 },
  /*
   * 감춘다. 이 표식이 뜨는 유일한 경우는 "정규식은 실패했지만 AI 가 읽어냈다" 인데 그 상태는 앱 입장에서
   * **정상**이다(ADR-017: 정규식은 시드의 파서이고 블로그 경로에서는 안전망). 운영자가 달리 할 일이 없다.
   * 어긋남을 말하는 표식은 `실내 조건 엇갈림` 쪽이고, 무엇을 읽었는지는 펼친 `기본 규칙이 읽은 것` 줄이 보여 준다.
   * 아무도 못 읽은 카드는 표식이 아니라 **둘째 줄**이 말한다(`policyCell`).
   */
  '정규식 못읽음': { kind: 'hidden' },
  목록글: { kind: 'badge', label: '목록글', tone: 'gray', rank: 5 }, // 반려 사유 칩과 같은 이름이라 유지
  '좌표 없음': { kind: 'note', note: '지도에 안 보여요' }, // 막지 않는다 — 지도 마커만 빠진다
  '조건문 없음': { kind: 'hidden' }, // 둘째 줄의 `동반 조건 문장이 없어요` 가 같은 말을 한다
  'AI 판단 없음': { kind: 'hidden' }, // 뒤집어서 `AI 분석 완료` 로 말한다(카드 쪽)
  중복표시: { kind: 'hidden' }, // 같은 묶음 안에 이미 들어와 `블로그 글 N건` 이 센다
  '짝 없음': { kind: 'hidden' }, // 구간 뱃지가 `새 장소로` 로 말한다
};

/**
 * 보간 표식은 어떤 Record 키와도 같을 수 없다 — `AI≠정규식(실내 ${facts.indoor}/${regex.indoor})`
 * (reviewCandidates.mjs:82). **접두어**로 잡는다. 값은 영어 enum(`free`·`cage`·`outdoorOnly`)이라 라벨에 싣지 않는다.
 */
const PREFIX_RULES: readonly (readonly [string, TRule])[] = [
  ['AI≠정규식', { kind: 'badge', label: '실내 조건 엇갈림', tone: 'warning', rank: 2 }],
];

/** 모르는 표식. 회색으로 두면 새 표식이 조용히 묻힌다 — 원문을 그대로, 보이게. */
const unknownRule = (flag: string): TRule => ({ kind: 'badge', label: flag, tone: 'warning', rank: 3 });

const ruleFor = (flag: string): TRule =>
  RULES[flag] ?? PREFIX_RULES.find(([prefix]) => flag.startsWith(prefix))?.[1] ?? unknownRule(flag);

export function adminFlagView(flags: string[]): TAdminFlagView {
  const badges: (TFlagBadge & { rank: number })[] = [];
  const notes: string[] = [];
  for (const flag of flags) {
    const rule = ruleFor(flag);
    if (rule.kind === 'hidden') continue;
    if (rule.kind === 'note') {
      notes.push(rule.note);
      continue;
    }
    badges.push({ key: flag, label: rule.label, tone: rule.tone, rank: rule.rank });
  }
  badges.sort((a, b) => a.rank - b.rank);
  return { badges: badges.map(({ key, label, tone }) => ({ key, label, tone })), notes };
}

/**
 * AI 가 이 후보의 동반 조건을 **실제로 읽어냈는가.** `facts` 객체의 유무로는 부족하다 — 빈 객체거나 뱃지가 안 되는
 * 값만 든 경우(`factsLine` 이 `FACTS_EMPTY` 를 내는 경우)에도 truthy 라, 그것만 보면 펼친 상세가
 * `AI 가 읽은 조건이 없어요` 라고 하는 카드에 초록 `AI 분석 완료` 가 붙어 서로를 반박한다.
 */
export function aiAnalyzed(preview: TPolicyPreview): boolean {
  const read = factsLine(preview.facts);
  return Boolean(read) && read !== FACTS_EMPTY;
}

/**
 * 동반 조건 한 칸. **읽어낸 조건은 목록이고, 못 읽은 것은 문장이다** — 두 갈래를 한 문자열로 합치지 않는다.
 *
 * 예전에는 `조건 [야외만 · 리드줄]` 한 줄이었다. 대괄호가 사실 두 일을 하고 있었다: 조건이라고 말하는 일과,
 * 그 뒤에 이어 붙는 한마디(`view.notes` 의 `지도에 안 보여요`)와 **경계를 긋는** 일. 대괄호만 빼면
 * `야외만 · 리드줄 · 지도에 안 보여요` 가 되어 지도 얘기가 동반 조건의 하나로 읽힌다. 그래서 낱개로 돌려주고
 * 그리는 쪽이 조건은 칩, 한마디는 흐린 글자로 **모양으로** 가른다(`adminPageGroupCard`).
 *
 * `level` 을 쓰지 않는 이유: `level === '정보없음'` 은 원문이 "정보 없음" 이라 적힌 경우에도 켜지므로
 * (`petPolicy.ts:148` 의 `/정보\s*없음/`) "문장이 없어요" 라고 적으면 새 거짓말이 된다. **원문 유무**로만 가른다.
 */
export type TPolicyCell = {
  /** 사이트에 그대로 보일 동반 조건 낱개. 비어 있으면 `message` 가 왜 비었는지 말한다. */
  items: string[];
  /** 읽어낸 것이 없을 때의 한 문장. `items` 가 있으면 null — 둘이 동시에 차는 일은 없다. */
  message: string | null;
};

export function policyCell(preview: TPolicyPreview, petPolicyText: string | null | undefined): TPolicyCell {
  if (!petPolicyText?.trim()) return { items: [], message: '동반 조건 문장이 없어요' };
  if (preview.mergedBadges.length) return { items: preview.mergedBadges, message: null };
  /*
   * **뱃지 0개가 곧 "못 읽었다" 는 아니다.** `toPetBadges` 는 `largeDogOk === false` · `feeFree === false` 에
   * 아무 뱃지도 만들지 않는다(`petPolicy.ts:399-401·392-396` 의 갈래를 전부 통과한다). 그래서 AI 가
   * '대형견 불가' 를 제대로 읽어낸 후보도 여기로 떨어지는데, 그때 '못 읽었어요' 라고 적으면 같은 카드의
   * `AI 분석 완료` 뱃지·펼친 `AI 가 읽은 것: 대형견 불가` 와 **서로를 반박한다.**
   * 뱃지가 안 나오는 것 자체는 판정 쪽 문제라 여기서 고치지 않는다(→ docs/todo/06 「열린 것」 A-2).
   */
  if (aiAnalyzed(preview)) return { items: [], message: 'AI 는 읽었는데 사이트에 안 나와요' };
  return { items: [], message: '동반 조건을 못 읽었어요' };
}

/**
 * 같은 값을 한 줄로 — 펼친 상세의 '사이트에 보일 동반 조건' 처럼 **뒤에 아무것도 붙지 않는** 자리에서만 쓴다.
 * 구분자가 ` · ` 인 이유: 조건 하나가 요금 원문일 수 있어(`feeText`) 쉼표가 그 문장의 쉼표와 섞인다.
 */
export function policyLine(preview: TPolicyPreview, petPolicyText: string | null | undefined): string {
  const cell = policyCell(preview, petPolicyText);
  return cell.items.length ? cell.items.join(' · ') : (cell.message ?? '');
}
