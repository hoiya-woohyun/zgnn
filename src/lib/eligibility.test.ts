import { describe, expect, it } from 'vitest';
import { compareEligibility, dogSize, headlineFor, judgeEligibility, primaryReason, verdictFor } from './eligibility';
import { parsePetPolicy } from './petPolicy';
import { PLACES } from './places';
import type { TDogProfile } from '../types';

// 리뷰 §1 의 세 프로필. 실제 실사 표(사람 판단)와 비교하는 집계 테스트에도 그대로 쓴다.
const TOFU: TDogProfile = { dogs: [{ name: '두부', weightKg: 4 }], carrier: 'bag' };
const BORI_AND_KONG: TDogProfile = { dogs: [{ name: '보리', weightKg: 28 }, { name: '콩', weightKg: 17 }], carrier: 'none' };
const KONG: TDogProfile = { dogs: [{ name: '콩', weightKg: 17 }], carrier: 'cage' };

const findPlace = (name: string) => {
  const place = PLACES.find((p) => p.name === name);
  if (!place) throw new Error(`${name} 을(를) places.json 에서 찾지 못했다`);
  return place;
};

describe('dogSize', () => {
  it('경계값: 10 은 중형, 25 는 중형, 25.1 은 대형', () => {
    expect(dogSize({ dogs: [{ name: '', weightKg: 10 }], carrier: 'none' })).toBe('medium');
    expect(dogSize({ dogs: [{ name: '', weightKg: 25 }], carrier: 'none' })).toBe('medium');
    expect(dogSize({ dogs: [{ name: '', weightKg: 25.1 }], carrier: 'none' })).toBe('large');
  });

  it('9.9 는 소형, 여러 마리면 최댓값 기준', () => {
    expect(dogSize({ dogs: [{ name: '', weightKg: 9.9 }], carrier: 'none' })).toBe('small');
    expect(dogSize(BORI_AND_KONG)).toBe('large'); // max(28,17) = 28
  });

  it('sizeOverride 가 있으면 무게 계산 대신 그 값을 쓴다', () => {
    expect(dogSize({ dogs: [{ name: '', weightKg: 28 }], carrier: 'none', sizeOverride: 'small' })).toBe('small');
  });
});

describe('judgeEligibility — 웨스티하우스(계단식 무게·마릿수)', () => {
  it('17kg 2마리는 어려움 — 20kg 미만 칸의 마릿수 상한(1마리)에 걸린다', () => {
    const place = findPlace('웨스티하우스');
    const dog: TDogProfile = { dogs: [{ name: '단비', weightKg: 17 }, { name: '솜', weightKg: 17 }], carrier: 'none' };
    const result = judgeEligibility(dog, place.policy);
    expect(result.level).toBe('hard');
    expect(result.reasons[0].text).toContain('20kg 미만은 1마리까지');
    expect(result.reasons[0].quote).toBe('20kg 미만(중형견)의 경우 최대 1마리 가능');
  });

  it('8kg 2마리는 가능 — 10kg 미만 칸(최대 2마리)에 들어간다', () => {
    const place = findPlace('웨스티하우스');
    const dog: TDogProfile = { dogs: [{ name: '단비', weightKg: 8 }, { name: '솜', weightKg: 8 }], carrier: 'none' };
    expect(judgeEligibility(dog, place.policy).level).toBe('ok');
  });

  it('8kg 3마리는 어려움 — 같은 칸이어도 마릿수(2마리)를 넘는다', () => {
    const place = findPlace('웨스티하우스');
    const dog: TDogProfile = { dogs: [{ name: '단비', weightKg: 8 }, { name: '솜', weightKg: 8 }, { name: '구름', weightKg: 8 }], carrier: 'none' };
    const result = judgeEligibility(dog, place.policy);
    expect(result.level).toBe('hard');
    expect(result.reasons[0].text).toContain('10kg 미만은 2마리까지');
  });
});

describe('judgeEligibility — 케이지 필수 식당("케이지 동반시 가능.")', () => {
  const place = findPlace('모닥식탁');

  it('두부(이동가방)는 조건부 — 케이지라 적혀 있어 확인이 필요하다', () => {
    const result = judgeEligibility(TOFU, place.policy);
    expect(result.level).toBe('cond');
    expect(result.reasons.some((r) => r.text.includes('이동가방도 되는지 확인'))).toBe(true);
  });

  it('보리+콩(이동 수단 없음, 대형견)은 어려움', () => {
    const result = judgeEligibility(BORI_AND_KONG, place.policy);
    expect(result.level).toBe('hard');
  });

  // 원래 브리프는 "콩(cage) → cond" 였으나, 규칙표(H5/C2/C3/C4)의 네 갈래는 carrier 값에 따라
  // 배타적이고 'cage' 는 그중 어느 갈래에도 안 걸린다 — 정확히 필요한 이동 수단을 들고 온
  // 경우까지 조건부로 만들면 케이지/이동가방을 구분한 의미가 없어진다. 그래서 'ok' 로 둔다
  // (advisor 검토로 확인 — 팀 리드 확인 필요, 보고서에 기재).
  it('콩(케이지 있음)은 가능 — 필요한 이동 수단을 정확히 갖췄다', () => {
    const result = judgeEligibility(KONG, place.policy);
    expect(result.level).toBe('ok');
  });
});

describe('judgeEligibility — 실내 케이지 · 실외 자유("무거버거")', () => {
  it('보리+콩은 조건부 — 야외 자리는 갈 수 있다', () => {
    const place = findPlace('무거버거');
    const result = judgeEligibility(BORI_AND_KONG, place.policy);
    expect(result.level).toBe('cond');
    expect(result.reasons.some((r) => r.text.includes('야외'))).toBe(true);
  });

  it('실내 자리가 꼭 필요하면(needsIndoor) 어려움으로 올라간다', () => {
    const place = findPlace('무거버거');
    const result = judgeEligibility(BORI_AND_KONG, place.policy, { needsIndoor: true });
    expect(result.level).toBe('hard');
  });
});

describe('judgeEligibility — 정보 없음 + 힌트("맘앤도그")', () => {
  it('정보 없음이지만 대형견 가능 문구가 info 로 남는다', () => {
    const place = findPlace('맘앤도그');
    const result = judgeEligibility(KONG, place.policy);
    expect(result.level).toBe('unknown');
    expect(result.reasons.some((r) => r.level === 'unknown')).toBe(true);
    const hint = result.reasons.find((r) => r.level === 'info' && r.text.includes('대형견'));
    expect(hint).toBeDefined();
  });
});

describe('judgeEligibility — 리뷰 반영 경계', () => {
  it('실내 케이지·실외 자유인 곳에 대형견 + 이동가방: 실내가 꼭 필요하면 어려움, 아니면 조건부', () => {
    const place = findPlace('무거버거');
    const dog: TDogProfile = { dogs: [{ name: '보리', weightKg: 28 }], carrier: 'bag' };
    expect(judgeEligibility(dog, place.policy).level).toBe('cond');
    expect(judgeEligibility(dog, place.policy, { needsIndoor: true }).level).toBe('hard');
  });

  it('케이지 필수 식당에 대형견·이동 수단 없음: 어려움 근거는 한 줄만(H4·H5 중복 없음)', () => {
    const place = findPlace('모닥식탁');
    const result = judgeEligibility(BORI_AND_KONG, place.policy);
    expect(result.level).toBe('hard');
    expect(result.reasons.filter((r) => r.level === 'hard')).toHaveLength(1);
  });

  it("'유모차 불가' 는 유모차 허용으로 읽지 않는다", () => {
    const policy = { ...findPlace('모닥식탁').policy, sources: { indoor: '실내는 유모차 불가, 케이지 동반시 가능' } };
    const dog: TDogProfile = { dogs: [{ name: '두부', weightKg: 4 }], carrier: 'stroller' };
    expect(judgeEligibility(dog, policy).level).toBe('cond');
  });

  it('몸무게 배열이 비어도 -Infinity 로 새지 않는다', () => {
    expect(dogSize({ dogs: [], carrier: 'none' })).toBe('small');
  });
});

describe('compareEligibility', () => {
  it('ok < cond < unknown < hard', () => {
    expect(compareEligibility('ok', 'cond')).toBeLessThan(0);
    expect(compareEligibility('cond', 'unknown')).toBeLessThan(0);
    expect(compareEligibility('unknown', 'hard')).toBeLessThan(0);
    expect(compareEligibility('hard', 'ok')).toBeGreaterThan(0);
    expect(compareEligibility('ok', 'ok')).toBe(0);
  });
});

describe('집계 — 보리+콩(28kg+17kg·이동 수단 없음) 실사 비교', () => {
  // 리뷰 문서(§1)의 사람 판단: 가능 9 / 조건부 30 / 어려움 42 / 정보 없음 5.
  // ±5 안이면 규칙표를 그대로 쓴다 — 벗어나면 억지로 맞추지 않고 보고서에 규칙별 표를 남긴다.
  it('시드 86곳 이상 전체 판정이 사람 판단 ±5 안에 들어온다', () => {
    const counts = { ok: 0, cond: 0, unknown: 0, hard: 0 };
    for (const place of PLACES) {
      counts[judgeEligibility(BORI_AND_KONG, place.policy).level]++;
    }
    // 운영자 화면(/admin)이 승인한 장소가 pull 되면 86 을 넘는다(ADR-018) — 시드는 그대로 남으니 하한만 못 박는다.
    expect(PLACES.length).toBeGreaterThanOrEqual(86);
    expect(counts.ok).toBeGreaterThanOrEqual(9 - 5);
    expect(counts.ok).toBeLessThanOrEqual(9 + 5);
    expect(counts.cond).toBeGreaterThanOrEqual(30 - 5);
    expect(counts.cond).toBeLessThanOrEqual(30 + 5);
    expect(counts.hard).toBeGreaterThanOrEqual(42 - 5);
    expect(counts.hard).toBeLessThanOrEqual(42 + 5);
    expect(counts.unknown).toBeGreaterThanOrEqual(5 - 5);
    expect(counts.unknown).toBeLessThanOrEqual(5 + 5);
  });
});

describe('judgeEligibility — 블로그에서 온 신규 장소(BUG-008)', () => {
  it("동반 조건이 비어 있으면 'unknown' — '갈 수 있어요' 가 아니다", () => {
    const result = judgeEligibility(TOFU, parsePetPolicy(''));
    expect(result.level).toBe('unknown');
    expect(result.reasons[0].text).toBe('동반 조건이 적혀 있지 않아요');
  });

  it("'애견동반은 안됩니다' 는 강아지 조건과 무관하게 'hard'", () => {
    const result = judgeEligibility(TOFU, parsePetPolicy('풍차해안도로와 가깝지만 애견동반은 아쉽게도 안됩니다'));
    expect(result.level).toBe('hard');
    expect(result.reasons[0].text).toBe('반려견 동반이 안 된다고 적혀 있어요');
  });
});

describe('judgeEligibility — 어려움 판정에는 요금을 싣지 않는다(그리너리빌리지)', () => {
  it('28·17kg 두 마리 → hard · fee 없음 · 요금 info 근거 없음', () => {
    const place = findPlace('그리너리빌리지 펜션');
    const dog: TDogProfile = { dogs: [{ name: '대장', weightKg: 28 }, { name: '초코', weightKg: 17 }], carrier: 'none' };
    const result = judgeEligibility(dog, parsePetPolicy(place.petPolicyText));
    expect(result.level).toBe('hard');
    expect(result.fee).toBeUndefined();
    expect(result.reasons.some((r) => r.level === 'info' && r.text.includes('만원'))).toBe(false);
  });
});

describe('judgeEligibility — C5 가 정보 없음·kg 요금 구간을 무시하지 않는다', () => {
  const BIG: TDogProfile = { dogs: [{ name: '대장', weightKg: 28 }], carrier: 'none' };

  it('"10kg 이상 4만원" 이 있으면 "언급이 없어요" 대신 그 요금을 짚는다(등급 cond)', () => {
    const result = judgeEligibility(BIG, parsePetPolicy('1마리당 3만원. (2마리 또는 10kg 이상 4만원)'));
    expect(result.level).toBe('cond');
    expect(result.reasons.some((r) => r.text.includes('10kg 이상'))).toBe(true);
    expect(result.reasons.some((r) => r.text.includes('언급이 없어요'))).toBe(false);
  });

  it('정보 없음이면 대형견 문구를 내지 않는다(등급 unknown)', () => {
    const result = judgeEligibility(BIG, parsePetPolicy('정보 없음. (문의해보시면 가장 정확할 것 같아요)'));
    expect(result.level).toBe('unknown');
    expect(result.reasons.some((r) => r.text.includes('대형견 언급'))).toBe(false);
  });

  it('솔숲펜션 — 구간 요금표 상한을 넘으면 "10kg 까지만" (등급 cond)', () => {
    const result = judgeEligibility(BIG, findPlace('솔숲펜션').policy);
    expect(result.level).toBe('cond');
    expect(result.reasons.some((r) => r.text.includes('10kg 까지만'))).toBe(true);
  });
});

describe('judgeEligibility — H1 근거에 한도를 넘는 강아지 이름을 적는다', () => {
  const policy = parsePetPolicy('최대 3마리까지 가능. (15kg까지)');
  const hardText = (dog: TDogProfile) => {
    const result = judgeEligibility(dog, policy);
    expect(result.level).toBe('hard');
    return result.reasons[0].text;
  };

  it('두 마리 다 넘으면 둘 다 적고 "모두"', () => {
    const dog: TDogProfile = { dogs: [{ name: '대장', weightKg: 28 }, { name: '초코', weightKg: 17 }], carrier: 'none' };
    expect(hardText(dog)).toBe('대장이(28kg)·초코(17kg) 모두 15kg 이하 조건을 넘어요');
  });

  it('한 마리만 넘으면 그 아이 이름만', () => {
    const dog: TDogProfile = { dogs: [{ name: '대장', weightKg: 28 }, { name: '초코', weightKg: 7 }], carrier: 'none' };
    const text = hardText(dog);
    expect(text).toBe('대장이(28kg)는 15kg 이하 조건을 넘어요');
    expect(text).not.toContain('초코');
  });

  it('한 마리 프로필', () => {
    const dog: TDogProfile = { dogs: [{ name: '초코', weightKg: 17 }], carrier: 'none' };
    expect(hardText(dog)).toBe('초코(17kg)는 15kg 이하 조건을 넘어요');
  });
});

describe('headlineFor — 머리글은 근거가 하나뿐일 때 근거를 따른다', () => {
  it('C1 단독이면 "야외 자리에서 갈 수 있어요" — 요금 info 는 세지 않는다', () => {
    const result = judgeEligibility(TOFU, parsePetPolicy('야외좌석만 가능.\n1마리당 1만원.'));
    expect(result.level).toBe('cond');
    expect(result.reasons.filter((r) => r.level === 'cond').map((r) => r.rule)).toEqual(['C1']);
    expect(result.reasons.some((r) => r.level === 'info')).toBe(true);
    expect(headlineFor(result)).toBe('야외 자리에서 갈 수 있어요');
  });

  it('C1 + C5 면 확인할 것이 남아 "확인이 필요해요"', () => {
    const big: TDogProfile = { dogs: [{ name: '대장', weightKg: 28 }], carrier: 'none' };
    const result = judgeEligibility(big, parsePetPolicy('야외좌석만 가능.'));
    expect(result.reasons.filter((r) => r.level === 'cond').map((r) => r.rule)).toEqual(['C1', 'C5']);
    expect(headlineFor(result)).toBe('확인이 필요해요');
  });

  it('C6 단독이면 "확인이 필요해요"(목록 배지와 같은 말)', () => {
    expect(
      headlineFor({ level: 'cond', reasons: [{ level: 'cond', text: '방문 전 전화 확인이 필요해요', rule: 'C6' }] }),
    ).toBe('확인이 필요해요');
  });

  it('ok · hard 는 레벨 머리글 그대로', () => {
    expect(headlineFor({ level: 'ok', reasons: [] })).toBe('갈 수 있어요');
    expect(headlineFor({ level: 'hard', reasons: [{ level: 'hard', text: '소형견만 가능해요', rule: 'H3' }] })).toBe(
      '이용하기 어려워요',
    );
  });
});

describe('primaryReason — 목록 카드의 근거 한 줄', () => {
  const BIG: TDogProfile = { dogs: [{ name: '대장', weightKg: 28 }], carrier: 'none' };

  it('ok 면 근거가 없다', () => {
    expect(primaryReason(judgeEligibility(TOFU, parsePetPolicy('1마리당 1만원.')))).toBeUndefined();
  });

  it('cond(C5) — 최종 레벨과 같은 레벨의 첫 근거', () => {
    const reason = primaryReason(judgeEligibility(BIG, parsePetPolicy('1마리당 3만원.')));
    expect(reason?.rule).toBe('C5');
    expect(reason?.text).toContain('대형견 언급이 없어요');
  });

  it('hard(H1) — 누가 넘는지 이름이 적힌 근거', () => {
    const dog: TDogProfile = { dogs: [{ name: '대장', weightKg: 28 }, { name: '초코', weightKg: 7 }], carrier: 'none' };
    const reason = primaryReason(judgeEligibility(dog, parsePetPolicy('최대 3마리까지 가능. (15kg까지)')));
    expect(reason?.rule).toBe('H1');
    expect(reason?.text).toBe('대장이(28kg)는 15kg 이하 조건을 넘어요');
  });

  it('unknown + 원문 힌트 — "적혀 있지 않아요" 대신 힌트(맘앤도그)', () => {
    const result = judgeEligibility(KONG, findPlace('맘앤도그').policy);
    expect(result.level).toBe('unknown');
    const reason = primaryReason(result);
    expect(reason?.level).toBe('info');
    expect(reason?.text).toContain('대형견');
  });

  it('unknown 인데 힌트가 없으면 unknown 근거', () => {
    const reason = primaryReason(judgeEligibility(BIG, parsePetPolicy('정보 없음.')));
    expect(reason?.level).toBe('unknown');
  });
});

describe('judgeEligibility — 대형견 불가(H7, todo/06 A-2)', () => {
  const LARGE: TDogProfile = { dogs: [{ name: '대장', weightKg: 28 }], carrier: 'none' };
  const MEDIUM: TDogProfile = { dogs: [{ name: '초코', weightKg: 17 }], carrier: 'none' };

  it("원문 '대형견은 어려워요' 는 대형견에게 어려움이다 — 전엔 '대형견 언급이 없어요'(확인 필요) 로 원문과 반대였다", () => {
    const policy = parsePetPolicy('대형견은 어려워요');
    const result = judgeEligibility(LARGE, policy);
    expect(result.level).toBe('hard');
    expect(result.reasons[0]).toMatchObject({ rule: 'H7', text: '대형견은 어렵다고 적혀 있어요', quote: '대형견은 어려워요' });
    expect(result.reasons.some((r) => r.rule === 'C5')).toBe(false);
  });

  it('중형견은 대형견 불가에 걸리지 않는다', () => {
    expect(judgeEligibility(MEDIUM, parsePetPolicy('대형견 입장 불가')).level).toBe('ok');
  });

  it("'대형견 제한 없음' 은 불가가 아니라 허용이다", () => {
    const policy = parsePetPolicy('대형견 제한 없음');
    expect(policy.largeDogNo).toBe(false);
  });
});

describe('judgeEligibility — 원문은 있는데 아무도 못 읽음(C7, todo/06 A-1)', () => {
  it("못 읽은 원문은 '갈 수 있어요' 가 아니라 확인이 필요하다", () => {
    const policy = parsePetPolicy('사장님 강아지들이랑 같이 뛰어놀 수 있어요');
    expect(policy.unread).toBe(true);
    const result = judgeEligibility(TOFU, policy);
    expect(result.level).toBe('cond');
    expect(primaryReason(result)).toMatchObject({ rule: 'C7' });
  });

  it("'애견동반 가능해요!' 처럼 일반 허용 문장만 있으면 읽은 것이다", () => {
    const policy = parsePetPolicy('애견동반 가능해요!');
    expect(policy.unread).toBe(false);
    expect(judgeEligibility(TOFU, policy).level).toBe('ok');
  });

  it('허용 문장에 제한을 암시하는 말(야외)이 섞이면 일반 허용으로 보지 않는다', () => {
    expect(parsePetPolicy('야외 좌석에서 동반 가능해요').unread).toBe(true);
  });

  it('예방접종 필수는 어려움이 아니라 확인이 필요하다(C8) — 프로필에 접종 칸이 없다', () => {
    const policy = { ...parsePetPolicy('예방접종 완료견만 입장 가능'), vaccineRequired: true, unread: false };
    const result = judgeEligibility(TOFU, policy);
    expect(result.level).toBe('cond');
    expect(primaryReason(result)).toMatchObject({ rule: 'C8' });
  });

  it('시드 86곳에는 못 읽은 원문이 없다 — 이 규칙이 지금 사이트의 판정을 바꾸지 않는다', () => {
    expect(PLACES.filter((p) => p.policy.unread || p.policy.largeDogNo).map((p) => p.name)).toEqual([]);
  });
});

describe('verdictFor — 정보 없음은 강아지가 아니라 장소가 주어다', () => {
  it('판정이 있으면 "이름은 머리글"', () => {
    expect(verdictFor(['보리'], { level: 'ok', reasons: [] })).toBe('보리는 갈 수 있어요');
  });

  it('unknown 이면 이름을 빼고 장소를 주어로 — 없는 판정을 한 것처럼 읽히지 않게', () => {
    const result = judgeEligibility(BORI_AND_KONG, parsePetPolicy('정보 없음. (문의해보시면 가장 정확할 것 같아요)'));
    expect(result.level).toBe('unknown');
    const verdict = verdictFor(['보리', '콩'], result);
    expect(verdict).toBe('이곳은 반려견 동반 조건이 공개돼 있지 않아요');
    expect(verdict).not.toContain('보리');
  });
});
