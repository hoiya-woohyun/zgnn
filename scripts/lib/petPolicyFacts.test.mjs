import { describe, expect, it } from 'vitest';
import { normalizeFeeLines } from './feeLine.mjs';
import { correctPetPolicyFacts, weekdaysIn, weekdaysOrNull } from './petPolicyFacts.mjs';

/** 모델이 아무것도 안 읽은 판단. 각 테스트가 필요한 칸만 덮어쓴다. */
const empty = {
  indoor: 'unknown',
  leash: false,
  largeDogOk: null,
  smallDogOnly: false,
  callFirst: false,
  feeFree: null,
  feeText: null,
  weightLimitKg: null,
  maxDogs: null,
  notes: null,
};
const facts = (over) => ({ ...empty, ...over });

describe('correctPetPolicyFacts — 원문에 근거가 있는 판단은 그대로 둔다', () => {
  it('실제 블로그 문장에서 뽑은 판단은 한 칸도 안 바뀐다', () => {
    const text = '10kg 이하 소형견만 2마리까지 가능해요.\n실내는 이동가방 필수, 리드줄 착용해 주세요.\n1마리당 2만원 추가';
    const f = facts({ indoor: 'cage', leash: true, smallDogOnly: true, weightLimitKg: 10, maxDogs: 2, feeLines: ['1마리당 2만원 추가'], feeFree: false });
    const r = correctPetPolicyFacts(f, text);
    expect(r.corrections).toEqual([]);
    expect(r.facts).toEqual(f);
  });

  /*
   * 요금은 **줄마다 따로** 대 본다. 한 덩어리로 보면 근거 있는 줄 하나가 지어낸 줄을 통과시키고,
   * 반대로 지어낸 줄 하나가 옳은 구간표를 통째로 지운다 — 구간 요금표가 흔하므로 둘 다 실제로 일어난다.
   */
  it('요금 줄이 여럿이면 근거 없는 줄만 뺀다', () => {
    const r = correctPetPolicyFacts(facts({ feeLines: ['1~5kg 1만원', '6~10kg 1.5만원', '청소비 7만원'] }), '1~5kg 1만원, 6~10kg 1.5만원');
    expect(r.facts?.feeLines).toEqual(['1~5kg 1만원', '6~10kg 1.5만원']);
    expect(r.corrections).toEqual(['요금 문장 "청소비 7만원" 이 원문에 없어 뺐어요']);
  });

  /*
   * 줄이 짧아지면 숫자 조각 대 보기가 **통과 도장**이 된다 — `청소비 5만원` 의 `5` 는 `15만원` 안에도 있다.
   * 그래서 금액 토큰(`5만원`)을 찾고 앞에 숫자가 붙지 않은 자리만 인정한다(`mentionsKg` 가 `100kg` 을 막는 어법).
   */
  it('금액이 원문의 더 큰 금액 안에만 있으면 근거로 보지 않는다', () => {
    const r = correctPetPolicyFacts(facts({ feeLines: ['청소비 5만원'] }), '1박 15만원부터예요');
    expect(r.facts?.feeLines).toEqual([]);
    expect(r.corrections).toEqual(['요금 문장 "청소비 5만원" 이 원문에 없어 뺐어요']);
  });

  it('같은 금액이 그대로 있으면 남는다', () => {
    const r = correctPetPolicyFacts(facts({ feeLines: ['청소비 5만원'] }), '숙박일 관계없이 청소비 5만원 추가');
    expect(r.facts?.feeLines).toEqual(['청소비 5만원']);
  });

  /*
   * **금액 표기를 모델이 바꾸면 그 줄을 잃는다.** 근거 확인이 숫자 문자열을 대 보므로 "15,000원" → "1.5만원" 은
   * 원문에 `1.5` 가 없어 통째로 빠진다. 프롬프트가 "금액은 본문 표기 그대로" 라고 못 박는 이유가 이것이고,
   * 이 테스트는 그 규칙이 프롬프트에서 빠졌을 때 무슨 일이 나는지를 고정해 둔다(고칠 곳은 보정이 아니라 프롬프트다).
   */
  /*
   * 2026-09-30 에 뒤집혔다 — 예전엔 표기가 다르면 뺐다. 이제 요금 줄은 저장 전에 `normalizeFeeLines` 가 `15,000원` 을
   * `1.5만원` 으로 바꾸고 앱이 이 대조를 다시 돌리므로, 글자로 대 보면 방금 바꾼 줄이 사라진다. 금액을 원 단위 숫자로 본다.
   */
  it('금액 표기만 바꾼 줄은 같은 금액이라 남는다', () => {
    const r = correctPetPolicyFacts(facts({ feeLines: ['1.5만원'] }), '반려견 추가 요금은 15,000원이에요');
    expect(r.facts?.feeLines).toEqual(['1.5만원']);
    expect(r.corrections).toEqual([]);
  });

  it('본문 표기 그대로면 쉼표가 있어도 남는다', () => {
    const r = correctPetPolicyFacts(facts({ feeLines: ['1마리당 15,000원'] }), '반려견 추가 요금은 15,000원이에요');
    expect(r.facts?.feeLines).toEqual(['1마리당 15,000원']);
  });

  it('만원 표기로 접은 줄도 같은 금액이라 남는다', () => {
    const r = correctPetPolicyFacts(facts({ feeLines: ['1마리당 3만원'] }), '강아지 1마리당 30,000원 추가입니다');
    expect(r.facts?.feeLines).toEqual(['1마리당 3만원']);
  });

  it('금액이 다르면 여전히 빠진다', () => {
    const r = correctPetPolicyFacts(facts({ feeLines: ['1마리당 3만원'] }), '강아지 1마리당 20,000원 추가입니다');
    expect(r.facts?.feeLines).toEqual([]);
  });

  /** 옛 후보(2026-09-30 이전)는 `feeText` 하나만 들고 있다 — 그 값도 같은 보정을 통과해 새 칸으로 옮겨진다. */
  it('옛 모양(feeText)도 읽어 feeLines 로 옮긴다', () => {
    const r = correctPetPolicyFacts(facts({ feeText: '1마리당 2만원' }), '1마리당 2만원 추가예요');
    expect(r.facts?.feeLines).toEqual(['1마리당 2만원']);
    expect(r.facts?.feeText).toBeNull();
    expect(r.corrections).toEqual([]);
  });

  /** 두 번 불러도 결과가 같아야 한다 — 분석 시점과 앱 런타임이 같은 함수를 각각 부른다(`withPolicyFacts`). */
  it('두 번 불러도 요금 줄이 그대로다', () => {
    const text = '1~5kg 1만원, 6~10kg 1.5만원';
    const once = correctPetPolicyFacts(facts({ feeLines: ['1~5kg 1만원', '없는줄 9만원'] }), text).facts;
    const twice = correctPetPolicyFacts(once, text);
    expect(twice.facts).toEqual(once);
    expect(twice.corrections).toEqual([]);
  });

  it('"두 마리까지" 처럼 한글 수사도 원문 근거로 본다', () => {
    expect(correctPetPolicyFacts(facts({ maxDogs: 2 }), '강아지는 두 마리까지 가능해요').corrections).toEqual([]);
  });

  it('대형견 불가는 원문에 "대형" 이 있으면 남는다', () => {
    const r = correctPetPolicyFacts(facts({ largeDogOk: false }), '대형견은 어려워요');
    expect(r.facts?.largeDogOk).toBe(false);
  });

  it('보정은 두 번 돌려도 같다 — 앱이 이미 보정된 값을 다시 읽어도 새 보정이 없다', () => {
    const once = correctPetPolicyFacts(facts({ weightLimitKg: 10, indoor: 'free' }), '애견동반 가능해요');
    const twice = correctPetPolicyFacts(once.facts, '애견동반 가능해요');
    expect(twice.corrections).toEqual([]);
    expect(twice.facts).toEqual(once.facts);
  });
});

describe('correctPetPolicyFacts — 원문에 없는 판단은 뺀다', () => {
  it('원문에 없는 무게 상한은 뺀다 — 없는 제한이 대형견을 막으면 안 된다', () => {
    const r = correctPetPolicyFacts(facts({ weightLimitKg: 10 }), '소형견 위주로 오는 카페예요');
    expect(r.facts?.weightLimitKg).toBeNull();
    expect(r.corrections).toEqual(['무게 상한 10kg 이 원문에 없어 뺐어요']);
  });

  it('"100kg" 이나 요금 숫자에 10 이 들어 있어도 10kg 의 근거가 아니다', () => {
    expect(correctPetPolicyFacts(facts({ weightLimitKg: 10 }), '100kg 까지 괜찮아요').facts?.weightLimitKg).toBeNull();
    expect(correctPetPolicyFacts(facts({ weightLimitKg: 10 }), '1마리 10,000원').facts?.weightLimitKg).toBeNull();
  });

  it('원문에 없는 마릿수는 뺀다', () => {
    expect(correctPetPolicyFacts(facts({ maxDogs: 2 }), '1마리당 2만원').facts?.maxDogs).toBeNull();
  });

  it('"대형" 이란 말 없이 추론한 대형견 불가는 뺀다 — 무게 상한이 이미 같은 말을 한다', () => {
    const r = correctPetPolicyFacts(facts({ largeDogOk: false, weightLimitKg: 10 }), '10kg 이하만 가능해요');
    expect(r.facts?.largeDogOk).toBeNull();
    expect(r.facts?.weightLimitKg).toBe(10);
  });

  it('근거 단어 없는 실내 판단은 unknown 으로 눕힌다', () => {
    const r = correctPetPolicyFacts(facts({ indoor: 'free' }), '애견동반 가능해요!');
    expect(r.facts?.indoor).toBe('unknown');
  });

  it('원문에 없는 요금 문장은 뺀다', () => {
    const r = correctPetPolicyFacts(facts({ feeText: '1마리당 3만원' }), '추가 요금은 사장님께 여쭤보세요');
    expect(r.facts?.feeText).toBeNull();
  });

  it('원문이 없으면 판단도 없다고 보고 손대지 않는다(normalizePetPolicy 가 null 로 만든다)', () => {
    expect(correctPetPolicyFacts(facts({ weightLimitKg: 10 }), '')).toEqual({ facts: facts({ weightLimitKg: 10 }), corrections: [], dropped: [] });
    expect(correctPetPolicyFacts(null, '10kg 이하')).toEqual({ facts: null, corrections: [], dropped: [] });
  });
});

describe('correctPetPolicyFacts — 모순은 허용 쪽을 뺀다', () => {
  it('소형견만 + 대형견 가능 → 대형견 가능을 뺀다', () => {
    const r = correctPetPolicyFacts(facts({ smallDogOnly: true, largeDogOk: true }), '소형견만 가능. 대형견 문의');
    expect(r.facts?.largeDogOk).toBeNull();
    expect(r.facts?.smallDogOnly).toBe(true);
  });

  it('금액이 있는 요금 문장 + 추가 요금 없음 → 추가 요금 없음을 뺀다', () => {
    const r = correctPetPolicyFacts(facts({ feeFree: true, feeLines: ['1마리당 2만원'] }), '1마리당 2만원, 두 번째부터 무료');
    expect(r.facts?.feeFree).toBeNull();
    expect(r.facts?.feeLines).toEqual(['1마리당 2만원']);
  });

  /** 첫 줄만 보면 "첫 마리 무료, 둘째부터 2만원" 을 놓친다 — 모순은 **어느 줄에서든** 금액을 보면 성립한다. */
  it('금액이 둘째 줄에 있어도 추가 요금 없음을 뺀다', () => {
    const r = correctPetPolicyFacts(facts({ feeFree: true, feeLines: ['첫 마리 무료', '2마리부터 2만원'] }), '첫 마리 무료, 2마리부터 2만원');
    expect(r.facts?.feeFree).toBeNull();
  });
});

describe('correctPetPolicyFacts — 요금 구조(fees)는 줄과 계산 칸을 따로 본다(ADR-017 v5)', () => {
  const rule = (over) => ({ label: '', amountWon: null, basis: 'perDog', minKg: null, maxKg: null, fromDog: null, perNight: false, ...over });
  const text = '19kg 이하 1마리당 20,000원 / 20kg 이상 1마리당 30,000원 / 두 마리부터 청소비 1만원';

  it('원문과 맞는 구조는 그대로 둔다 — 본문 표기(20,000원)와 정규화한 label(2만원)도 금액으로 대 본다', () => {
    const fees = [
      rule({ label: '19kg 이하 1마리당 2만원', amountWon: 20000, maxKg: 19 }),
      rule({ label: '20kg 이상 1마리당 30,000원', amountWon: 30000, minKg: 20 }),
      rule({ label: '2마리부터 청소비 1만원', amountWon: 10000, basis: 'flat', fromDog: 2 }),
    ];
    const r = correctPetPolicyFacts(facts({ fees }), text);
    expect(r.facts.fees).toEqual(fees);
    expect(r.corrections).toEqual([]);
  });

  it('원문에 없는 줄은 통째로 뺀다', () => {
    const r = correctPetPolicyFacts(facts({ fees: [rule({ label: '청소비 5만원', amountWon: 50000, basis: 'flat' })] }), text);
    expect(r.facts.fees).toEqual([]);
  });

  it('줄은 원문에 있어도 계산 칸이 어긋나면 계산에서만 뺀다 — label 은 배지로 남는다', () => {
    const wrongAmount = rule({ label: '19kg 이하 1마리당 2만원', amountWon: 30000, maxKg: 19 });
    const wrongKg = rule({ label: '20kg 이상 1마리당 3만원', amountWon: 30000, minKg: 25 });
    const r = correctPetPolicyFacts(facts({ fees: [wrongAmount, wrongKg] }), text);
    expect(r.facts.fees.map((f) => [f.label, f.amountWon, f.minKg, f.maxKg])).toEqual([
      ['19kg 이하 1마리당 2만원', null, null, null],
      ['20kg 이상 1마리당 3만원', null, null, null],
    ]);
    expect(r.corrections).toHaveLength(2);
  });

  it.each([
    ['청소비인데 마리당', { label: '청소비 5만원', amountWon: 50000, basis: 'perDog' }, '청소비 5만원'],
    ['1박당인데 perNight 없음', { label: '1박당 2만원', amountWon: 20000 }, '1박당 2만원'],
    ['2마리부터인데 fromDog 없음', { label: '2마리부터 1마리당 2만원', amountWon: 20000 }, '두 마리부터 1마리당 2만원'],
  ])('칸이 label 과 다른 말을 하면 계산에서 뺀다 — %s', (_, over, source) => {
    const r = correctPetPolicyFacts(facts({ fees: [rule(over)] }), source);
    expect(r.facts.fees[0].amountWon).toBeNull();
  });

  /** 소노벨 원문 — 둘째 마리라는 말(`2마리`)이 없어도 `기본 1마리` 가 fromDog 2 의 근거다. */
  const extraText = '객실당 기본 1마리 동반할 수 있어요. 한 마리를 추가하면 30,000원의 추가 요금이 발생해요.';

  it('추가 1마리 요금은 기본 마릿수 + 1 부터 — 기본 N마리가 근거다', () => {
    const extra = rule({ label: '추가 1마리 30,000원', amountWon: 30000, fromDog: 2 });
    const r = correctPetPolicyFacts(facts({ fees: [extra] }), extraText);
    expect(r.facts.fees).toEqual([extra]);
    expect(r.corrections).toEqual([]);
  });

  // 마리당 요금("반려견 1마리 추가 시 2만원")은 fromDog 없이도 라벨에 `추가 1마리` 가 나온다 — 거절하지 않는다(한 방향만 넓힌다).
  it('fromDog 가 없는 `1마리 추가 시` 요금은 금액이 유지된다', () => {
    const t = '반려견 1마리 추가 시 20,000원이 부과돼요.';
    const r = correctPetPolicyFacts(facts({ fees: [rule({ label: '반려견 1마리 추가 시 2만원', amountWon: 20000 })] }), t);
    expect(r.facts.fees[0].amountWon).toBe(20000);
  });

  it('`N마리부터` label 인데 fromDog 가 없으면 여전히 계산에서 뺀다', () => {
    const t = '2마리부터 1마리당 20,000원';
    const r = correctPetPolicyFacts(facts({ fees: [rule({ label: '2마리부터 1마리당 2만원', amountWon: 20000 })] }), t);
    expect(r.facts.fees[0].amountWon).toBeNull();
  });

  it('두 번 불러도 결과가 같다', () => {
    const once = correctPetPolicyFacts(facts({ fees: [rule({ label: '1마리당 9만원', amountWon: 90000 })] }), text).facts;
    expect(correctPetPolicyFacts(once, text).facts).toEqual(once);
  });

  it("'방문 전 … 확인' 도 전화 확인의 근거다 — 파서가 읽는 말을 AI 판단에서만 빼지 않는다", () => {
    const r = correctPetPolicyFacts(facts({ callFirst: true }), '운영 방식은 바뀔 수 있으니 방문 전 한 번 확인하고 가세요');
    expect(r.facts.callFirst).toBe(true);
  });

  it('예방접종 필수는 원문에 접종 이야기가 있을 때만 남는다 — 권장인지 필수인지는 모델 몫', () => {
    const kept = correctPetPolicyFacts(facts({ vaccineRequired: true }), '예방접종을 완료한 강아지만 출입 가능해요');
    expect(kept.facts.vaccineRequired).toBe(true);
    expect(kept.corrections).toEqual([]);

    const dropped = correctPetPolicyFacts(facts({ vaccineRequired: true }), '리드줄 착용하면 실내 가능해요');
    expect(dropped.facts.vaccineRequired).toBe(false);
    expect(dropped.corrections).toEqual(['예방접종 필수의 근거가 원문에 없어 뺐어요']);
  });

  it('동반 요일은 원문에 `X요일` 로 있는 것만 남는다 — 없는 요일은 빼고, 다 빠지면 null', () => {
    const text = "매주 수요일에는 '반려동물 동반데이' 입니다";
    const kept = correctPetPolicyFacts(facts({ petDays: ['수'] }), text);
    expect(kept.facts.petDays).toEqual(['수']);
    expect(kept.corrections).toEqual([]);

    const partial = correctPetPolicyFacts(facts({ petDays: ['수', '토'] }), text);
    expect(partial.facts.petDays).toEqual(['수']);
    expect(partial.corrections).toEqual(['동반 요일 토요일이 원문에 없어 뺐어요']);

    const none = correctPetPolicyFacts(facts({ petDays: ['금'] }), text);
    expect(none.facts.petDays).toBeNull();
    // 묶음 표기("수·토요일")의 앞 요일도 원문에 있는 것이다
    expect(correctPetPolicyFacts(facts({ petDays: ['수', '토'] }), '수·토요일에만 동반 가능').facts.petDays).toEqual(['수', '토']);
  });

  it('weekdaysIn · weekdaysOrNull — 읽기와 모양 정리', () => {
    expect(weekdaysIn('수, 토요일과 일요일 / 수요일')).toEqual(['수', '토', '일']);
    expect(weekdaysIn('요일별로 달라요')).toEqual([]);
    expect(weekdaysOrNull(['수', '수', '화요일', 3])).toEqual(['수']);
    expect(weekdaysOrNull([])).toBeNull();
    expect(weekdaysOrNull(undefined)).toBeNull();
  });
});

/**
 * 모델이 맞게 낸 요금·마릿수를 원문 대조가 지우던 것(BUG-018). 2026-10-12 모델 비교(Opus·Sonnet, 같은 프롬프트)의 **원응답 칸 그대로** —
 * 손으로 다듬은 rule 로는 안 드러나는 갈래가 있다(두 모델 다 `첫 1박` 에 perNight false 를 냈다). 원문은 조건 줄만 옮긴다.
 */
describe('correctPetPolicyFacts — 모델이 맞게 낸 요금은 남긴다(BUG-018)', () => {
  const rule = (over) => ({ label: '', amountWon: null, basis: 'perDog', minKg: null, maxKg: null, fromDog: null, perNight: false, ...over });
  const calc = (fees) => fees.map((r) => [r.amountWon, r.minKg, r.maxKg, r.fromDog]);
  /**
   * 분석 시점(normalizePetPolicy)과 같은 순서 — 대조 → label 모양 맞추기 — 뒤에 앱이 읽을 때(withPolicyFacts) 한 번 더 대 본다.
   * 두 번째 대조는 고칠 것이 없어야 한다: 정규화가 바꾼 label(`1만5천원` → `1.5만원`)을 앱이 지어낸 줄로 보면 같은 버그가 앱에서 난다.
   */
  const analyzeThenRead = (f, text) => {
    const first = correctPetPolicyFacts(f, text);
    const stored = { ...first.facts, fees: first.facts.fees.map((r) => ({ ...r, label: normalizeFeeLines([r.label])[0] })) };
    const again = correctPetPolicyFacts(stored, text);
    expect(again.corrections).toEqual([]);
    return { corrections: first.corrections, facts: again.facts };
  };

  it('구간 요금표의 하한(`1~5kg` 의 1)도 원문 근거다 — 솔숲', () => {
    const text = '반려동물동반 가능 (최대 2마리)\n1~5kg 1박에 1만원\n6~10kg 1박에 1.5만원';
    const fees = [
      rule({ label: '1~5kg 1박에 1만원', amountWon: 10000, minKg: 1, maxKg: 5, perNight: true }),
      rule({ label: '6~10kg 1박에 1.5만원', amountWon: 15000, minKg: 6, maxKg: 10, perNight: true }),
    ];
    const r = analyzeThenRead(facts({ fees, maxDogs: 2 }), text);
    expect(r.corrections).toEqual([]);
    expect(calc(r.facts.fees)).toEqual([
      [10000, 1, 5, null],
      [15000, 6, 10, null],
    ]);
  });

  it('구간 하한은 요금의 minKg 에서만 근거다 — 무게 상한·구간 상한으로는 받지 않는다', () => {
    const text = '6~10kg 1박에 1.5만원';
    expect(correctPetPolicyFacts(facts({ weightLimitKg: 6 }), text).facts.weightLimitKg).toBeNull();
    const asMax = rule({ label: '6~10kg 1박에 1.5만원', amountWon: 15000, maxKg: 6, perNight: true });
    expect(correctPetPolicyFacts(facts({ fees: [asMax] }), text).facts.fees[0].amountWon).toBeNull();
  });

  it('`N마리를 초과` 는 N+1째 마리부터다 — 아우아우(모델 label 과 정규화한 label 둘 다)', () => {
    const text = '기본 대관료: 15,000원 (반려견 최대 4마리까지 입장료 기본 포함)\n추가 요금: 4마리를 초과할 경우 1견당 3,000원의 추가 요금이 발생합니다.';
    for (const label of ['4마리 초과 추가 1견당 3,000원', '4마리 초과 1견당 3,000원']) {
      const fees = [rule({ label: '기본 대관료 15,000원', amountWon: 15000, basis: 'flat' }), rule({ label, amountWon: 3000, fromDog: 5 })];
      const r = analyzeThenRead(facts({ fees }), text);
      expect(r.corrections).toEqual([]);
      expect(calc(r.facts.fees)).toEqual([
        [15000, null, null, null],
        [3000, null, null, 5],
      ]);
    }
  });

  /** 하나 어긋난 4가 모델이 실제로 낼 법한 틀림이다 — 원문의 `4마리` 가 fromDog 4 의 근거로도 잡혀 근거 검사로는 못 막는다. */
  it('초과 수와 안 맞는 fromDog(하나 어긋난 4 포함) · 초과를 잃은 fromDog 는 여전히 뺀다', () => {
    const text = '4마리를 초과할 경우 1견당 3,000원';
    const offByOne = rule({ label: '4마리 초과 1견당 3,000원', amountWon: 3000, fromDog: 4 });
    const wrongNth = rule({ label: '4마리 초과 1견당 3,000원', amountWon: 3000, fromDog: 6 });
    const lostNth = rule({ label: '4마리 초과 1견당 3,000원', amountWon: 3000 });
    const fees = correctPetPolicyFacts(facts({ fees: [offByOne, wrongNth, lostNth] }), text).facts.fees;
    expect(fees.map((r) => r.amountWon)).toEqual([null, null, null]);
  });

  it('숫자 뒤 `견` 은 마릿수다(`4인 4견`, 일랑일랑) — `1견당` 은 마리당 요금이라 아니다', () => {
    expect(correctPetPolicyFacts(facts({ maxDogs: 4 }), '최대 인원은 4인 4견이고 반려견 추가 요금은 마리당 5,000원').facts.maxDogs).toBe(4);
    expect(correctPetPolicyFacts(facts({ maxDogs: 1 }), '4마리를 초과할 경우 1견당 3,000원').facts.maxDogs).toBeNull();
  });

  it('`반려견 1마리가 포함` 은 기본 1마리다 — 일랑일랑 `추가 1마리`(fromDog 2, Opus·Sonnet)', () => {
    const text = '기본 요금에는 4인과 반려견 1마리가 포함되며, 성인은 2인을 넘길 수 없다고 안내돼 있어요.\n최대 인원은 4인 4견이고 반려견 추가 요금은 마리당 5,000원으로 표시돼 있습니다.';
    // Sonnet 의 label 엔 숫자가 없다 — 정규화가 `추가 1마리당` 으로 바꾸는 줄을 분석 때도 같은 말로 읽어야 한다
    for (const label of ['추가 1마리 5,000원', '추가 반려견 마리당 5,000원']) {
      const r = analyzeThenRead(facts({ fees: [rule({ label, amountWon: 5000, fromDog: 2 })], maxDogs: 4 }), text);
      expect(r.corrections).toEqual([]);
      expect(calc(r.facts.fees)).toEqual([[5000, null, null, 2]]);
    }
  });

  it('기본 마릿수를 말하지 않거나 `1마리당 … 포함` 이면 `추가 1마리` 의 fromDog 는 근거가 없다', () => {
    const extra = rule({ label: '추가 1마리 5,000원', amountWon: 5000, fromDog: 2 });
    for (const text of ['반려견 추가 요금은 마리당 5,000원', '추가 1마리 5,000원(청소비 1마리당 포함)', '1마리당 5,000원(청소비 포함), 추가 1마리 5,000원']) {
      expect(correctPetPolicyFacts(facts({ fees: [extra] }), text).facts.fees[0].amountWon).toBeNull();
    }
  });

  it('`첫 1박` 은 1박마다가 아니고, `1만5천원` 은 15000 이다 — 안녕감귤(Opus·Sonnet)', () => {
    const text = '애견 추가 요금은 첫 1박 기준 1만5천원이고, 연박 시 2박째부터는 1박당 1만원이 추가됩니다.';
    const nightly = { label: '2박째부터 1박당 1만원', perNight: true };
    const opus = [rule({ label: '첫 1박 1만5천원', amountWon: 15000, basis: 'flat' }), rule({ ...nightly, amountWon: 10000, basis: 'flat' })];
    const sonnet = [rule({ label: '첫 1박 기준 1만5천원', amountWon: 15000 }), rule(nightly)];
    // 둘째 줄 `2박째부터` 는 칸에 없는 조건이라 계산하지 않는다 — Opus 가 낸 10000 도 뺀다(21 G1.2). 줄은 label 로 남는다.
    expect(analyzeThenRead(facts({ fees: opus }), text).facts.fees.map((r) => r.amountWon)).toEqual([15000, null]);
    expect(analyzeThenRead(facts({ fees: sonnet }), text).facts.fees.map((r) => r.amountWon)).toEqual([15000, null]);
    // 이 수정 전에 정규화돼 DB 에 있는 label 모양 — 앱이 다시 대 볼 때도 15000 이다
    const stored = rule({ label: '첫 1박 기준 1만5,000원', amountWon: 15000 });
    expect(correctPetPolicyFacts(facts({ fees: [stored] }), text).facts.fees[0].amountWon).toBe(15000);
  });

  /** 안녕감귤은 `첫 1박` 줄과 함께라 앱이 '적힌 요금' 으로 물러났지만, 이 줄이 혼자면 1박 손님에게 "1박 1만원" 을 확정 문장으로 낸다. */
  it('`N박째부터` 요금은 혼자 있어도 계산에서 뺀다 — `1박당` 만 있는 줄은 그대로', () => {
    const text = '연박 시 2박째부터는 1박당 1만원이 추가됩니다. 소형견은 1박당 2만원입니다.';
    const nth = rule({ label: '2박째부터 1박당 1만원', amountWon: 10000, basis: 'flat', perNight: true });
    const plain = rule({ label: '1박당 2만원', amountWon: 20000, perNight: true });
    const r = correctPetPolicyFacts(facts({ fees: [nth, plain] }), text);
    expect(r.facts.fees.map((f) => [f.label, f.amountWon])).toEqual([
      ['2박째부터 1박당 1만원', null],
      ['1박당 2만원', 20000],
    ]);
    expect(r.dropped).toEqual([{ note: '요금 "2박째부터 1박당 1만원" 의 금액·조건이 원문과 맞지 않아 계산에서 뺐어요', cue: 'amount' }]);
  });

  it('`첫 1박` 요금에 1박마다(perNight)를 붙이면 뺀다 — 첫날 요금이 박마다 곱해진다', () => {
    const text = '첫 1박 기준 1만5천원';
    const r = correctPetPolicyFacts(facts({ fees: [rule({ label: '첫 1박 기준 1만5천원', amountWon: 15000, perNight: true })] }), text);
    expect(r.facts.fees[0].amountWon).toBeNull();
  });
});
