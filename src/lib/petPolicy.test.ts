import { describe, expect, it } from 'vitest';
import { parsePetPolicy, toPetBadges, withPolicyFacts } from './petPolicy';
import { formatDogFee } from './dogFee';
import { judgeEligibility } from './eligibility';
import { PLACES } from './places';

describe('parsePetPolicy — 식당·카페', () => {
  it('실내 불가 문장은 야외만으로 읽는다', () => {
    const p = parsePetPolicy('실내 불가능. 바깥 하우스 자리만 가능. (근데 귤밭이라 더 예뻐요)');
    expect(p.indoor).toBe('outdoorOnly');
    expect(p.leash).toBe(false);
  });

  it('실내외 모두 가능해도 유모차·이동가방이 필요하면 케이지로 읽는다', () => {
    expect(parsePetPolicy('실내외 모두 가능하지만 실내에서는 유모차/이동 가방 필요.').indoor).toBe('cage');
  });

  it('리드줄만 필요하면 실내 자유로 읽고 리드줄과 대형견을 함께 뽑는다', () => {
    const p = parsePetPolicy('실내외 모두 가능하지만 실내에서는 리드줄 착용 필요. 대형견도 입장 가능.');
    expect(p.indoor).toBe('free');
    expect(p.leash).toBe(true);
    expect(p.largeDogOk).toBe(true);
    expect(p.mediumDogOk).toBe(true);
  });

  it('중형견만 언급되면 대형견은 붙이지 않는다', () => {
    const p = parsePetPolicy('케이지 동반시 가능. (중형견도 가능)');
    expect(p.indoor).toBe('cage');
    expect(p.mediumDogOk).toBe(true);
    expect(p.largeDogOk).toBe(false);
  });

  it('실외는 자유라는 단서가 붙어도 실내 케이지 필수가 이긴다', () => {
    expect(parsePetPolicy('실내에서는 케이지 필수. 실외는 자유롭게 이용 가능.').indoor).toBe('cage');
  });
});

describe('parsePetPolicy — 숙소', () => {
  it('무게 제한과 마릿수, 요금 문장을 함께 뽑는다', () => {
    const p = parsePetPolicy('7kg 미만의 최대 2마리 가능.\n1마리당 1만원.');
    expect(p.weightLimitKg).toBe(7);
    expect(p.maxDogs).toBe(2);
    expect(p.feeText).toBe('1마리당 1만원');
    expect(p.feeFree).toBe(false);
  });

  it("'1마리만' 은 최대 1마리로 읽고, 요금은 뒤 문장에서 찾는다", () => {
    const p = parsePetPolicy('5kg 이하의 1마리만 가능.\n숙박일 관계없이 청소비 5만원 추가.');
    expect(p.weightLimitKg).toBe(5);
    expect(p.maxDogs).toBe(1);
    expect(p.feeText).toBe('숙박일 관계없이 청소비 5만원 추가');
  });

  it('견종·몸무게 제한이 없다고 하면 대형견 가능으로 읽는다', () => {
    const p = parsePetPolicy('견종 제한, 몸무게 제한 없음.\n1마리당 3만원. (최대 2마리까지 가능)');
    expect(p.largeDogOk).toBe(true);
    expect(p.maxDogs).toBe(2);
    expect(p.feeText).toBe('1마리당 3만원');
  });

  it('무료 동반은 추가요금 없음으로 읽는다', () => {
    const p = parsePetPolicy('대형견 2마리까지 무료 동반 가능.');
    expect(p.feeFree).toBe(true);
    expect(p.largeDogOk).toBe(true);
    expect(p.maxDogs).toBe(2);
  });

  it('소형견에 한해 가능한 곳은 소형견만으로 읽고 대형견으로 보지 않는다', () => {
    const p = parsePetPolicy('소형견에 한해 동반 입실 가능.\n1마리당 3만원.');
    expect(p.smallDogOnly).toBe(true);
    expect(p.largeDogOk).toBe(false);
    expect(p.mediumDogOk).toBe(false);
    expect(toPetBadges(p).map((b) => b.label)).toContain('소형견만');
  });

  it("'1마리당' 은 마릿수 제한이 아니다", () => {
    expect(parsePetPolicy('1마리당 5만원.').maxDogs).toBeUndefined();
  });

  it('kg 이 요금 문장에 섞여 있으면 무게 제한으로 읽지 않는다', () => {
    // 요금표는 구간별 가격만 적었을 뿐 상한을 말한 적이 없다. 요금 문장으로만 남긴다.
    const p = parsePetPolicy('1~5kg 1만원.\n6~10kg 1.5만원.');
    expect(p.weightLimitKg).toBeUndefined();
    expect(p.feeText).toBe('1~5kg 1만원');
  });

  it('무게 조건이 여러 개면 가장 큰 값이 상한이다', () => {
    const p = parsePetPolicy(
      '10kg 미만의 경우 최대 2마리 가능. 20kg 미만(중형견)의 경우 최대 1마리 가능.\n1마리당 1-2만원.',
    );
    expect(p.weightLimitKg).toBe(20);
  });

  it("'kg 이상' 은 상한이 아니라 하한이라 무게 제한으로 읽지 않는다", () => {
    const p = parsePetPolicy('1마리당 3만원. (2마리 또는 10kg 이상 4만원)');
    expect(p.weightLimitKg).toBeUndefined();
    expect(p.feeText).toBe('1마리당 3만원');
  });

  it('요금표에 큰 kg 이 섞여 있어도 명시된 상한만 읽는다', () => {
    expect(parsePetPolicy('5kg 미만만 가능.\n1~20kg 1만원.').weightLimitKg).toBe(5);
  });
});

describe('parsePetPolicy — tiers', () => {
  it('웨스티하우스: 문장이 다르면 tier 도 따로 쌓인다', () => {
    const p = parsePetPolicy(
      '10kg 미만의 경우 최대 2마리 가능. 20kg 미만(중형견)의 경우 최대 1마리 가능.\n1마리당 1-2만원.',
    );
    expect(p.tiers).toEqual([
      { maxWeightKg: 10, weightInclusive: false, maxDogs: 2, source: '10kg 미만의 경우 최대 2마리 가능' },
      { maxWeightKg: 20, weightInclusive: false, maxDogs: 1, source: '20kg 미만(중형견)의 경우 최대 1마리 가능' },
    ]);
    expect(p.weightLimitKg).toBe(20);
    expect(p.maxDogs).toBe(2);
  });

  it('달중이네: 무게만 있는 문장과 마릿수만 있는 문장을 한 tier 로 합친다', () => {
    const p = parsePetPolicy('최대 3마리까지 가능. (15kg까지)\n1마리 이상 2만원 추가. (마리당)');
    expect(p.tiers).toEqual([{ maxWeightKg: 15, weightInclusive: true, maxDogs: 3, source: '최대 3마리까지 가능. (15kg까지)' }]);
    expect(p.weightLimitKg).toBe(15);
    expect(p.maxDogs).toBe(3);
  });

  it('오제: 한 문장에 마릿수와 무게가 같이 있으면 그대로 한 tier', () => {
    const p = parsePetPolicy('1마리당 3만원. (최대 2마리 15kg 미만)');
    expect(p.tiers).toEqual([{ maxWeightKg: 15, weightInclusive: false, maxDogs: 2, source: '(최대 2마리 15kg 미만)' }]);
  });

  it('요호르기: 무게 없이 마릿수만 있으면 짝 없는 tier 하나로 남는다', () => {
    const p = parsePetPolicy('대형견 2마리까지 무료 동반 가능.');
    expect(p.tiers).toEqual([{ maxDogs: 2, source: '대형견 2마리까지 무료 동반 가능' }]);
    expect(p.largeDogOk).toBe(true);
    expect(p.feeFree).toBe(true);
  });

  it('백화stay: 견수 제한 없음은 unlimitedDogs 로 잡고 견종 제한 없음은 대형견 OK 로 유지한다', () => {
    const p = parsePetPolicy('견종 제한, 견수 제한 없음.\n반려동물 추가금 없음.');
    expect(p.unlimitedDogs).toBe(true);
    expect(p.largeDogOk).toBe(true);
    expect((p.maxDogs ?? 0) >= 2 || p.unlimitedDogs).toBe(true);
  });

  it('솔숲펜션: 구간 요금표는 tier 로 읽지 않고 feeLines 두 줄만 남는다', () => {
    const p = parsePetPolicy('1~5kg 1만원.\n6~10kg 1.5만원.');
    expect(p.tiers).toEqual([]);
    expect(p.feeLines).toEqual(['1~5kg 1만원', '6~10kg 1.5만원']);
    expect(p.feeText).toBe('1~5kg 1만원');
  });

  it('카페스누피: sources.indoor 에 실제 걸린 문장이 담긴다', () => {
    const p = parsePetPolicy('실내외 모두 가능하지만 실내에서는 유모차/이동 가방 필요.');
    expect(p.indoor).toBe('cage');
    expect(p.sources.indoor).toBe('실내외 모두 가능하지만 실내에서는 유모차/이동 가방 필요');
  });
});

describe('toPetBadges', () => {
  it('정보 없음이면 전화 확인 배지를 겹쳐 붙이지 않는다', () => {
    const p = parsePetPolicy('정보 없음. 방문 전 전화로 확인해 주세요.');
    expect(p.noInfo).toBe(true);
    expect(p.callFirst).toBe(true);
    const labels = toPetBadges(p).map((b) => b.label);
    expect(labels).toContain('확인된 정보 없음');
    expect(labels).not.toContain('전화 확인');
  });

  it('실내 정보가 없으면 실내 배지를 만들지 않는다', () => {
    const labels = toPetBadges(parsePetPolicy('10kg 미만의 최대 2마리 가능.')).map((b) => b.label);
    expect(labels).toEqual(['~10kg', '최대 2마리']);
  });

  it('실내 자유 + 리드줄은 두 배지로 나온다', () => {
    const labels = toPetBadges(parsePetPolicy('실내외 모두 가능. (리드줄 착용 필수)')).map((b) => b.label);
    expect(labels).toEqual(['실내 OK', '리드줄']);
  });

  it('다른 조건이 없는 숙소도 요금 문장이 배지로 남는다', () => {
    expect(toPetBadges(parsePetPolicy('1마리당 5만원.')).map((b) => b.label)).toEqual(['1마리당 5만원']);
  });

  it('추가요금이 없으면 요금 문장 배지는 붙이지 않는다', () => {
    const labels = toPetBadges(parsePetPolicy('견종 제한, 견수 제한 없음.\n반려동물 추가금 없음.')).map((b) => b.label);
    expect(labels).toContain('추가요금 없음');
    expect(labels.some((label) => label.includes('추가금'))).toBe(false);
  });

  it('사진이 없는 것이 기본이라 모든 장소가 최소 한 개의 배지를 갖는다', () => {
    const bare = PLACES.filter((place) => toPetBadges(place.policy).length === 0);
    expect(bare.map((place) => `${place.name}: ${place.petPolicyText}`)).toEqual([]);
  });
});

describe('취약 규칙 보강', () => {
  it("'대형견 불가능' 을 대형견 가능으로 읽지 않는다", () => {
    const p = parsePetPolicy('소형견만 가능. 대형견은 불가능합니다.');
    expect(p.largeDogOk).toBe(false);
    expect(p.mediumDogOk).toBe(false);
    expect(p.smallDogOnly).toBe(true);
  });

  it("'중형견 입장 불가' 도 중형견 가능으로 읽지 않는다", () => {
    expect(parsePetPolicy('중형견 이상은 입장 불가.').mediumDogOk).toBe(false);
  });

  it("'주차 문의' 는 방문 전 확인이 아니다", () => {
    expect(parsePetPolicy('실내 불가. 주차 문의는 사장님께.').callFirst).toBe(false);
    expect(parsePetPolicy('실내외 모두 가능. 방문 전 전화로 확인 부탁드려요.').callFirst).toBe(true);
  });

  it("'무료 주차' 는 추가요금 없음이 아니다", () => {
    expect(parsePetPolicy('실내 불가. 무료 주차 가능.').feeFree).toBe(false);
    expect(parsePetPolicy('대형견 2마리까지 무료 동반 가능.').feeFree).toBe(true);
    expect(parsePetPolicy('반려동물 추가금 없음.').feeFree).toBe(true);
  });

  it('숫자가 없는 원(공원·병원·정원)은 요금 문장으로 읽지 않는다', () => {
    expect(parsePetPolicy('실내 불가. 바로 옆 공원에서 산책할 수 있어요.').feeText).toBeUndefined();
    expect(parsePetPolicy('근처에 24시 동물병원이 있어요.').feeText).toBeUndefined();
    expect(parsePetPolicy('정원에서만 동반 가능.').feeText).toBeUndefined();
  });
});

describe('실제 데이터', () => {
  it('숙소 26곳은 모두 배지가 하나 이상 나온다', () => {
    const stays = PLACES.filter((place) => place.type === 'stay');
    expect(stays).toHaveLength(26);
    const bare = stays.filter((place) => toPetBadges(place.policy).length === 0);
    expect(bare.map((place) => place.name)).toEqual([]);
  });

  /*
   * 배지가 하나도 없던 네 곳. 각각 다른 규칙으로 살아나므로 원문과 함께 고정해 둔다.
   *
   * **요금 줄이 여럿인 두 곳(솔숲펜션·캄)의 기대값이 2026-09-30 에 늘었다.** 예전에는 `feeLines[0]` 하나만
   * 배지가 돼, "1~5kg 1만원 / 6~10kg 1.5만원" 인 곳이 첫 구간만 말했다 — 6kg 강아지 보호자는 요금을 못 봤다.
   * 그 줄이 사라지는 것을 붙잡는 유일한 테스트가 여기라, 늘어난 쪽이 옳은 값이다.
   */
  it.each([
    ['부띠크풀빌라 나미브', ['1마리당 3만원', '소형견만']],
    ['솔숲펜션', ['1~5kg 1만원', '6~10kg 1.5만원']],
    ['돌담연가', ['1마리당 5만원']],
    // 배지 라벨은 정규화한 줄이다(`normalizeFeeLines`) — 원문의 괄호가 벗겨진다. `feeLines` 원본은 그대로다.
    ['캄 : Kalm', ['1마리당 3만원', '2마리 또는 10kg 이상 4만원']],
  ])('%s 의 배지를 고정한다', (name, expected) => {
    const place = PLACES.find((candidate) => candidate.name === name);
    expect(place, `${name} 을(를) places.json 에서 찾지 못했다`).toBeDefined();
    expect(toPetBadges(place!.policy).map((badge) => badge.label)).toEqual(expected);
  });

  it('웨스티하우스의 무게 상한은 첫 매치(10)가 아니라 최댓값(20)이다', () => {
    const place = PLACES.find((candidate) => candidate.name === '웨스티하우스');
    expect(place?.policy.weightLimitKg).toBe(20);
  });


  it('식당과 카페는 모두 실내 동반 조건을 읽어낸다', () => {
    const unread = PLACES.filter((p) => p.type !== 'stay' && p.policy.indoor === 'unknown');
    expect(unread.map((p) => `${p.name}: ${p.petPolicyText}`)).toEqual([]);
  });

  it('시드 86곳 이상 전부 파싱에 실패하지 않는다', () => {
    // 운영자 화면(/admin)이 승인한 장소가 pull 되면 86 을 넘는다(ADR-018) — 시드는 그대로 남으니 하한만 못 박는다.
    expect(PLACES.length).toBeGreaterThanOrEqual(86);
    for (const place of PLACES) {
      expect(typeof place.policy.indoor).toBe('string');
    }
  });
});

describe('parsePetPolicy — 블로그에서 온 문장(2026-09-28 첫 data:analyze 실측)', () => {
  it("빈 원문은 '정보 없음' 과 같다 — 신규 장소가 조건 없이 '갈 수 있어요' 가 되지 않게(BUG-008)", () => {
    expect(parsePetPolicy('').noInfo).toBe(true);
    expect(parsePetPolicy('  \n').noInfo).toBe(true);
    expect(parsePetPolicy('').sources.noInfo).toBeUndefined();
    expect(parsePetPolicy('리드줄 필수').noInfo).toBe(false);
  });

  it('동반 자체가 안 된다는 문장은 notAllowed 로 읽고 배지는 맨 앞에 하나', () => {
    const p = parsePetPolicy('풍차해안도로와 가깝지만 애견동반은 아쉽게도 안됩니다');
    expect(p.notAllowed).toBe(true);
    expect(p.sources.notAllowed).toContain('안됩니다');
    expect(toPetBadges(p)[0]).toEqual({ label: '동반 불가', tone: 'warn', axis: 'notAllowed' });
  });

  it("'대형견 불가' 같은 크기 조건이나 '실내 불가' 는 notAllowed 가 아니다", () => {
    expect(parsePetPolicy('대형견 불가. 소형견만 실내 가능.').notAllowed).toBe(false);
    expect(parsePetPolicy('강아지 동반 시 케이지 필수, 실내 불가').notAllowed).toBe(false);
  });

  it('야외 좌석만·테라스만·실내는 안 돼요 는 야외만으로 읽는다', () => {
    expect(parsePetPolicy('🐶 애견동반 가능 (야외좌석만 가능) 애견동반은 야외좌석만 가능해요.').indoor).toBe('outdoorOnly');
    expect(parsePetPolicy('강아지는 테라스만 가능합니다').indoor).toBe('outdoorOnly');
    expect(parsePetPolicy('실내는 안 돼요, 마당 자리에서만').indoor).toBe('outdoorOnly');
  });

  it('켄넬·이동장·케이지를 챙겨야 한다는 구어체는 케이지로, 케이지 없이도 가능은 그대로 자유로 읽는다', () => {
    expect(parsePetPolicy('실내 이용 시 케이지나 전용 가방을 챙겨가야 같이 들어갈 수 있다.').indoor).toBe('cage');
    expect(parsePetPolicy('실내 1층은 켄넬이나 이동가방이 있으면 이용 가능하고, 야외에서는 리드줄을 착용해야 한다.').indoor).toBe('cage');
    expect(parsePetPolicy('케이지 없이도 가능').indoor).toBe('free');
  });

  it('목줄·하네스도 리드줄이고, 오프리쉬는 리드줄이 아니다', () => {
    expect(parsePetPolicy('목줄 착용 필수').leash).toBe(true);
    expect(parsePetPolicy('하네스 착용해 주세요').leash).toBe(true);
    expect(parsePetPolicy('야외에 애견동반 공간이 따로 있어서 오프리쉬로 뛰어다닐 수 있어요').leash).toBe(false);
  });

  it('시드 86곳에는 동반 불가로 읽히는 곳이 없다(회귀 가드)', () => {
    expect(PLACES.filter((p) => parsePetPolicy(p.petPolicyText).notAllowed).map((p) => p.name)).toEqual([]);
  });
});

/**
 * 배지의 축. 사이트는 안 쓰지만 `/admin` 표가 이것으로 열을 가른다(`adminPreview.ts` 의 `policySplit`) —
 * 라벨 문자열로는 못 가른다(요금 배지의 라벨이 원문 문장 그 자체다).
 */
describe('toPetBadges — 축', () => {
  it("'케이지 필요' 는 실내 판단에서 나오지만 장비 축이다 — 사람이 할 일은 가방을 챙기는 것이다", () => {
    const badges = toPetBadges(parsePetPolicy('실내는 이동가방 필수, 리드줄 착용'));
    expect(badges.filter((b) => b.axis === 'gear').map((b) => b.label)).toEqual(['케이지 필요', '리드줄']);
    expect(badges.filter((b) => b.axis === 'indoor')).toEqual([]);
  });

  it("'야외만'·'실내 OK' 는 챙길 것이 없으므로 실내 축이다", () => {
    expect(toPetBadges(parsePetPolicy('야외석만 가능해요')).filter((b) => b.axis === 'indoor').map((b) => b.label)).toEqual(['야외만']);
  });

  it('요금 줄은 모두 요금 축, 무게·마릿수는 제한 축이다', () => {
    const badges = toPetBadges(parsePetPolicy('10kg 이하 2마리까지. 1마리당 2만원 추가'));
    expect(badges.filter((b) => b.axis === 'fee').map((b) => b.label)).toEqual(['1마리당 2만원']);
    expect(badges.filter((b) => b.axis === 'limit').map((b) => b.label)).toEqual(['~10kg', '최대 2마리']);
  });
});

describe('withPolicyFacts — AI 구조화 판단이 정규식 결과를 덮는다(ADR-017)', () => {
  const facts = { indoor: 'outdoorOnly' as const, leash: true, largeDogOk: null, smallDogOnly: false, callFirst: false, feeFree: null, feeText: null, weightLimitKg: 10, maxDogs: 2, notes: null };

  it('facts 가 없으면 파서 결과 그대로(시드 경로)', () => {
    const parsed = parsePetPolicy('1~5kg 1만원.');
    expect(withPolicyFacts(parsed, undefined)).toBe(parsed);
  });

  it('정규식이 못 읽는 구어체도 AI 판단으로 야외만·리드줄·무게·마릿수가 채워진다', () => {
    // 숫자는 원문에 있어야 남는다(correctPetPolicyFacts) — '10키로'·'두 마리' 는 정규식이 못 읽는 꼴이라 AI 만 채운다.
    const text = '애견동반은 야외 자리 쪽에서 편하게 가능해요, 목줄은 해 주시고 10키로 넘는 친구는 안 되고 두 마리 정도예요';
    const p = withPolicyFacts(parsePetPolicy(text), facts, text);
    expect(p.indoor).toBe('outdoorOnly');
    expect(p.outdoorFree).toBe(true);
    expect(p.leash).toBe(true);
    expect(p.weightLimitKg).toBe(10);
    expect(p.maxDogs).toBe(2);
    expect(p.tiers).toEqual([{ maxWeightKg: 10, weightInclusive: true, maxDogs: 2, source: text }]);
    expect(p.noInfo).toBe(false);
    expect(p.sources.indoor).toBe(text);
  });

  /*
   * **AI 의 null 은 정규식으로 메우지 않는다**(ADR-017 v5). 스키마가 모든 칸을 요구하므로 facts 가 있는 한 null 은
   * "읽어 봤는데 그런 조건이 없다" 이다. 정규식은 무게 상한과 요금 구간을 가르지 못한다 — 다와풀빌라가 그 실측이다.
   */
  it('다와풀빌라 — 요금 구간의 19kg 이 무게 상한이 되지 않는다', () => {
    const text = '한 객실당 최대 3마리까지 가능해요.\n19kg 이하 1마리당 20,000원\n20kg 이상 1마리당 30,000원';
    const parsed = parsePetPolicy(text);
    expect(parsed.weightLimitKg).toBe(19); // 정규식 혼자서는 이렇게 읽는다 — 이 테스트가 막는 것
    const p = withPolicyFacts(parsed, { ...facts, indoor: 'unknown', leash: false, weightLimitKg: null, maxDogs: 3 }, text);
    expect(p.weightLimitKg).toBeUndefined();
    expect(p.tiers).toEqual([{ maxWeightKg: undefined, weightInclusive: undefined, maxDogs: 3, source: expect.any(String) }]);
    expect(toPetBadges(p).map((b) => b.label)).not.toContain('~19kg');
    const big = { dogs: [{ name: '보리', weightKg: 25 }], carrier: 'none' as const };
    expect(judgeEligibility(big, p).level).not.toBe('hard');
  });

  it('AI 가 null 이면 정규식이 읽은 계단식 조건도 판정에 안 닿는다', () => {
    const text = '10kg 미만은 2마리, 20kg 미만은 1마리. 대형견도 가능.';
    const p = withPolicyFacts(parsePetPolicy(text), { ...facts, indoor: 'unknown', leash: false, weightLimitKg: null, maxDogs: null }, text);
    expect(p.tiers).toEqual([]);
    expect(p.weightLimitKg).toBeUndefined();
    // 대형견 가능도 AI 가 null 이면 서지 않는다 — '확인 필요' 로 물러나는 쪽이 틀린 허용보다 싸다.
    expect(p.largeDogOk).toBe(false);
    expect(p.indoor).toBe('unknown');
    expect(p.leash).toBe(false);
  });

  it('largeDogOk false 는 파서의 true 를 덮어 대형견 불가가 되고, AI 요금 문장이 feeText·feeLines 앞에 선다', () => {
    const text = '대형견도 가능. 1마리당 2만원 추가';
    const p = withPolicyFacts(parsePetPolicy(text), { ...facts, indoor: 'unknown', leash: false, weightLimitKg: null, maxDogs: null, largeDogOk: false, feeText: '1마리당 2만원' }, text);
    expect(p.largeDogOk).toBe(false);
    expect(p.largeDogNo).toBe(true);
    expect(p.sources.largeDogNo).toBe(text);
    expect(p.feeText).toBe('1마리당 2만원');
    expect(p.feeLines[0]).toBe('1마리당 2만원');
  });

  it('원문에 근거가 없는 AI 판단은 덮지 않는다 — 없는 10kg 이 대형견을 막지 않게', () => {
    const text = '애견동반 가능해요!';
    const p = withPolicyFacts(parsePetPolicy(text), facts, text);
    expect(p.indoor).toBe('unknown');
    expect(p.weightLimitKg).toBeUndefined();
    expect(p.maxDogs).toBeUndefined();
    expect(p.tiers).toEqual([]);
    expect(p.leash).toBe(false);
  });

  /*
   * v2 의 "제한은 정규식이 이긴다"(결정 7)는 v5 에서 거뒀다 — 정규식이 읽은 '제한' 이 요금 문장·부분 조건에서 온다.
   * AI 가 원문과 어긋나면 `correctPetPolicyFacts` 가 근거 없는 판단을 빼고, 남은 어긋남은 검수 화면의 `AI≠정규식` 이 보여 준다.
   */
  it('실내 판단도 AI 를 따른다 — 정규식의 케이지로 되돌리지 않는다', () => {
    const text = '실내는 케이지 동반, 실내 분위기가 좋아요';
    const p = withPolicyFacts(parsePetPolicy(text), { ...facts, indoor: 'free', leash: false, weightLimitKg: null, maxDogs: null }, text);
    expect(p.indoor).toBe('free');
    // 정규식이 짚은 케이지 문장은 '실내 자유' 의 근거가 아니다 — 근거 줄을 새로 고른다.
    expect(p.sources.indoor).toBe(text);
  });

  it("정규식의 '동반 불가' 는 AI 판단이 있으면 H0 로 보내지 않는다 — 후보가 있다는 것이 AI 가 동반 가능으로 읽었다는 뜻이다", () => {
    const text = '애견 동반 입장은 루프탑만 불가, 1층은 가능해요';
    expect(parsePetPolicy(text).notAllowed).toBe(true);
    const p = withPolicyFacts(parsePetPolicy(text), { ...facts, indoor: 'unknown', leash: false, weightLimitKg: null, maxDogs: null }, text);
    expect(p.notAllowed).toBe(false);
  });

  /*
   * 요금은 **목록**이다(2026-09-30). AI 가 기준별로 정리해 준 줄이 전부 앞에 서고, 정규식이 통째로 집은
   * 문장은 뒤에 남는다 — 같은 문장이면 중복을 턴다. 한 줄만 받던 동안 둘째 기준이 사이트에 안 나갔다.
   */
  it('AI 가 읽은 요금 줄이 정규식의 뭉친 문장을 덮는다', () => {
    const text = '1마리당 2만원 추가, 청소비 5만원';
    const p = withPolicyFacts(
      parsePetPolicy(text),
      { ...facts, indoor: 'unknown', leash: false, weightLimitKg: null, maxDogs: null, feeLines: ['1마리당 2만원', '청소비 5만원'] },
      text,
    );
    expect(p.feeLines).toEqual(['1마리당 2만원', '청소비 5만원']);
    expect(p.feeText).toBe('1마리당 2만원');
    expect(toPetBadges(p).filter((b) => b.axis === 'fee').map((b) => b.label)).toEqual(['1마리당 2만원', '청소비 5만원']);
  });

  /*
   * **덮기가 아니라 잔여 병합이다.** 통째로 덮던 판(2026-09-30 당일)에서 이 원문이 "6만원" 을 확정했다 —
   * 원문은 2마리면 4만원이다. 곱셈을 막는 근거가 "안 쓰인 줄에 마리·kg 이 있다" 하나뿐인데(`dogFee` 의
   * `hasUnusedCondition`) 덮기가 그 줄을 먼저 지워 가드의 입력을 없앴다. 옛 후보는 요금이 필연적으로 한 줄이라
   * (스키마가 문자열 한 칸이었다) 기준이 여럿인 곳 전부가 이 함정이었다.
   */
  it('AI 가 못 읽은 정규식 요금 줄은 남는다 — 그 줄이 곱셈을 막는 유일한 근거다', () => {
    const text = '1마리당 3만원. (2마리 또는 10kg 이상 4만원)';
    const legacy = { ...facts, indoor: 'unknown' as const, leash: false, weightLimitKg: null, maxDogs: null, feeText: '1마리당 3만원' };
    const p = withPolicyFacts(parsePetPolicy(text), legacy, text);
    expect(p.feeLines).toEqual(['1마리당 3만원', '(2마리 또는 10kg 이상 4만원)']);
    // 2마리 5·6kg — 남은 줄이 없으면 "6만원" 이라고 확정한다(원문은 4만원).
    const fee = formatDogFee(p, { dogs: [{ name: '악동이', weightKg: 5 }, { name: '두부', weightKg: 6 }], carrier: 'none' });
    expect(fee).toBe('원문 요금 · 1마리당 3만원 · 2마리 또는 10kg 이상 4만원');
  });

  /** 옛 후보의 구간 요금표: `feeText` 는 첫 구간뿐이라, 둘째 구간을 정규식에서 되찾아야 합산이 산다. */
  it('옛 모양의 구간 요금표는 정규식의 둘째 구간을 되찾는다', () => {
    const text = '1~5kg 1만원.\n6~10kg 1.5만원.';
    const legacy = { ...facts, indoor: 'unknown' as const, leash: false, weightLimitKg: null, maxDogs: null, feeText: '1~5kg 1만원' };
    const p = withPolicyFacts(parsePetPolicy(text), legacy, text);
    expect(p.feeLines).toEqual(['1~5kg 1만원', '6~10kg 1.5만원']);
  });

  /** 반대쪽: AI 가 다 읽었으면 정규식의 뭉친 문장은 숫자가 전부 덮여 빠진다 — 같은 요금이 두 번 보이지 않게. */
  it('숫자가 전부 덮인 정규식 줄은 버린다', () => {
    const text = '1마리당 2만원 추가, 청소비 5만원';
    const p = withPolicyFacts(
      parsePetPolicy(text),
      { ...facts, indoor: 'unknown' as const, leash: false, weightLimitKg: null, maxDogs: null, feeLines: ['1마리당 2만원', '청소비 5만원'] },
      text,
    );
    expect(p.feeLines).toEqual(['1마리당 2만원', '청소비 5만원']);
  });

  /** 새 판단은 요금을 구조(`fees`)로 들고 온다 — 줄은 label 이고, 정규식 줄은 섞이지 않는다(잔여 병합은 옛 판단만). */
  it('요금 구조가 있으면 label 이 요금 줄이 되고 feeRules 로 실린다', () => {
    const text = '19kg 이하 1마리당 20,000원\n20kg 이상 1마리당 30,000원';
    const fees = [
      { label: '19kg 이하 1마리당 2만원', amountWon: 20000, basis: 'perDog' as const, minKg: null, maxKg: 19, fromDog: null, perNight: false },
      { label: '20kg 이상 1마리당 3만원', amountWon: 30000, basis: 'perDog' as const, minKg: 20, maxKg: null, fromDog: null, perNight: false },
    ];
    const p = withPolicyFacts(parsePetPolicy(text), { ...facts, indoor: 'unknown', leash: false, weightLimitKg: null, maxDogs: null, fees }, text);
    expect(p.feeLines).toEqual(['19kg 이하 1마리당 2만원', '20kg 이상 1마리당 3만원']);
    expect(p.feeRules).toEqual(fees);
  });

  it('요금 구조가 빈 배열이면 "요금 없음" 이다 — 정규식 요금 줄을 되살리지 않는다', () => {
    const text = '1박 15만원부터, 애견동반 가능';
    const p = withPolicyFacts(parsePetPolicy(text), { ...facts, indoor: 'unknown', leash: false, weightLimitKg: null, maxDogs: null, fees: [] }, text);
    expect(p.feeLines).toEqual([]);
    expect(p.feeRules).toBeUndefined();
  });

  /** 요금 줄만 읽은 원문이 `unread` 로 떨어지면 판정이 C7("원문을 확인해 주세요")이 된다 — `anyFact` 가 요금 목록을 세야 한다. */
  it('요금 줄만 읽어도 못 읽은 것이 아니다', () => {
    const text = '강아지는 1마리당 2만원이에요';
    const p = withPolicyFacts(
      parsePetPolicy(text),
      { ...facts, indoor: 'unknown', leash: false, weightLimitKg: null, maxDogs: null, feeLines: ['1마리당 2만원'] },
      text,
    );
    expect(p.unread).toBe(false);
    expect(p.noInfo).toBe(false);
  });

  it('AI 가 notes 만 남겼으면 원문 확인으로 보낸다 — 일반 허용 문장처럼 보여도', () => {
    const text = '반려동물 출입가능\n예방접종을 완료한 강아지와 고양이만 출입 가능해서 방문 전 예방접종 여부를 꼭 확인해주세요';
    const p = withPolicyFacts(
      parsePetPolicy(text),
      { ...facts, indoor: 'unknown', leash: false, weightLimitKg: null, maxDogs: null, notes: '예방접종 완료 여부를 방문 전 확인 필요' },
      text,
    );
    expect(p.unread).toBe(true);
  });

  it("AI 가 '예방접종 필수' 를 읽으면 배지가 서고 못 읽은 원문이 아니다 — 같은 솔옆수 원문", () => {
    const text = '반려동물 출입가능\n예방접종을 완료한 강아지와 고양이만 출입 가능해서 방문 전 예방접종 여부를 꼭 확인해주세요';
    const p = withPolicyFacts(
      parsePetPolicy(text),
      { ...facts, indoor: 'unknown', leash: false, weightLimitKg: null, maxDogs: null, vaccineRequired: true },
      text,
    );
    expect(p.vaccineRequired).toBe(true);
    expect(p.unread).toBe(false);
    expect(p.sources.vaccineRequired).toBe('예방접종을 완료한 강아지와 고양이만 출입 가능해서 방문 전 예방접종 여부를 꼭 확인해주세요');
    expect(toPetBadges(p)).toContainEqual({ label: '예방접종 필수', tone: 'cond', axis: 'limit' });
  });

  it('근거 문장은 보정과 같은 단어로 고른다 — "항체" 만 있는 원문에서도 첫 줄이 아니라 그 줄', () => {
    const text = '마당에서 자유롭게 뛰어놀 수 있어요\n항체 검사 완료견만 입장 가능합니다';
    const p = withPolicyFacts(parsePetPolicy(text), { ...facts, indoor: 'unknown', leash: false, weightLimitKg: null, maxDogs: null, vaccineRequired: true }, text);
    expect(p.vaccineRequired).toBe(true);
    expect(p.sources.vaccineRequired).toBe('항체 검사 완료견만 입장 가능합니다');
  });

  it('정규식은 예방접종 필수를 세우지 않는다 — AI 판단만 이 칸을 채운다(ADR-017 v6)', () => {
    expect(parsePetPolicy('예방접종 완료견만 입장 가능').vaccineRequired).toBe(false);
  });

  it("AI 가 '요금 있음' 만 읽으면 '추가요금 있음' 배지가 된다 — 판단이 화면에서 사라지지 않게", () => {
    const text = '강아지 동반 시 추가 요금이 있어요';
    const p = withPolicyFacts(parsePetPolicy(text), { ...facts, indoor: 'unknown', leash: false, weightLimitKg: null, maxDogs: null, feeFree: false }, text);
    expect(p.feeCharged).toBe(true);
    expect(toPetBadges(p).map((b) => b.label)).toContain('추가요금 있음');
    expect(p.unread).toBe(false);
  });
});
