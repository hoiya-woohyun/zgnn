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

import { factsLine, FACTS_EMPTY, TYPE_LABEL, type TCandidateExtracted, type TPolicyPreview } from './adminCandidates';
import type { TPetBadge } from './petPolicy';

export type TFlagTone = 'gray' | 'warning' | 'error';
export type TFlagBadge = { key: string; label: string; tone: TFlagTone };
/** 뱃지로 그릴 것과, 뱃지에서 강등해 둘째 줄 끝에 붙일 한마디. */
export type TAdminFlagView = { badges: TFlagBadge[]; notes: string[] };

type TRule =
  | { kind: 'badge'; label: string; tone: TFlagTone; rank: number }
  | { kind: 'note'; note: string }
  | { kind: 'hidden' };

/** 키 = reviewCandidates.mjs 가 내는 문자열 그대로. `groupFlags` 5개 + `previewPolicy` 6개. */
const RULES: Record<string, TRule> = {
  '지역 없음': { kind: 'badge', label: '지역 없음', tone: 'error', rank: 0 }, // 승인을 막는다
  '동반불가 문장': { kind: 'badge', label: '동반불가 문장', tone: 'error', rank: 1 },
  // AI 가 원문에 없는 숫자·판단을 냈다 — 사이트는 그것을 빼고 본다. 승인 전에 원문을 한 번 보라는 뜻이라 막지는 않는다.
  'AI 판단 보정': { kind: 'badge', label: 'AI 판단 일부 뺌', tone: 'warning', rank: 3 },
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
  'AI 판단 없음': { kind: 'hidden' }, // 뒤집어서 `분석 완료` 로 말한다(카드 쪽)
  중복표시: { kind: 'hidden' }, // 같은 묶음 안에 이미 들어와 `블로그 글 N건` 이 센다
  '짝 없음': { kind: 'hidden' }, // 구간 뱃지가 `새 장소로` 로 말한다
};

/** 종류 엇갈림 표식의 접두어. `PREFIX_RULES` 와 걸러 보기('경고' 의 종류 엇갈림)가 이 값으로 찾는다. */
export const TYPE_MISMATCH_FLAG = '종류 엇갈림';

/** 카페 쪽 말. 네이버 카테고리(`카페,디저트` · `베이커리` · `브런치카페`)와 소개 문장에 공통으로 나온다. */
const CAFE_WORDS = /카페|디저트|베이커리|커피|찻집|제과/;
/** 식당 쪽 카테고리 말 — **카테고리에서만** 쓴다. 소개 문장의 '맛집'·'고기' 는 "빵 맛집"·"고기 없는 메뉴" 처럼 카페에도 흔하다. */
const RESTAURANT_CATEGORY = /음식점|식당|한식|양식|중식|일식|고기|국수|국밥|횟집|해물|해산물|분식|요리|치킨|피자|버거|라멘|돈가스|덮밥|흑돼지|갈치|고등어/;
/** 식당 쪽 소개 말 — 카테고리가 없을 때만. 좁게 둔다. */
const RESTAURANT_FEATURES = /식당|음식점|밥집/;

/**
 * **종류가 요약·카테고리와 엇갈리는가**(2026-10-04) — 요약은 "브런치 카페" 인데 종류는 식당인 후보가 그대로 승인되면
 * 둘러보기의 종류 칩·지도 색이 틀린다. 프롬프트 쪽 수정은 따로고, 이미 쌓인 후보는 화면이 그때그때 본다(재분석 없이).
 *
 * **카테고리가 있으면 카테고리만** 본다 — 네이버가 업체로 등록한 종류라 요약 문장보다 믿을 만하고, 소개 문장의 "카페 같은 분위기" 를
 * 종류로 읽지 않는다. 카테고리가 없을 때만 소개 문장을 본다. 숙소·기타는 보지 않는다(카페가 딸린 펜션은 흔하다).
 * 판정이 아니라 표식이다 — 어느 쪽이 맞는지는 사람이 원글을 보고 정한다. 표식 문자열은 `종류 엇갈림(식당→카페)` 꼴.
 */
export function typeMismatchFlags(extracted: Pick<TCandidateExtracted, 'type' | 'category' | 'features'>): string[] {
  const category = (extracted.category ?? '').trim();
  const features = (extracted.features ?? '').trim();
  const flag = (to: 'cafe' | 'restaurant') => [`${TYPE_MISMATCH_FLAG}(${TYPE_LABEL[extracted.type]}→${TYPE_LABEL[to]})`];
  if (extracted.type === 'restaurant') {
    if (category) return CAFE_WORDS.test(category) ? flag('cafe') : [];
    return CAFE_WORDS.test(features) && !RESTAURANT_FEATURES.test(features) ? flag('cafe') : [];
  }
  if (extracted.type === 'cafe') {
    if (category) return RESTAURANT_CATEGORY.test(category) && !CAFE_WORDS.test(category) ? flag('restaurant') : [];
    return RESTAURANT_FEATURES.test(features) && !CAFE_WORDS.test(features) ? flag('restaurant') : [];
  }
  return [];
}

/**
 * 보간 표식은 어떤 Record 키와도 같을 수 없다 — `AI≠정규식(실내 ${facts.indoor}/${regex.indoor})`
 * (reviewCandidates.mjs:82). **접두어**로 잡는다. 값은 영어 enum(`free`·`cage`·`outdoorOnly`)이라 라벨에 싣지 않는다.
 */
const PREFIX_RULES: readonly (readonly [string, TRule])[] = [
  ['AI≠정규식', { kind: 'badge', label: '실내 조건 엇갈림', tone: 'warning', rank: 2 }],
  // `typeMismatchFlags` 가 낸다(이 파일). 화살표 뒤는 라벨에 싣지 않는다 — 어느 쪽인지는 종류 칩과 펼친 상세가 말한다.
  [TYPE_MISMATCH_FLAG, { kind: 'badge', label: '종류 엇갈림', tone: 'warning', rank: 2 }],
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
 * `AI 가 읽은 조건이 없어요` 라고 하는 카드에 초록 `분석 완료` 가 붙어 서로를 반박한다.
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
 * (`petPolicy.ts` 의 `FLAG_RULES` 중 `/정보\s*없음/`) "문장이 없어요" 라고 적으면 새 거짓말이 된다. **원문 유무**로만 가른다.
 */
export type TPolicyCell = {
  /**
   * 사이트에 그대로 보일 동반 정보 낱개. 비어 있으면 `message` 가 왜 비었는지 말한다.
   *
   * **순서는 여기서 정하지 않는다** — `toPetBadges`(`petPolicy.ts`) 하나가 정하고 그것이 곧 사이트의 순서다.
   * 여기서 다시 정렬하면 검수 화면과 사이트가 같은 장소를 다른 순서로 말하고, 펼친 상세의
   * '사이트에 보일 동반 조건' 줄이 사이트에 없는 순서를 보여 준다. 그 함수의 순서는 이미 고정이다:
   * 동반 불가 → 실내 → 요금 → 크기 → 무게 → 마릿수 → 리드줄 → 확인 필요.
   */
  items: TPetBadge[];
  /** 읽어낸 것이 없을 때의 한 문장. `items` 가 있으면 null — 둘이 동시에 차는 일은 없다. */
  message: string | null;
  /**
   * 어느 갈래인가. 표의 좁은 칸은 긴 문장 대신 **상태마다 다른 짧은 단어**를 그린다 — `문장이 없어요` 와 `못 읽었어요` 가
   * 같은 회색 글씨로 서 있던 동안 둘이 한 상태처럼 읽혔는데, 앞의 것은 정상이고 뒤의 것은 볼 일이다(`POLICY_STATE_WORD`).
   */
  state: 'items' | 'noText' | 'noLimit' | 'aiHidden' | 'unread';
};

/** 표의 동반 조건 칸에 서는 짧은 단어. 긴 문장(`message`)은 펼친 상세가 쓴다. */
export const POLICY_STATE_WORD: Record<Exclude<TPolicyCell['state'], 'items'>, string> = {
  noText: '문장 없음',
  noLimit: '조건 미기재',
  aiHidden: '읽었지만 안 나감',
  unread: '못 읽음',
};

export function policyCell(preview: TPolicyPreview, petPolicyText: string | null | undefined): TPolicyCell {
  if (!petPolicyText?.trim()) return { items: [], message: '동반 조건 문장이 없어요', state: 'noText' };
  if (preview.mergedBadgeList.length) return { items: preview.mergedBadgeList, message: null, state: 'items' };
  /*
   * **뱃지 0개가 곧 "못 읽었다" 는 아니다.** `toPetBadges` 는 `largeDogOk === false` · `feeFree === false` 에
   * 아무 뱃지도 만들지 않는다(`toPetBadges` 의 크기·요금 갈래를 전부 통과한다). 그래서 AI 가
   * '대형견 불가' 를 제대로 읽어낸 후보도 여기로 떨어지는데, 그때 '못 읽었어요' 라고 적으면 같은 카드의
   * `분석 완료` 뱃지·펼친 `AI 가 읽은 것: 대형견 불가` 와 **서로를 반박한다.**
   * 2026-09-30 부터 그 두 값은 배지('대형견 불가'·'추가요금 있음')가 되고, 아무것도 못 읽은 원문은 '원문 확인 필요' 배지가 붙어(BUG-009)
   * 이 갈래는 거의 닿지 않는다. 지우지 않는 이유: 새 판단 필드가 배지 없이 더해지면 여기가 다시 그 사실을 말해 준다.
   */
  if (aiAnalyzed(preview)) return { items: [], message: 'AI 는 읽었는데 사이트에 안 나와요', state: 'aiHidden' };
  /*
   * 원문이 "강아지 동반이 가능합니다" 한 줄인 경우(2026-09-30 실측 4건). 파서는 이것을 **못 읽은 게 아니라** 조건 없는
   * 동반 가능으로 읽고(`unread: false` · level `자유`), 사이트는 칩 없이 내보낸다. 여기서 '못 읽었어요' 라고 하면
   * 운영자는 원문에 뭔가 더 있는 줄 알고 찾으러 가고, 정말 못 읽은 원문(`원문 확인 필요` 배지)과도 구별되지 않는다.
   * 그래서 사이트에 나갈 결과를 그대로 말한다 — 원문에 조건이 더 있었다면 사람이 여기서 알아챈다.
   *
   * 라벨이 `제한 없음` 이던 동안(~2026-10-04) 운영자에게 "다 된다" 로 읽혔다. 실제 뜻은 "글에 제한이 **안 적혀 있다**" 이고,
   * 이 상태로 승인하면 사이트는 소·중형견을 조건 없이 '갈 수 있어요' 로 내보낸다 — 승인 전에 원문을 한 번 볼 자리라
   * `조건 미기재` 로 낮추고 칸도 경고 톤으로 그린다(`adminPageGroupCard` 의 `PolicyCell`). 판정 자체(`eligibility.ts`)는 그대로다.
   */
  if (preview.level === '자유') {
    return { items: [], message: "글에 조건이 안 적혀 있어요 — 승인하면 사이트엔 조건 없이('갈 수 있어요') 나가요", state: 'noLimit' };
  }
  return { items: [], message: '동반 조건을 못 읽었어요', state: 'unread' };
}

/**
 * 같은 값을 한 줄로 — 펼친 상세의 '사이트에 보일 동반 조건' 처럼 **뒤에 아무것도 붙지 않는** 자리에서만 쓴다.
 * 구분자가 ` · ` 인 이유: 조건 하나가 요금 원문일 수 있어(`feeLines`) 쉼표가 그 문장의 쉼표와 섞인다.
 */
export function policyLine(preview: TPolicyPreview, petPolicyText: string | null | undefined): string {
  const cell = policyCell(preview, petPolicyText);
  return cell.items.length ? cell.items.map((item) => item.label).join(' · ') : (cell.message ?? '');
}

/**
 * 같은 배지 목록을 표의 **세 칸**으로 가른다(2026-09-30). 한 칸이던 동안 `야외만 · 1마리당 3만원 · ~10kg · 리드줄` 이
 * 한 줄에 서서, 운영자가 찾는 두 가지(얼마 드나 · 무엇을 챙기나)를 나머지 조건에서 눈으로 골라내야 했다.
 *
 * **가르는 것은 라벨이 아니라 축(`badge.axis`)이다** — 요금 배지의 라벨은 원문 문장 그 자체라 문자열로는 못 가른다.
 * 새 배지가 `toPetBadges` 에 생기면 축을 달아야 하고(타입이 강제한다), 축이 요금·장비가 아니면 자동으로 `condition` 에 선다.
 *
 * `message`(못 읽었다는 한 문장)는 **동반 조건 칸에만** 둔다. 세 칸에 같이 두면 한 줄이 같은 말을 세 번 한다.
 * 그 문장의 조건은 여기서 다시 정하지 않는다 — `policyCell` 의 판단(전체 배지 수 기준)을 그대로 받는다.
 * 그래서 요금 배지만 있는 후보는 동반 조건 칸이 **빈 칸**이 된다(못 읽은 것이 아니므로 문장도 안 뜬다).
 */
export type TPolicySplit = {
  /** 요금·장비를 뺀 나머지 — 동반 불가 · 실내 · 크기 · 무게 · 마릿수 · 확인 필요. */
  condition: TPetBadge[];
  fee: TPetBadge[];
  /** 챙겨 갈 것 — 케이지(이동가방·유모차) · 리드줄. */
  gear: TPetBadge[];
  /** 동반 조건 칸에만 뜨는 한 문장. 읽어낸 것이 하나라도 있으면 null. */
  message: string | null;
};

export function policySplit(preview: TPolicyPreview, petPolicyText: string | null | undefined): TPolicySplit {
  const cell = policyCell(preview, petPolicyText);
  const axis = (want: TPetBadge['axis']) => cell.items.filter((item) => item.axis === want);
  return {
    condition: cell.items.filter((item) => item.axis !== 'fee' && item.axis !== 'gear'),
    fee: axis('fee'),
    gear: axis('gear'),
    message: cell.message,
  };
}
