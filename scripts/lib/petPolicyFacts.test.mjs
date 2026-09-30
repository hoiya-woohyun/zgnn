import { describe, expect, it } from 'vitest';
import { correctPetPolicyFacts } from './petPolicyFacts.mjs';

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
    expect(correctPetPolicyFacts(facts({ weightLimitKg: 10 }), '')).toEqual({ facts: facts({ weightLimitKg: 10 }), corrections: [] });
    expect(correctPetPolicyFacts(null, '10kg 이하')).toEqual({ facts: null, corrections: [] });
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
