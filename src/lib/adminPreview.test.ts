/**
 * 표식 매핑이 **전수**인지 지키는 테스트.
 *
 * 이 파일이 막는 것은 하나다 — `reviewCandidates.mjs` 가 내는 표식 중 하나라도 표에서 빠지면 화면이 조용히
 * 원문(`AI≠정규식(실내 free/cage)` 같은 내부 문자열)을 그대로 뱉는다. 옛 `FLAG_COLOR` 가 정확히 그 상태였고,
 * 빌드도 테스트도 초록이었다. 그래서 여기서 **모르는 표식이 회색이 아님**까지 단정한다 — 회색이면 새 표식이 묻힌다.
 */

import { describe, expect, it } from 'vitest';
import { adminFlagView, policyCell, policyLine, policySplit, POLICY_STATE_WORD, typeMismatchFlags } from './adminPreview';
import { previewFor, type TCandidateExtracted, type TPolicyPreview } from './adminCandidates';
import type { TPetBadge } from './petPolicy';

const NO_LIMIT_MESSAGE = "글에 조건이 안 적혀 있어요 — 등록하면 사이트엔 '확인이 필요해요' 로 나가요(조건을 확인한 뒤 확인 날짜를 찍으면 '갈 수 있어요')";

/**
 * `mergedBadges`(라벨)와 `mergedBadgeList`(라벨+톤)는 실제로는 `toPetBadges` 한 번에서 함께 나온다
 * (`reviewCandidates.mjs` 의 `previewPolicy`). 테스트에서도 **한 벌로** 둔다 — 따로 적으면 둘이 어긋난
 * preview 로 단정하게 되고, 그 어긋남은 제품에서 일어날 수 없는 상태다.
 */
const preview = (over: Partial<TPolicyPreview> = {}): TPolicyPreview => {
  const mergedBadges = over.mergedBadges ?? ['야외만'];
  return {
    regexBadges: [],
    facts: null,
    corrections: [],
    dropped: [],
    flags: [],
    level: '조건',
    ...over,
    mergedBadges,
    mergedBadgeList: over.mergedBadgeList ?? mergedBadges.map((label) => ({ label, tone: 'cond' as const, axis: 'indoor' as const })),
  };
};

/** 낱개는 이제 톤까지 들고 있다. 문장 갈래를 단정하는 자리에서는 라벨만 보면 된다. */
const labelsOf = (cell: ReturnType<typeof policyCell>) => ({
  items: cell.items.map((item) => item.label),
  message: cell.message,
});

describe('adminFlagView — 표식 전수', () => {
  /** `groupFlags`(mjs:91-95) 5개 + `previewPolicy`(mjs:79-83) 5개. 보간형은 접두어로 잡힌다. */
  it.each([
    ['지역 없음', '지역 없음', 'error'],
    ['동반불가 문장', '동반불가 문장', 'error'],
    ['AI≠정규식(실내 outdoorOnly/cage)', '실내 조건 엇갈림', 'warning'],
    ['AI≠정규식(실내 free/cage)', '실내 조건 엇갈림', 'warning'],
    ['목록글', '목록글', 'gray'],
  ])('%s → 뱃지 "%s"(%s)', (flag, label, tone) => {
    const view = adminFlagView([flag]);
    expect(view.badges).toEqual([{ key: flag, label, tone }]);
    expect(view.notes).toEqual([]);
  });

  it("'좌표 없음' 은 뱃지가 아니라 둘째 줄의 한마디다 — 승인을 막지 않고 지도에만 안 나온다", () => {
    expect(adminFlagView(['좌표 없음'])).toEqual({ badges: [], notes: ['지도에 안 보여요'] });
  });

  it.each(['조건문 없음', 'AI 판단 없음', '중복표시', '짝 없음', '정규식 못읽음'])(
    '%s 은 화면에서 감춘다(다른 자리가 같은 말을 한다)',
    (flag) => {
      expect(adminFlagView([flag])).toEqual({ badges: [], notes: [] });
    },
  );

  it('모르는 표식은 원문 그대로, 그러나 **회색이 아니게** 보인다', () => {
    const view = adminFlagView(['아직 없는 표식']);
    expect(view.badges).toEqual([{ key: '아직 없는 표식', label: '아직 없는 표식', tone: 'warning' }]);
    expect(view.badges[0].tone).not.toBe('gray');
  });

  it('승인을 막는 것이 앞, 참고가 뒤 — 들어온 순서와 무관하게 자리가 정해진다', () => {
    const view = adminFlagView(['목록글', '동반불가 문장', '좌표 없음', '지역 없음']);
    expect(view.badges.map((badge) => badge.label)).toEqual(['지역 없음', '동반불가 문장', '목록글']);
    expect(view.notes).toEqual(['지도에 안 보여요']);
  });

  it('두 함수가 낼 수 있는 표식 전부를 넣으면 감춘 넷만 사라진다', () => {
    const all = [
      '지역 없음',
      '좌표 없음',
      '목록글',
      '중복표시',
      '짝 없음',
      '조건문 없음',
      '정규식 못읽음',
      'AI 판단 없음',
      'AI≠정규식(실내 free/cage)',
      '동반불가 문장',
    ];
    const view = adminFlagView(all);
    expect(view.badges.length + view.notes.length).toBe(all.length - 5);
  });
});

describe('policyCell — 네 갈래', () => {
  it.each([null, undefined, '', '   '])('조건 원문이 %o 면 문장으로 말한다', (text) => {
    expect(labelsOf(policyCell(preview(), text))).toEqual({ items: [], message: '동반 조건 문장이 없어요' });
  });

  /**
   * 낱개로 돌려주는 것이 요점이다 — 한 문자열로 합치면 그리는 쪽이 뒤에 붙는 한마디(`view.notes`)와
   * 경계를 그을 수 없다. 옛 `조건 [...]` 의 대괄호가 하던 두 번째 일이 이것이었다.
   */
  it('읽어낸 조건은 낱개로 — 대괄호도, 미리 이어 붙인 문자열도 아니다', () => {
    expect(labelsOf(policyCell(preview({ mergedBadges: ['야외만', '리드줄'] }), '야외석만 가능해요'))).toEqual({
      items: ['야외만', '리드줄'],
      message: null,
    });
  });

  it('문장은 있는데 아무도 못 읽었으면 그렇게 말한다 — 옛 화면은 이것을 "자유" 라고 불렀다', () => {
    expect(labelsOf(policyCell(preview({ mergedBadges: [], facts: null, level: '못읽음' }), '대충 알아서 오세요'))).toEqual({
      items: [],
      message: '동반 조건을 못 읽었어요',
    });
  });

  /**
   * "강아지 동반이 가능합니다" 한 줄 — 파서는 이것을 **읽은 것**으로 본다(`petPolicy.ts` 의 `isGenericAllowance`, level `자유`).
   * '못 읽었어요' 라고 하면 원문에 뭔가 더 있는 줄 알고 찾으러 가게 되고, 정말 못 읽은 원문과 구별되지 않는다(2026-09-30 실측 4건).
   */
  it('실제 파서를 거쳐도 — "강아지 동반이 가능합니다" 는 조건 미기재, 제한을 암시하면 원문 확인 필요', () => {
    const cellOf = (text: string) => {
      const extracted = { name: '제주삼춘', type: 'restaurant', petPolicyText: text, petPolicy: null } as unknown as TCandidateExtracted;
      return labelsOf(policyCell(previewFor(extracted), text));
    };
    expect(cellOf('강아지 동반이 가능합니다')).toEqual({ items: [], message: NO_LIMIT_MESSAGE });
    expect(cellOf('테라스에서만 동반 가능해요').message).not.toBe(NO_LIMIT_MESSAGE);
  });

  it('라벨은 "다 된다" 로 읽히지 않게 조건 미기재 — 승인하면 조건 없이 나간다는 것을 문장이 말한다(2026-10-04)', () => {
    expect(POLICY_STATE_WORD.noLimit).toBe('조건 미기재');
    expect(policyCell(preview({ mergedBadges: [], facts: null, level: '자유' }), '강아지 동반이 가능합니다').state).toBe('noLimit');
  });

  it('일반 허용 문장뿐이면 못 읽었다가 아니라 조건 없이 나간다고 말한다', () => {
    expect(labelsOf(policyCell(preview({ mergedBadges: [], facts: null, level: '자유' }), '강아지 동반이 가능합니다'))).toEqual({
      items: [],
      message: NO_LIMIT_MESSAGE,
    });
  });

  /**
   * 뱃지 0개가 곧 "못 읽었다" 는 아니다 — `toPetBadges` 가 `largeDogOk === false` 에 뱃지를 안 만든다.
   * 이 갈래가 없으면 한 카드가 `분석 완료` · `동반 조건을 못 읽었어요` · `AI 가 읽은 것: 대형견 불가` 를 동시에 말한다.
   */
  it('AI 는 읽었는데 뱃지가 안 되는 값이면 못 읽었다고 하지 않는다', () => {
    const facts = { largeDogOk: false } as TPolicyPreview['facts'];
    expect(labelsOf(policyCell(preview({ mergedBadges: [], facts }), '대형견은 어려워요'))).toEqual({
      items: [],
      message: 'AI 는 읽었는데 사이트에 안 나와요',
    });
  });

  it('판단 객체는 있는데 조각이 0개면 그건 정말 못 읽은 것이다', () => {
    const facts = {} as TPolicyPreview['facts'];
    expect(labelsOf(policyCell(preview({ mergedBadges: [], facts }), '애견동반 가능해요!'))).toEqual({
      items: [],
      message: '동반 조건을 못 읽었어요',
    });
  });

  /**
   * 톤이 낱개에 실려 오는 것이 요점이다. 라벨 문자열로 톤을 되찾는 표를 만들면 요금 문장
   * (`1마리당 2만원`)처럼 값 자체가 라벨인 것에서 반드시 틀리고, 그때 조용히 회색이 된다.
   */
  it('낱개는 톤까지 들고 온다 — 화면이 라벨로 톤을 되찾지 않게', () => {
    const list = [
      { label: '동반 불가', tone: 'warn' as const, axis: 'notAllowed' as const },
      { label: '리드줄', tone: 'cond' as const, axis: 'gear' as const },
    ];
    expect(policyCell(preview({ mergedBadges: list.map((b) => b.label), mergedBadgeList: list }), '안 돼요').items).toEqual(
      list,
    );
  });

  it("원문이 '정보 없음' 이어도 문장은 있는 것이다 — level 이 아니라 원문 유무로 가르는 이유", () => {
    expect(labelsOf(policyCell(preview({ mergedBadges: ['확인된 정보 없음'], level: '정보없음' }), '정보 없음.'))).toEqual({
      items: ['확인된 정보 없음'],
      message: null,
    });
  });
});

describe('policyLine — 한 줄이 필요한 자리(펼친 상세)', () => {
  it('낱개를 가운뎃점으로 잇는다 — 쉼표가 아닌 이유는 요금 원문에 쉼표가 있어서다', () => {
    expect(policyLine(preview({ mergedBadges: ['야외만', '리드줄'] }), '야외석만 가능해요')).toBe('야외만 · 리드줄');
  });

  it('읽어낸 것이 없으면 문장을 그대로 — 빈 문자열로 새지 않는다', () => {
    expect(policyLine(preview(), null)).toBe('동반 조건 문장이 없어요');
  });
});

/**
 * 표가 한 칸에서 세 칸으로 갈렸다(2026-09-30). 여기서 지키는 것은 **전수성**이다 — 축이 하나 더 생기면
 * 그 배지는 어느 칸에도 안 서고 화면에서 조용히 사라질 수 있다. `condition` 이 "요금·장비가 아닌 전부" 로
 * 정의돼 있어 그런 일은 없어야 하고, 이 테스트가 그 정의를 붙잡는다.
 */
describe('policySplit — 세 칸으로 가르기', () => {
  const list = [
    { label: '동반 불가', tone: 'warn' as const, axis: 'notAllowed' as const },
    { label: '야외만', tone: 'cond' as const, axis: 'indoor' as const },
    { label: '1마리당 3만원', tone: 'cond' as const, axis: 'fee' as const },
    { label: '청소비 5만원', tone: 'cond' as const, axis: 'fee' as const },
    { label: '~10kg', tone: 'cond' as const, axis: 'limit' as const },
    { label: '케이지 필요', tone: 'cond' as const, axis: 'gear' as const },
    { label: '리드줄', tone: 'cond' as const, axis: 'gear' as const },
  ];
  const split = () => policySplit(preview({ mergedBadges: list.map((b) => b.label), mergedBadgeList: list }), '조건 원문');

  it('요금은 요금 칸에, 장비는 장비 칸에, 나머지는 동반 조건 칸에', () => {
    const cell = split();
    expect(cell.condition.map((b) => b.label)).toEqual(['동반 불가', '야외만', '~10kg']);
    expect(cell.fee.map((b) => b.label)).toEqual(['1마리당 3만원', '청소비 5만원']);
    expect(cell.gear.map((b) => b.label)).toEqual(['케이지 필요', '리드줄']);
  });

  it('배지를 하나도 잃지 않는다 — 세 칸의 합이 곧 사이트가 보여 줄 전부다', () => {
    const cell = split();
    // 칸으로 모이니 순서는 달라진다(칸 **안**의 순서만 사이트와 같다) — 여기서 보는 것은 "빠진 것이 없나" 다.
    const labels = (badges: TPetBadge[]) => badges.map((b) => b.label).sort();
    expect(labels([...cell.condition, ...cell.fee, ...cell.gear])).toEqual(labels(list));
  });

  /** 요금만 읽은 후보는 **동반 조건 칸이 빈 칸**이다. 여기에 '못 읽었어요' 가 뜨면 옆 칸의 요금과 서로를 반박한다. */
  it('요금만 있으면 동반 조건 칸은 비고, 못 읽었다는 말은 안 한다', () => {
    const only = [{ label: '1마리당 3만원', tone: 'cond' as const, axis: 'fee' as const }];
    const cell = policySplit(preview({ mergedBadges: ['1마리당 3만원'], mergedBadgeList: only }), '1마리당 3만원');
    expect(cell.condition).toEqual([]);
    expect(cell.message).toBeNull();
  });

  /** 반대로 정말 아무것도 못 읽었으면 그 문장은 **동반 조건 칸에만** 뜬다 — 세 칸이 같은 말을 세 번 하지 않게. */
  it('못 읽은 후보의 문장은 한 칸에만 실린다', () => {
    const cell = policySplit(preview({ mergedBadges: [], mergedBadgeList: [], facts: null }), '애견동반 가능해요!');
    expect(cell.message).toBe('동반 조건을 못 읽었어요');
    expect([cell.condition, cell.fee, cell.gear]).toEqual([[], [], []]);
  });
});

describe('typeMismatchFlags — 종류가 카테고리·요약과 엇갈린다(2026-10-04)', () => {
  const x = (type: TCandidateExtracted['type'], category: string | null, features: string | null = null) => ({ type, category, features });

  it('요약이 "브런치 카페" 인데 종류가 식당이면 표식 — 카테고리가 없을 때는 소개 문장을 본다', () => {
    expect(typeMismatchFlags(x('restaurant', null, '바다 앞 브런치 카페예요'))).toEqual(['종류 엇갈림(식당→카페)']);
    expect(adminFlagView(typeMismatchFlags(x('restaurant', null, '바다 앞 브런치 카페예요'))).badges).toEqual([
      { key: '종류 엇갈림(식당→카페)', label: '종류 엇갈림', tone: 'warning' },
    ]);
  });

  it('카테고리가 있으면 카테고리만 본다 — 소개의 "카페 같은 분위기" 를 종류로 읽지 않는다', () => {
    expect(typeMismatchFlags(x('restaurant', '카페,디저트'))).toEqual(['종류 엇갈림(식당→카페)']);
    expect(typeMismatchFlags(x('restaurant', '베이커리'))).toEqual(['종류 엇갈림(식당→카페)']);
    expect(typeMismatchFlags(x('restaurant', '돼지고기구이', '카페 같은 분위기의 고깃집'))).toEqual([]);
    expect(typeMismatchFlags(x('cafe', '카페,디저트', '식당 옆 카페'))).toEqual([]);
  });

  it('반대도 — 카페인데 카테고리가 식당 쪽이면 표식', () => {
    expect(typeMismatchFlags(x('cafe', '국수'))).toEqual(['종류 엇갈림(카페→식당)']);
    expect(typeMismatchFlags(x('cafe', '한식'))).toEqual(['종류 엇갈림(카페→식당)']);
    expect(typeMismatchFlags(x('cafe', null, '동네 식당이에요'))).toEqual(['종류 엇갈림(카페→식당)']);
    expect(typeMismatchFlags(x('cafe', null, '빵 맛집 카페'))).toEqual([]);
  });

  it('숙소·기타는 보지 않는다 — 카페가 딸린 펜션은 흔하다', () => {
    expect(typeMismatchFlags(x('stay', '카페'))).toEqual([]);
    expect(typeMismatchFlags(x('other', null, '카페'))).toEqual([]);
  });
});
