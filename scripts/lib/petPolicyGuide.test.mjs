import { describe, expect, it } from 'vitest';
import { EXTRACT_SCHEMA } from '../analyze/extractPlaces.mjs';
import { fromPlaceRow } from './placeFields.mjs';
import { COPY_RUN, guardPublicText, POLICY_TOPICS, policyFingerprint } from './petPolicyGuide.mjs';

const topicReasons = (r) => r.reasons.filter((reason) => reason.startsWith('판단 칸이 말하는 주제'));

describe('POLICY_TOPICS — 판단 칸과 짝', () => {
  /*
   * 추출 스키마에 판단 칸을 더하면 여기도(그리고 템플릿도) 더해야 한다. 빠지면 그 칸의 주제를 안내가 말해도 걸리지 않고,
   * 템플릿 줄이 없어 사이트에서 그 판단이 문장으로 안 보인다 — 빌드는 통과한다(`readNothing` 과 같은 짝).
   */
  it('추출 스키마의 판단 칸(notes 빼고)과 키가 같다', () => {
    const required = EXTRACT_SCHEMA.properties.places.items.properties.petPolicy.anyOf[0].required;
    expect(Object.keys(POLICY_TOPICS).sort()).toEqual(required.filter((key) => key !== 'notes').sort());
  });
});

describe('guardPublicText — 판단 주제', () => {
  // 담소요 — 제안 판단은 `vaccineRequired: false` 인데 안내가 접종을 말하면 배지와 문장이 갈린다.
  it('"주문할 때 예방접종 날짜를 물어봐요" 는 판단 주제로 빠진다', () => {
    const r = guardPublicText('주문할 때 예방접종 날짜를 물어봐요', '반려동물 동반 ( 야외 )\n주문할 때 예방접종 날짜를 확인해요');
    expect(r.ok).toBe(false);
    expect(topicReasons(r)).toEqual(['판단 칸이 말하는 주제예요(접종)']);
  });

  it('"정원 산책로까지 같이 걸을 수 있어요" 는 남는다', () => {
    const r = guardPublicText('정원 산책로까지 같이 걸을 수 있어요', '카페 뒤 정원에 산책로가 있어서 강아지랑 한 바퀴 돌았어요');
    expect(r).toEqual({ ok: true, reasons: [] });
  });

  // 한 글자 부분 일치(`원`·`견`)를 쓰면 이 셋이 요금·마릿수로 잡혀 거의 모든 안내가 빠진다.
  it('반려견·정원·공원이 든 안내는 주제 검사를 지난다', () => {
    for (const text of ['반려견 물그릇을 따로 내어 줘요', '정원이 넓어 사진 찍기 좋아요', '공원 옆이라 산책하고 들르기 좋아요']) {
      expect(topicReasons(guardPublicText(text, '반려견 동반 가능'))).toEqual([]);
    }
  });

  it('요금·마릿수·무게는 숫자 패턴으로 잡는다', () => {
    const raw = '1마리당 20,000원 · 2마리까지 · 10kg 이하';
    expect(topicReasons(guardPublicText('1마리당 2만원을 받아요', raw))).toContain('판단 칸이 말하는 주제예요(금액)');
    expect(topicReasons(guardPublicText('2마리까지 함께 묵을 수 있어요', raw))).toContain('판단 칸이 말하는 주제예요(2마리)');
    expect(topicReasons(guardPublicText('10kg 이하만 받아요', raw))).toContain('판단 칸이 말하는 주제예요(10kg)');
  });

  // 의도(명세 메모): 실외만 받는 곳의 자리 안내도 빠진다 — 템플릿이 "야외 자리에서만" 이라 이미 말한다.
  it('야외 자리 안내는 판단 주제(실내·야외)라 빠진다', () => {
    const r = guardPublicText('한라산이 보이는 야외 테라스석이 있어요', '야외 테라스석에서 한라산이 보여요');
    expect(topicReasons(r)).toEqual(['판단 칸이 말하는 주제예요(야외)']);
  });

  it('notes 는 주제 검사를 하지 않는다(topics: false)', () => {
    expect(guardPublicText('예방접종 증명서를 보여 줘야 해요', '접종 증명서 지참', { topics: false })).toEqual({ ok: true, reasons: [] });
  });
});

describe('guardPublicText — 원문 밖으로 나가지 않는다', () => {
  const raw = '사장님께서 강아지 물그릇과 간식을 따로 챙겨 주셨어요. 1마리당 20,000원이고 체크인은 오후 3시예요.';

  it(`원문 ${COPY_RUN}자를 베낀 안내는 빠진다 · ${COPY_RUN - 1}자 겹침은 지난다`, () => {
    const copied = guardPublicText('사장님께서 강아지 물그릇과 간식을 챙겨 줘요', raw); // "사장님께서강아지물그릇과간식을" = 15자
    expect(copied.ok).toBe(false);
    expect(copied.reasons[0]).toMatch(/^원문을 그대로 옮겼어요/);
    expect(guardPublicText('사장님께서 강아지 물그릇과 간 식기를 내줘요', raw).reasons.filter((r) => r.startsWith('원문을'))).toEqual([]);
  });

  it('원문에 없는 숫자는 빠진다 — 금액은 원 단위로 대 본다', () => {
    expect(guardPublicText('오후 4시부터 들어갈 수 있어요', raw, { topics: false }).reasons).toEqual(['원문에 없는 숫자예요(4)']);
    expect(guardPublicText('오후 3시부터 들어갈 수 있어요', raw, { topics: false }).ok).toBe(true);
    // AI 가 `20,000원` 을 `2만원` 으로 써도 같은 금액이다 · `3만원` 은 원문에 없다(숫자 3 이 원문에 있어도).
    expect(guardPublicText('1마리당 2만원이에요', raw, { topics: false }).ok).toBe(true);
    expect(guardPublicText('1마리당 3만원이에요', raw, { topics: false }).reasons).toEqual(['원문에 없는 숫자예요(3만원)']);
  });

  // PLANT827 "족욕장은 함께 이용할 수 없어요" 처럼 글쓴이가 안 한 일을 규칙으로 만든 notes.
  it('원문에 근거 단어가 없는 조건은 빠진다', () => {
    expect(guardPublicText('소형견만 받아요', '애견동반 가능해요', { topics: false }).reasons).toEqual(['원문에 없는 조건이에요(소형)']);
    expect(guardPublicText('리드줄을 꼭 해 주세요', '애견동반 가능해요', { topics: false }).reasons).toEqual([
      '원문에 없는 조건이에요(리드·목줄·하네스)',
    ]);
  });

  // 근거 단어 표 중 산문에서 흔한 말(맨 `없` · `자유롭게`)은 쓰지 않는다 — 걸면 멀쩡한 안내가 빠진다.
  it('"주차 걱정은 없어요" · "자유롭게 뛰어놀아요" 는 근거 단어로 안 걸린다', () => {
    expect(guardPublicText('주차 걱정은 없어요', '반려견 동반 가능')).toEqual({ ok: true, reasons: [] });
    expect(guardPublicText('운동장에서 자유롭게 뛰어놀 수 있어요', '운동장이 넓어서 뛰어놀기 좋아요')).toEqual({ ok: true, reasons: [] });
  });

  it('빈 문장은 통과가 아니다', () => {
    expect(guardPublicText('  ', raw).ok).toBe(false);
    expect(guardPublicText(null, raw).ok).toBe(false);
  });
});

describe('policyFingerprint — 같은 판단은 같은 지문', () => {
  /*
   * 지문 왕복: 안내는 **후보** 단계에서 찍히고(추출·제안 패스), 화면은 **게시된 행**의 판단으로 확인한다. 둘은 모양이 다르다 —
   * 후보는 `shapePetPolicy`·`correctPetPolicyFacts` 를 갓 지나 `petDays: null`·`feeText: null` 을 들고 있고, 게시된 행은 jsonb 를
   * 거쳐 키가 재배열되고(안쪽 `fees[]` 객체까지) 옛 판단엔 `petDays` 칸이 아예 없다. 이 차이로 지문이 갈리면 모든 안내가 숨는다.
   */
  const candidate = {
    indoor: 'outdoorOnly',
    leash: false,
    largeDogOk: null,
    smallDogOnly: false,
    callFirst: false,
    vaccineRequired: false,
    petDays: null,
    feeFree: null,
    fees: [],
    feeLines: [],
    weightLimitKg: null,
    maxDogs: null,
    notes: null,
    feeText: null,
  };
  // 담소요(e552ee96) 의 `src/data/places.json` 값 — jsonb 키 순서(짧은 키 먼저), `petDays` 없음, `feeText` 없음.
  const damsoyoRow = {
    fees: [],
    leash: false,
    notes: null,
    indoor: 'outdoorOnly',
    feeFree: null,
    maxDogs: null,
    feeLines: [],
    callFirst: false,
    largeDogOk: null,
    smallDogOnly: false,
    weightLimitKg: null,
    vaccineRequired: false,
  };
  const row = (petPolicy) => ({ id: 'e552ee96', type: 'cafe', name: '담소요', region_raw: '서쪽 (애월읍)', pet_policy_text: '반려동물 동반 ( 야외 )', pet_policy: petPolicy });

  it('후보 판단의 지문 = fromPlaceRow 를 거친 게시 행 판단의 지문(담소요)', () => {
    expect(policyFingerprint(fromPlaceRow(row(damsoyoRow)).petPolicy)).toBe(policyFingerprint(candidate));
  });

  it('요금 구조 안쪽 객체의 키 순서가 달라도 같다', () => {
    const rule = { label: '1마리당 2만원', amountWon: 20000, basis: 'perDog', minKg: null, maxKg: null, fromDog: null, perNight: true };
    const jsonbRule = { basis: 'perDog', label: '1마리당 2만원', maxKg: null, minKg: null, fromDog: null, perNight: true, amountWon: 20000 };
    expect(policyFingerprint(fromPlaceRow(row({ ...damsoyoRow, fees: [jsonbRule] })).petPolicy)).toBe(
      policyFingerprint({ ...candidate, fees: [rule] }),
    );
  });

  it('판단 칸 하나를 바꾸면 지문이 바뀐다', () => {
    const base = policyFingerprint(candidate);
    expect(policyFingerprint({ ...candidate, indoor: 'free' })).not.toBe(base);
    expect(policyFingerprint({ ...candidate, vaccineRequired: true })).not.toBe(base);
    expect(policyFingerprint({ ...candidate, petDays: ['수'] })).not.toBe(base);
    expect(policyFingerprint({ ...candidate, weightLimitKg: 10 })).not.toBe(base);
    // false(불가)와 null(언급 없음)은 다른 판단이다 — false 를 지우는 정규형이면 이 둘이 같은 지문이 된다.
    expect(policyFingerprint({ ...candidate, largeDogOk: false })).not.toBe(base);
    // 요금 구조의 계산 칸 하나도 판단이다.
    const rule = { label: '1마리당 2만원', amountWon: 20000, basis: 'perDog', minKg: null, maxKg: null, fromDog: null, perNight: true };
    expect(policyFingerprint({ ...candidate, fees: [{ ...rule, perNight: false }] })).not.toBe(policyFingerprint({ ...candidate, fees: [rule] }));
  });

  it('notes 도 판단의 일부다 — 운영자가 고치면 숨김 쪽', () => {
    expect(policyFingerprint({ ...candidate, notes: '주말엔 붐벼요' })).not.toBe(policyFingerprint(candidate));
  });

  it('판단이 없으면(null·undefined) 같은 지문 하나', () => {
    expect(policyFingerprint(null)).toBe(policyFingerprint(undefined));
    expect(policyFingerprint(null)).toMatch(/^[0-9a-f]{14}$/);
  });
});
