import { describe, expect, it } from 'vitest';
import {
  cardReasons,
  carrierSummary,
  compareEligibility,
  dogSize,
  headlineFor,
  judgeEligibility,
  primaryReason,
  reasonBadgeLabel,
  verdictFor,
  verdictHidesBadge,
  verdictLeadBadges,
  type TReason,
} from './eligibility';
import { NO_INFO_BADGE_LABEL, parsePetPolicy, toPetBadges, withPolicyFacts, withVerifiedAt } from './petPolicy';
import { PLACES } from './places';
import golden from '../../data/golden/seed-extract.json';
import type { TDogProfile, TPetPolicyFacts } from '../types';

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

describe('judgeEligibility — C2 는 원문이 이동가방을 적었으면 물러난다(14 W261006.4)', () => {
  it('카페스누피 "실내에서는 유모차/이동 가방 필요" — 두부(이동가방)는 갈 수 있어요', () => {
    const result = judgeEligibility(TOFU, findPlace('카페스누피').policy);
    expect(result.reasons.map((r) => r.rule)).not.toContain('C2');
    expect(result.level).toBe('ok');
  });

  it.each(['케이지 필수, 이동가방은 불가.', '케이지 필수, 이동가방은 안 돼요.', '케이지 필수, 가방 금지.'])(
    '"%s" — 거절은 허용이 아니다',
    (text) => {
      expect(judgeEligibility(TOFU, parsePetPolicy(text)).reasons.map((r) => r.rule)).toContain('C2');
    },
  );

  /*
   * 광복이네(블로그) — 실내 근거는 "…실내에서 식사할 수 있었어요" 이고 가방은 다음 문장 "짱아는 이동가방에 넣어 의자 위에 두었고요" 다(21 S5.2).
   * 사이트가 싣는 길(AI 판단 + 원문 대조) 그대로 본다 — 근거를 고르는 곳이 `withPolicyFacts` 라 정규식만 대 보면 통과해도 사이트는 틀릴 수 있다.
   */
  it('광복이네 — 근거 다음 문장의 이동가방을 읽어 C2 가 물러난다(전화 확인 C6 은 원문 그대로 남는다)', () => {
    const rules = judgeEligibility(TOFU, findPlace('광복이네').policy).reasons.map((r) => r.rule);
    expect(rules).not.toContain('C2');
    expect(rules).toContain('C6');
  });

  it('다음 문장의 거절도 허용이 아니다 · 그 다음 문장까지는 넓히지 않는다', () => {
    expect(judgeEligibility(TOFU, parsePetPolicy('실내는 케이지 필수. 가방은 안 돼요.')).reasons.map((r) => r.rule)).toContain('C2');
    expect(judgeEligibility(TOFU, parsePetPolicy('실내는 케이지 필수. 주차 가능. 이동가방도 돼요.')).reasons.map((r) => r.rule)).toContain('C2');
    expect(judgeEligibility(TOFU, parsePetPolicy('실내는 케이지 필수. 이동가방도 괜찮아요.')).reasons.map((r) => r.rule)).not.toContain('C2');
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

describe('케이지 규칙은 원문이 적은 수단을 칩과 같은 이름으로 부른다(14 W261013.14g)', () => {
  const small = (carrier: TDogProfile['carrier']): TDogProfile => ({ dogs: [{ name: '콩이', weightKg: 5 }], carrier });
  const large = (carrier: TDogProfile['carrier']): TDogProfile => ({ dogs: [{ name: '보리', weightKg: 30 }], carrier });
  const texts = (dog: TDogProfile, policy: ReturnType<typeof parsePetPolicy>) =>
    judgeEligibility(dog, policy).reasons.map((r) => r.text);
  const bagOnly = parsePetPolicy('실내는 이동가방 필수.');

  it('원문이 케이지면 H5 는 "케이지가 필요하다고 적혀 있어요" — 케이지가 유일한 길이라고 단정하지 않는다(가방이면 C2 가 확인을 권한다)', () => {
    const result = judgeEligibility(small('none'), parsePetPolicy('케이지 동반시 가능.'));
    expect(result.level).toBe('hard');
    expect(result.reasons.map((r) => r.text)).toEqual(['케이지가 필요하다고 적혀 있어요']);
  });

  it('카페스누피(유모차/이동 가방) × 이동 수단 없음 — C4 가 "실내는 케이지" 가 아니라 칩과 같은 말', () => {
    const { policy } = findPlace('카페스누피');
    const e = judgeEligibility(small('none'), policy);
    expect(e.reasons.map((r) => r.text)).toContain('실내는 이동가방이나 유모차, 야외는 자유예요');
    expect(toPetBadges(policy).map((b) => b.label)).toContain('이동가방·유모차 필요');
  });

  it('원문이 이동가방만 — H5·H4·C3 이 이동가방으로 부른다', () => {
    expect(texts(small('none'), bagOnly)).toEqual(['이동가방이 필요하다고 적혀 있어요']);
    expect(texts(large('none'), bagOnly)).toEqual(['실내는 이동가방 필수라 대형견은 어려워요']);
    expect(texts(small('stroller'), bagOnly)).toEqual(['이동가방이라고 적혀 있어요. 유모차도 되는지 확인해 주세요']);
  });

  it('원문이 유모차만 — 이동가방 강아지의 C2 는 "유모차라고 적혀 있어요"', () => {
    expect(texts(small('bag'), parsePetPolicy('실내는 유모차 필수.'))).toEqual([
      '유모차라고 적혀 있어요. 이동가방도 되는지 확인해 주세요',
    ]);
  });

  it('H4 의 "…이 없어" 는 이 아이에게 없는 것 — 가방 든 대형견에게 "이동가방이 없어" 라고 하지 않는다', () => {
    const welcomesLarge = { ...bagOnly, largeDogOk: true };
    expect(texts(large('none'), welcomesLarge)).toEqual(['이동가방이 없어 실내는 어려워요']);
    const withBag = texts(large('bag'), welcomesLarge).join(' / ');
    expect(withBag).toContain('케이지가 없어');
    expect(withBag).not.toContain('이동가방이 없어');
  });

  it('이유 줄이 수단을 말하면 같은 이름의 칩이 판정 옆 첫 자리에 선다(14 W261027.1 — 예전엔 빠졌다)', () => {
    const e = judgeEligibility(small('none'), bagOnly);
    expect(reasonBadgeLabel(e, bagOnly)).toBe('이동가방 필요');
    expect(verdictLeadBadges(e, bagOnly)).toEqual(['이동가방 필요']);
    const chips = toPetBadges(bagOnly).filter((badge) => !verdictHidesBadge(e, bagOnly, primaryReason(e))(badge));
    expect(chips.map((b) => b.label)).toContain('이동가방 필요');
  });
});

describe('judgeEligibility — 이유끼리·원문과 다투지 않는다(14 W261007.3)', () => {
  const BORI: TDogProfile = { dogs: [{ name: '보리', weightKg: 30 }], carrier: 'none' };

  it('"소형견에 한해" 면 H3 만 말하고 "대형견 언급이 없어요" 를 옆에 두지 않는다(부띠크풀빌라 나미브)', () => {
    const result = judgeEligibility(BORI, findPlace('부띠크풀빌라 나미브').policy);
    expect(result.level).toBe('hard');
    const texts = result.reasons.map((r) => r.text);
    expect(texts).toContain('소형견만 가능해요');
    expect(texts.some((t) => t.includes('대형견 언급이 없어요'))).toBe(false);
  });

  it('"(대형견도 환영)" 이면 막는 것은 크기가 아니라 케이지다(신창해물라면와랑식탁)', () => {
    const result = judgeEligibility(BORI, findPlace('신창해물라면와랑식탁').policy);
    expect(result.level).toBe('hard');
    const texts = result.reasons.map((r) => r.text);
    expect(texts).toContain('케이지가 없어 실내는 어려워요');
    expect(texts.some((t) => t.includes('대형견은'))).toBe(false);
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

describe('judgeEligibility — 정보 없음 + 조건 한 줄("맘앤도그", 14 W261006.3)', () => {
  it('읽힌 조건이 있으면 정보 없음이 아니다 — 대형견 OK 와 전화 확인(cond)', () => {
    const policy = findPlace('맘앤도그').policy;
    expect(policy.noInfo).toBe(false);
    expect(policy.largeDogOk).toBe(true);
    expect(policy.callFirst).toBe(true);
    const result = judgeEligibility(KONG, policy);
    expect(result.level).toBe('cond');
    expect(result.reasons.map((r) => r.rule)).toEqual(['C6']);
    const labels = toPetBadges(policy).map((b) => b.label);
    expect(labels).toContain('대형견 OK');
    expect(labels).not.toContain(NO_INFO_BADGE_LABEL);
  });

  it('조건 없이 "정보 없음 · 전화 문의" 뿐이면 그대로 정보 없음', () => {
    expect(judgeEligibility(KONG, parsePetPolicy('정보 없음. 전화 문의 주세요.')).level).toBe('unknown');
    expect(judgeEligibility(KONG, findPlace('제주애빛').policy).level).toBe('unknown');
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

  it('쇠소깍한끼 "강아지는 개모차, 가방 출입 가능" — 유모차 강아지는 갈 수 있어요(21 S5.1)', () => {
    const dog: TDogProfile = { dogs: [{ name: '두부', weightKg: 4 }], carrier: 'stroller' };
    const result = judgeEligibility(dog, parsePetPolicy('강아지는 개모차, 가방 출입 가능\n개모차, 혹은 가방 지참시 출입가능!'));
    expect(result.reasons.map((r) => r.rule)).not.toContain('C3');
    expect(result.level).toBe('ok');
  });

  it("'개모차 불가' 도 유모차 허용으로 읽지 않는다", () => {
    const dog: TDogProfile = { dogs: [{ name: '두부', weightKg: 4 }], carrier: 'stroller' };
    expect(judgeEligibility(dog, parsePetPolicy('케이지 필수, 개모차는 불가.')).reasons.map((r) => r.rule)).toContain('C3');
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

/**
 * 시드 장소 — 사람이 같은 글을 읽고 정답을 적은 86곳(`data/golden/seed-extract.json`) 중 지금 게시된 곳. 정규식 파서와 사람 판단 표는
 * 이 집합에서 나왔다. 블로그로 들어온 곳(AI 판단 경로, 2026-10-08 38곳)은 원문에 실내 언급이 없는 일이 흔해 같은 기대를 걸 수 없다.
 * `petPolicy` 유무로 고르지 않는 것은 운영자 편집이 시드 행에도 그 칸을 쓸 수 있어서다 — 집합이 조용히 줄면 아래 84 가 잡는다.
 */
const SEED_IDS = new Set(golden.entries.map((entry) => entry.placeId));
const SEED_PLACES = PLACES.filter((place) => SEED_IDS.has(place.id));

describe('집계 — 보리+콩(28kg+17kg·이동 수단 없음) 실사 비교', () => {
  // 리뷰 문서(§1)의 사람 판단: 가능 9 / 조건부 30 / 어려움 42 / 정보 없음 5.
  // ±5 안이면 규칙표를 그대로 쓴다 — 벗어나면 억지로 맞추지 않고 보고서에 규칙별 표를 남긴다.
  // 사람 판단은 시드 86곳을 본 것이라 시드끼리만 견준다 — 블로그 곳이 들어온 뒤(2026-10-08 122곳) 전체로 세면 어려움이 56 이 되어 표와 무관하게 깨졌다.
  it('시드 장소 판정이 사람 판단 ±5 안에 들어온다', () => {
    const counts = { ok: 0, cond: 0, unknown: 0, hard: 0 };
    for (const place of SEED_PLACES) {
      counts[judgeEligibility(BORI_AND_KONG, place.policy).level]++;
    }
    // 내리면(archived) 준다 — 2026-10-06 개떼목장·롯지먼트를 내려 84. 더 줄면 사람 판단 표와 함께 본다.
    expect(SEED_PLACES).toHaveLength(84);
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
    const result = judgeEligibility(dog, parsePetPolicy(place.publicPolicyText!));
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

  it('마릿수만 적힌 곳("최대 2마리")도 대형견에겐 "언급이 없어요" 다 — 원문에서도, AI 판단에서도', () => {
    const fromText = judgeEligibility(BIG, parsePetPolicy('최대 2마리까지 가능해요.'));
    expect(fromText.level).toBe('cond');
    expect(fromText.reasons.some((r) => r.rule === 'C5')).toBe(true);

    const facts = { indoor: 'free', leash: false, largeDogOk: null, smallDogOnly: false, callFirst: false, vaccineRequired: false, feeFree: null, fees: [], weightLimitKg: null, maxDogs: 2, notes: null } as unknown as TPetPolicyFacts;
    const fromFacts = judgeEligibility(BIG, withPolicyFacts(parsePetPolicy('최대 2마리까지 가능해요.'), facts));
    expect(fromFacts.reasons.some((r) => r.rule === 'C5')).toBe(true);
  });

  it('솔숲펜션 — 구간 요금표 상한을 넘으면 C10 이 말하고 C5 는 물러난다(등급 cond)', () => {
    const result = judgeEligibility(BIG, findPlace('솔숲펜션').policy);
    expect(result.level).toBe('cond');
    expect(result.reasons.map((r) => r.rule)).toContain('C10');
    expect(result.reasons.map((r) => r.rule)).not.toContain('C5');
  });
});

describe('judgeEligibility — C10 요금표 상한 밖 몸무게(14 W261006.1)', () => {
  const dogOf = (...kgs: number[]): TDogProfile => ({
    dogs: kgs.map((weightKg, i) => ({ name: ['콩이', '해피'][i], weightKg })),
    carrier: 'none',
  });
  const solsup = () => findPlace('솔숲펜션').policy;

  it.each([12, 20])('솔숲펜션 %ikg — 크기와 무관하게 "10kg 초과 요금" 으로 확인', (kg) => {
    const result = judgeEligibility(dogOf(kg), solsup());
    expect(result.level).toBe('cond');
    const c10 = result.reasons.find((r) => r.rule === 'C10');
    expect(c10?.text).toBe(`10kg 초과 요금이 적혀 있지 않아요. 콩이(${kg}kg)도 되는지 확인해 주세요`);
  });

  it('표 안이면 걸리지 않는다(8kg → ok + 요금 줄)', () => {
    const result = judgeEligibility(dogOf(8), solsup());
    expect(result.level).toBe('ok');
    expect(result.fee).toContain('1.5만원');
  });

  it('다두면 넘는 아이만 이름을 적는다', () => {
    const c10 = judgeEligibility(dogOf(4, 12), solsup()).reasons.find((r) => r.rule === 'C10');
    expect(c10?.text).toContain('해피(12kg)');
    expect(c10?.text).not.toContain('콩이');
  });

  it.each(['1~9kg 2만원.\n10kg 이상 4만원.', '1~5kg 1만원.\n1마리당 2만원.'])('위로 열린 요금표("%s")에는 상한이 없다', (text) => {
    const result = judgeEligibility(dogOf(20), parsePetPolicy(text));
    expect(result.reasons.map((r) => r.rule)).not.toContain('C10');
  });

  it('무게 상한(H1)이 어려움으로 말하면 요금표 얘기를 덧붙이지 않는다', () => {
    const result = judgeEligibility(dogOf(20), parsePetPolicy('15kg 이하만 가능.\n1~5kg 1만원.\n6~10kg 1.5만원.'));
    expect(result.level).toBe('hard');
    expect(result.reasons.map((r) => r.rule)).not.toContain('C10');
  });

  it('상한 안에 들지만 요금표를 넘으면 C10(15kg 이하 · 표는 10kg 까지 · 12kg)', () => {
    const result = judgeEligibility(dogOf(12), parsePetPolicy('15kg 이하만 가능.\n1~5kg 1만원.\n6~10kg 1.5만원.'));
    expect(result.reasons.map((r) => r.rule)).toContain('C10');
  });

  it('요금 구조(feeRules)가 모두 상한 있는 마리당 줄이면 그 끝을 본다', () => {
    const rule = (maxKg: number | null) =>
      ({ label: '', amountWon: 10000, basis: 'perDog', minKg: 1, maxKg, fromDog: null, perNight: false }) as const;
    const base = parsePetPolicy('1~5kg 1만원.\n6~10kg 1.5만원.');
    const closed = judgeEligibility(dogOf(12), { ...base, feeRules: [rule(5), rule(10)] });
    expect(closed.reasons.map((r) => r.rule)).toContain('C10');
    const open = judgeEligibility(dogOf(12), { ...base, feeRules: [rule(5), rule(null)] });
    expect(open.reasons.map((r) => r.rule)).not.toContain('C10');
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

describe('judgeEligibility — 몸무게가 무게 상한 바로 밑이면 그렇다고 말한다(I2, 14 W261010.33r)', () => {
  const dogs = (...weights: number[]): TDogProfile => ({
    dogs: weights.map((weightKg, i) => ({ name: ['보리', '콩'][i], weightKg })),
    carrier: 'none',
  });
  const near = (dog: TDogProfile, name: string) => judgeEligibility(dog, findPlace(name).policy).reasons.find((r) => r.rule === 'I2');
  const card = (dog: TDogProfile, name: string) => {
    const { policy } = findPlace(name);
    const e = judgeEligibility(dog, policy);
    const reason = primaryReason(e);
    const chips = toPetBadges(policy).filter((badge) => !verdictHidesBadge(e, policy, reason)(badge)).map((badge) => badge.label);
    return { e, reason, chips, lead: reasonBadgeLabel(e, policy) };
  };

  it('선흘안(13kg 미만) × 12.5kg — 판정은 그대로 갈 수 있어요, 카드 이유 줄이 남은 무게를 말하고 같은 말인 칩은 빠진다', () => {
    const { e, reason, chips, lead } = card(dogs(12.5), '선흘안');
    expect(e.level).toBe('ok');
    expect(reason).toMatchObject({ rule: 'I2', level: 'info', text: '보리(12.5kg)는 13kg 미만까지 0.5kg 남았어요' });
    expect(chips).not.toContain('13kg 미만');
    // 이유 줄이 없는 카드(근처 장소)는 같은 칩을 앞에 세운다.
    expect(lead).toBe('13kg 미만');
  });

  it('문턱은 1kg — 끝값(12kg)은 들고 11.9kg 는 빠진다', () => {
    expect(near(dogs(12), '선흘안')?.text).toBe('보리(12kg)는 13kg 미만까지 1kg 남았어요');
    expect(near(dogs(11.9), '선흘안')).toBeUndefined();
  });

  it('작은 개 제한은 한도의 10% — 5kg 이하에 4.5kg 는 들고 4.4kg 는 빠진다', () => {
    expect(near(dogs(4.5), '그리너리빌리지 펜션')?.text).toBe('보리(4.5kg)는 5kg 이하까지 0.5kg 남았어요');
    expect(near(dogs(4.4), '그리너리빌리지 펜션')).toBeUndefined();
  });

  it('한도와 같으면 판정과 같은 방향으로 — "여유가 없어요" 는 \'갈 수 있어요\' 옆에서 거절로 읽혔다(14 W261019.10), 같은 말인 칩은 그래도 빠진다', () => {
    expect(near(dogs(5), '그리너리빌리지 펜션')?.text).toBe('보리(5kg)는 5kg 이하에 딱 맞아요. 늘면 어려워요');
    const { e, reason, chips, lead } = card(dogs(7), '스테이다랑쉬');
    expect(e.level).toBe('ok');
    expect(reason?.text).toBe('보리(7kg)는 7kg 이하에 딱 맞아요. 늘면 어려워요');
    expect(lead).toBe('7kg 이하');
    expect(chips).not.toContain('7kg 이하');
  });

  it('남은 무게는 소수 한 자리 — 10 − 9.7 을 0.3000000000000007 로 쓰지 않는다', () => {
    const e = judgeEligibility(dogs(9.7), parsePetPolicy('10kg 미만 2마리까지 가능.'));
    expect(e.reasons.find((r) => r.rule === 'I2')?.text).toBe('보리(9.7kg)는 10kg 미만까지 0.3kg 남았어요');
  });

  it('웨스티하우스 — 경계는 우리를 받아 주는 구간이다: 9.5kg 한 마리는 20kg 구간이라 멀고, 두 마리면 10kg 구간이라 바로 밑', () => {
    expect(near(dogs(9.5), '웨스티하우스')).toBeUndefined();
    const { e, reason, chips } = card(dogs(9.5, 3), '웨스티하우스');
    expect(e.level).toBe('ok');
    expect(reason?.text).toBe('보리(9.5kg)는 10kg 미만까지 0.5kg 남았어요');
    // 줄이 말한 구간의 칩만 빠진다 — '20kg 미만 1마리' 는 다른 구간이라 남는다.
    expect(chips).not.toContain('10kg 미만 2마리');
    expect(chips).toContain('20kg 미만 1마리');
  });

  it('여러 마리면 가장 무거운 아이만 부른다', () => {
    const text = near(dogs(12.5, 12.2), '선흘안')?.text;
    expect(text).toBe('보리(12.5kg)는 13kg 미만까지 0.5kg 남았어요');
    expect(text).not.toContain('콩');
  });

  it('확인이 필요한 곳은 판정을 정한 근거가 카드 줄이고, 몸무게 줄은 상세 근거 목록에 함께 선다', () => {
    const e = judgeEligibility(dogs(4.5), findPlace('그리너리빌리지 펜션').policy);
    expect(e.level).toBe('cond');
    expect(primaryReason(e)?.rule).toBe('C6');
    expect(e.reasons.map((r) => r.rule)).toEqual(['C6', 'I2', 'I1']);
  });

  it('어려움이면 싣지 않는다 — 못 간다는 곳에 남은 무게는 소음이다', () => {
    const e = judgeEligibility(dogs(12.5), parsePetPolicy('13kg 미만 2마리까지 가능. 실내는 케이지 필수.'));
    expect(e.level).toBe('hard');
    expect(e.reasons.some((r) => r.rule === 'I2')).toBe(false);
  });

  it('무게 상한이 없는 곳에는 걸지 않는다', () => {
    expect(judgeEligibility(dogs(12.5), parsePetPolicy('1마리당 1만원.')).reasons.some((r) => r.rule === 'I2')).toBe(false);
  });
});

describe('headlineFor — 머리글은 근거가 같은 말을 할 때 근거를 따른다', () => {
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

  // 14 W261007.2 — 무거버거("실내 케이지 필수. 실외 자유", C4)와 부부키친("바깥 하우스 자리만", C1)은
  // 이동 수단 없는 아이에게 같은 답인데 하나는 "확인이 필요해요" 였다.
  it('C4 단독(이동 수단 없음 · 실내 케이지 · 야외 자유)도 "야외 자리에서 갈 수 있어요"', () => {
    const small: TDogProfile = { dogs: [{ name: '두부', weightKg: 4 }], carrier: 'none' };
    const result = judgeEligibility(small, findPlace('무거버거').policy);
    expect(result.reasons.filter((r) => r.level === 'cond').map((r) => r.rule)).toEqual(['C4']);
    expect(headlineFor(result)).toBe('야외 자리에서 갈 수 있어요');
  });

  it('대형견 · 이동 수단 없음이면 H4·C4 가 같은 말을 둘이 한다 — 전부 야외 자리 규칙이라 같은 머리글', () => {
    const big: TDogProfile = { dogs: [{ name: '보리', weightKg: 28 }], carrier: 'none' };
    const result = judgeEligibility(big, findPlace('무거버거').policy);
    expect(result.reasons.filter((r) => r.level === 'cond').map((r) => r.rule)).toEqual(['H4', 'C4']);
    expect(headlineFor(result)).toBe('야외 자리에서 갈 수 있어요');
  });

  it('이동가방이면 C2(가방도 되는지 확인)가 남아 "확인이 필요해요"', () => {
    const bag: TDogProfile = { dogs: [{ name: '두부', weightKg: 4 }], carrier: 'bag' };
    const result = judgeEligibility(bag, parsePetPolicy('실내 케이지 필수. 실외 자유.'));
    expect(result.reasons.some((r) => r.rule === 'C2')).toBe(true);
    expect(headlineFor(result)).toBe('확인이 필요해요');
  });

  it('C4 + C6(전화 확인)이면 "확인이 필요해요"', () => {
    const result = headlineFor({
      level: 'cond',
      reasons: [
        { level: 'cond', text: '실내는 케이지, 야외는 자유예요', rule: 'C4' },
        { level: 'cond', text: '방문 전 전화 확인이 필요해요', rule: 'C6' },
      ],
    });
    expect(result).toBe('확인이 필요해요');
  });

  it('실내 자리가 꼭 필요하면 C4 가 어려움이라 "이용하기 어려워요"', () => {
    const small: TDogProfile = { dogs: [{ name: '두부', weightKg: 4 }], carrier: 'none' };
    const result = judgeEligibility(small, findPlace('무거버거').policy, { needsIndoor: true });
    expect(result.level).toBe('hard');
    expect(headlineFor(result)).toBe('이용하기 어려워요');
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

  it('unknown 이면 unknown 근거(U1)', () => {
    const reason = primaryReason(judgeEligibility(BIG, parsePetPolicy('정보 없음.')));
    expect(reason?.level).toBe('unknown');
  });

  it('"확인이 필요해요" 면 판정을 정한 근거 — 앞에 선 야외 자리(C1)가 아니라 그 뒤의 C5', () => {
    const result = judgeEligibility(BIG, parsePetPolicy('야외좌석만 가능.'));
    expect(result.reasons.filter((r) => r.level === 'cond').map((r) => r.rule)).toEqual(['C1', 'C5']);
    expect(primaryReason(result)?.rule).toBe('C5');
  });

  it('"야외 자리에서 갈 수 있어요" 면 C1 은 머리글을 되풀이할 뿐이라 줄이 없다', () => {
    expect(primaryReason(judgeEligibility(TOFU, parsePetPolicy('야외좌석만 가능.')))).toBeUndefined();
  });

  it('야외 자리 머리글이어도 H4·C4 는 왜 야외만인지 더 말해서 남는다(무거버거)', () => {
    const small: TDogProfile = { dogs: [{ name: '두부', weightKg: 4 }], carrier: 'none' };
    expect(primaryReason(judgeEligibility(small, findPlace('무거버거').policy))?.rule).toBe('C4');
    expect(primaryReason(judgeEligibility(BIG, findPlace('무거버거').policy))?.rule).toBe('H4');
  });
});

/**
 * 카드(목록·지도 시트)가 그리는 것 — 판정 배지 · 이유 줄 · 원문 칩. 사용성 평가 10-13 이 짚은 실제 장소 그대로다(14 W261013.1).
 * `drawn` 은 카드가 실제로 그린 이유 줄 — 목록 머리가 같은 문장을 말해 줄을 뺀 카드는 undefined 를 넘긴다(`hideReasonText`).
 */
describe('카드의 이유 줄과 칩이 판정과 같은 말을 한 번 한다(14 W261013.1)', () => {
  const card = (dog: TDogProfile, name: string, drawn?: (reason: TReason | undefined) => TReason | undefined) => {
    const { policy } = findPlace(name);
    const e = judgeEligibility(dog, policy);
    const primary = primaryReason(e);
    const reason = drawn ? drawn(primary) : primary;
    const chips = toPetBadges(policy).filter((badge) => !verdictHidesBadge(e, policy, reason)(badge)).map((badge) => badge.label);
    return { level: e.level, headline: headlineFor(e), reason, chips, lead: verdictLeadBadges(e, policy) };
  };

  it('웨스티하우스 × 콩 2.5kg·해피 12kg — 어려움 옆에 "✓ 중형견 OK" 는 안 서고, 이유 줄과 같은 구간 칩 "20kg 미만 1마리" 가 맨 앞이다', () => {
    const junhyuk: TDogProfile = { dogs: [{ name: '콩', weightKg: 2.5 }, { name: '해피', weightKg: 12 }], carrier: 'stroller' };
    const { level, reason, chips, lead } = card(junhyuk, '웨스티하우스');
    expect(level).toBe('hard');
    expect(reason?.text).toBe('20kg 미만은 1마리까지예요');
    expect(chips).not.toContain('중형견 OK');
    // 14 W261027.1 — 예전엔 줄과 같은 말이라 뺐더니 남은 '10kg 미만 2마리' 가 판정 옆에서 이유로 읽혔다(성호·준혁).
    expect(lead).toEqual(['20kg 미만 1마리']);
    // 다른 구간은 뒤에 남는다(14 W261013.1b — 접힌 '최대 2마리' 는 이제 없다).
    expect(chips).toContain('10kg 미만 2마리');
  });

  it('웨스티하우스 × 4kg 한 마리 — 갈 수 있으면 "✓ 중형견 OK" 와 구간 칩 둘이 그대로', () => {
    const { level, chips } = card(TOFU, '웨스티하우스');
    expect(level).toBe('ok');
    expect(chips).toContain('중형견 OK');
    expect(chips).toEqual(expect.arrayContaining(['10kg 미만 2마리', '20kg 미만 1마리']));
  });

  it('웨스티하우스 × 28kg — H1 "20kg 미만 조건을 넘어요" 옆엔 가장 넓은 구간 칩이 맨 앞, 좁은 구간은 뒤', () => {
    const big: TDogProfile = { dogs: [{ name: '대장', weightKg: 28 }], carrier: 'none' };
    const { reason, chips, lead } = card(big, '웨스티하우스');
    expect(reason?.rule).toBe('H1');
    expect(lead).toEqual(['20kg 미만 1마리']);
    expect(chips).toEqual(expect.arrayContaining(['20kg 미만 1마리', '10kg 미만 2마리']));
  });

  it('무히어 × 모카 8kg — 이유 줄은 판정을 정한 예방접종, 판정 옆 첫 칩도 "예방접종 필수"(14 W261027.1), "야외만" 은 그 뒤', () => {
    const moka: TDogProfile = { dogs: [{ name: '모카', weightKg: 8 }], carrier: 'none' };
    const { headline, reason, chips, lead } = card(moka, '무히어');
    expect(headline).toBe('확인이 필요해요');
    expect(reason?.rule).toBe('C8');
    expect(lead).toEqual(['예방접종 필수']);
    expect(chips).toEqual(expect.arrayContaining(['야외만', '예방접종 필수']));
  });

  it('정체불명 × 콩이 5kg 이동가방 — "확인이 필요해요" 옆에 "✓ 실내 OK" 가 안 서고, 판정 옆은 이유 줄과 같은 "전화 확인"', () => {
    const youngja: TDogProfile = { dogs: [{ name: '콩이', weightKg: 5 }], carrier: 'bag' };
    const { headline, reason, chips, lead } = card(youngja, '정체불명');
    expect(headline).toBe('확인이 필요해요');
    expect(reason?.text).toBe('방문 전 전화 확인이 필요해요');
    expect(chips).toEqual(['전화 확인']);
    expect(lead).toEqual(['전화 확인']);
  });

  it('목록 머리가 이유를 말해 줄을 뺀 카드는 칩이 유일한 단서라 남긴다', () => {
    const youngja: TDogProfile = { dogs: [{ name: '콩이', weightKg: 5 }], carrier: 'bag' };
    expect(card(youngja, '정체불명', () => undefined).chips).toEqual(['전화 확인']);
  });

  it('야외 자리만 되는 곳(부부키친) — 머리글이 말하므로 이유 줄도 "야외만" 칩도 없다: 카드 한 장에 "야외" 가 한 번', () => {
    const { headline, reason, chips } = card(TOFU, '부부키친');
    expect(headline).toBe('야외 자리에서 갈 수 있어요');
    expect(reason).toBeUndefined();
    expect(chips).not.toContain('야외만');
  });

  it('야외 자리 머리글(무거버거 C4) — 이유 줄 "실내는 케이지 …" 와 같은 "케이지 필요" 칩은 빠진다', () => {
    const small: TDogProfile = { dogs: [{ name: '두부', weightKg: 4 }], carrier: 'none' };
    const { reason, chips } = card(small, '무거버거');
    expect(reason?.rule).toBe('C4');
    expect(chips).not.toContain('케이지 필요');
  });

  // 14 W261013.1a — 판정이 요금을 싣지 않는 곳(`fee` 없음)에서 칩이 혼자 요금을 말하지 않는다.
  const junhyuk: TDogProfile = { dogs: [{ name: '콩', weightKg: 2.5 }, { name: '해피', weightKg: 12 }], carrier: 'stroller' };
  const feeChips = (name: string) => toPetBadges(findPlace(name).policy).filter((b) => b.axis === 'fee').map((b) => b.label);

  it('웨스티하우스 × 콩·해피 — 어려움이면 요금 칩("1마리당 1~2만원")이 안 선다, 판정도 요금을 안 싣는다', () => {
    expect(feeChips('웨스티하우스').length).toBeGreaterThan(0);
    const { level, chips } = card(junhyuk, '웨스티하우스');
    expect(level).toBe('hard');
    expect(judgeEligibility(junhyuk, findPlace('웨스티하우스').policy).fee).toBeUndefined();
    for (const fee of feeChips('웨스티하우스')) expect(chips).not.toContain(fee);
  });

  it('웨스티하우스 × 4kg 한 마리 — 갈 수 있으면 요금 칩은 그대로', () => {
    const { chips } = card(TOFU, '웨스티하우스');
    for (const fee of feeChips('웨스티하우스')) expect(chips).toContain(fee);
  });

  it('근처 장소 카드(이유 줄 없음) — 어려움 웨스티하우스는 "✓ 중형견 OK" 도 요금도 없이 구간 칩만', () => {
    const { chips } = card(junhyuk, '웨스티하우스', () => undefined);
    expect(chips).toEqual(['10kg 미만 2마리', '20kg 미만 1마리']);
  });

  // 14 W261013.1c — 이유 줄 없는 카드는 칩 한 자리가 이유로 읽힌다. 그 자리에 설 칩은 판정을 정한 근거와 같은 말이다.
  const lead = (dog: TDogProfile, name: string) => {
    const { policy } = findPlace(name);
    return reasonBadgeLabel(judgeEligibility(dog, policy), policy);
  };

  it('웨스티하우스 × 콩·해피 — 맨 앞 칩은 판정을 정한 구간 "20kg 미만 1마리"(가장 낮은 구간 "10kg 미만 2마리" 가 아니다)', () => {
    expect(lead(junhyuk, '웨스티하우스')).toBe('20kg 미만 1마리');
  });

  it('웨스티하우스 × 28kg — H1 도 그 문장이 말한 가장 넓은 구간 칩', () => {
    expect(lead({ dogs: [{ name: '대장', weightKg: 28 }], carrier: 'none' }, '웨스티하우스')).toBe('20kg 미만 1마리');
  });

  it('갈 수 있으면 앞세울 칩이 없다 · 확인 필요(무히어 C8)는 그 근거 칩', () => {
    expect(lead(TOFU, '웨스티하우스')).toBeUndefined();
    expect(lead({ dogs: [{ name: '모카', weightKg: 8 }], carrier: 'none' }, '무히어')).toBe('예방접종 필수');
  });
});

describe('어려움 카드 첫 줄 칩이 그 판정의 이유를 말한다(14 W261027.1)', () => {
  const junhyuk: TDogProfile = { dogs: [{ name: '콩이', weightKg: 2.5 }, { name: '해피', weightKg: 12 }], carrier: 'stroller' };
  const view = (dog: TDogProfile, name: string) => {
    const { policy } = findPlace(name);
    const e = judgeEligibility(dog, policy);
    return { e, lead: verdictLeadBadges(e, policy), lines: cardReasons(e).map((r) => r.text) };
  };

  it('그리너리빌리지(5kg 이하 · 최대 1마리) × 두부 7kg — 판정 옆 첫 칩은 이유 줄의 "5kg 이하"(예전엔 "최대 1마리" 가 이유로 읽혔다)', () => {
    const { e, lead, lines } = view({ dogs: [{ name: '두부', weightKg: 7 }], carrier: 'none' }, '그리너리빌리지 펜션');
    expect(e.level).toBe('hard');
    expect(lines).toEqual(['두부(7kg)는 5kg 이하 조건을 넘어요']);
    expect(lead).toEqual(['5kg 이하']);
  });

  it('프레임스파빌(7kg 미만 1마리) × 콩이·해피 — 무게로도 마릿수로도 못 간다: 이유가 둘(H1 · H2), 칩도 그 둘이 그 순서로', () => {
    const { e, lead, lines } = view(junhyuk, '프레임스파빌 오션뷰펜션');
    expect(e.reasons.filter((r) => r.level === 'hard').map((r) => r.rule)).toEqual(['H1', 'H2']);
    expect(lines).toEqual(['해피(12kg)는 7kg 미만 조건을 넘어요', '7kg 미만은 1마리까지예요']);
    expect(lead).toEqual(['7kg 미만', '최대 1마리']);
  });

  it('무게로 못 들어가도 마릿수가 맞으면 H2 는 서지 않는다 — 한 마리 보리 30kg 은 무게 이유 하나', () => {
    const { e, lines } = view({ dogs: [{ name: '보리', weightKg: 30 }], carrier: 'none' }, '프레임스파빌 오션뷰펜션');
    expect(e.reasons.map((r) => r.rule)).not.toContain('H2');
    expect(lines).toEqual(['보리(30kg)는 7kg 미만 조건을 넘어요']);
  });

  it('구간마다 마릿수가 다른 곳(웨스티하우스)은 가장 느슨한 구간 기준 — 30kg 두 마리는 2마리 구간이 있어 무게 이유 하나', () => {
    const { e } = view({ dogs: [{ name: '보리', weightKg: 30 }, { name: '콩', weightKg: 3 }], carrier: 'none' }, '웨스티하우스');
    expect(e.reasons.map((r) => r.rule)).not.toContain('H2');
    const three = view({ dogs: [{ name: '보리', weightKg: 30 }, { name: '콩', weightKg: 3 }, { name: '팥', weightKg: 3 }], carrier: 'none' }, '웨스티하우스');
    expect(three.lines).toEqual(['보리(30kg)는 20kg 미만 조건을 넘어요', '10kg 미만은 2마리까지예요']);
    expect(three.lead).toEqual(['20kg 미만 1마리', '10kg 미만 2마리']);
  });

  it('확인 필요의 이유 줄은 판정을 정한 근거 하나, 갈 수 있어요·야외 자리만은 앞세울 칩이 없다', () => {
    const moka = view({ dogs: [{ name: '모카', weightKg: 8 }], carrier: 'none' }, '무히어');
    expect(moka.lines).toHaveLength(1);
    expect(view(TOFU, '웨스티하우스').lead).toEqual([]);
    expect(view(TOFU, '부부키친').lead).toEqual([]);
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

describe('judgeEligibility — 크기 규칙도 걸리는 아이만 부른다(14 W261010.15)', () => {
  const THREE: TDogProfile = {
    dogs: [{ name: '보리', weightKg: 12 }, { name: '단풍', weightKg: 4 }, { name: '깜지', weightKg: 6 }],
    carrier: 'none',
  };
  const BIG_SMALL: TDogProfile = { dogs: [{ name: '대장', weightKg: 28 }, { name: '초코', weightKg: 6 }], carrier: 'none' };
  const textOf = (dog: TDogProfile, text: string, rule: string) =>
    judgeEligibility(dog, parsePetPolicy(text)).reasons.find((r) => r.rule === rule)?.text;

  it('H3 — 소형견이 아닌 아이만, 둘 이상이면 "모두"', () => {
    expect(textOf(THREE, '소형견만 가능해요', 'H3')).toBe('보리(12kg)는 소형견이 아니에요. 소형견만 가능해요');
    const two: TDogProfile = { ...THREE, dogs: [...THREE.dogs, { name: '구름', weightKg: 15 }] };
    expect(textOf(two, '소형견만 가능해요', 'H3')).toBe('보리(12kg)·구름이(15kg) 모두 소형견이 아니에요. 소형견만 가능해요');
  });

  it('H7 — 대형견인 아이만', () => {
    expect(textOf(BIG_SMALL, '대형견은 어려워요', 'H7')).toBe('대장이(28kg)는 대형견이에요. 대형견은 어렵다고 적혀 있어요');
  });

  it('C5 — C10 처럼 "…도 되는지", 요금 하한 줄이 있어도', () => {
    expect(textOf(BIG_SMALL, '1마리당 3만원.', 'C5')).toBe('대형견 언급이 없어요. 대장이(28kg)도 되는지 확인해 주세요');
    expect(textOf(BIG_SMALL, '1마리당 3만원. 10kg 이상 4만원', 'C5')).toBe(
      '10kg 이상 요금이 적혀 있어요. 대장이(28kg)도 되는지 확인해 주세요',
    );
  });

  it('H4 — 이동가방이 있으면 대형견인 아이만 부른다', () => {
    const bag: TDogProfile = { ...BIG_SMALL, carrier: 'bag' };
    const policy = parsePetPolicy('실내는 케이지 필수');
    expect(policy.indoor).toBe('cage');
    expect(judgeEligibility(bag, policy).reasons.find((r) => r.rule === 'H4')?.text).toBe(
      '대장이(28kg)는 대형견이라 실내는 케이지 필수예요',
    );
    const outdoor = { ...policy, outdoorFree: true };
    expect(judgeEligibility(bag, outdoor).reasons.find((r) => r.rule === 'H4')?.text).toBe(
      '대장이(28kg)는 대형견이라 야외 자리만 가능해요',
    );
    const largeOk = { ...policy, largeDogOk: true };
    expect(judgeEligibility(bag, largeOk).reasons.find((r) => r.rule === 'H4')?.text).toBe('대장이(28kg)는 케이지가 없어 실내는 어려워요');
  });

  it('H4 — 이동 수단이 없으면 작은 아이도 실내에 못 들어 이름을 부르지 않는다', () => {
    const policy = parsePetPolicy('실내는 케이지 필수');
    expect(judgeEligibility(BIG_SMALL, policy).reasons.find((r) => r.rule === 'H4')?.text).toBe('실내는 케이지 필수라 대형견은 어려워요');
  });

  it('한 마리면 · 크기 수정이 판정을 정해 몸무게로는 아무도 안 걸리면 예전 문구 그대로', () => {
    expect(textOf({ dogs: [{ name: '보리', weightKg: 12 }], carrier: 'none' }, '소형견만 가능해요', 'H3')).toBe('소형견만 가능해요');
    const overridden: TDogProfile = { dogs: [{ name: '단비', weightKg: 8 }, { name: '솜', weightKg: 5 }], carrier: 'none', sizeOverride: 'medium' };
    expect(textOf(overridden, '소형견만 가능해요', 'H3')).toBe('소형견만 가능해요');
    expect(textOf({ ...overridden, sizeOverride: 'large' }, '대형견은 어려워요', 'H7')).toBe('대형견은 어렵다고 적혀 있어요');
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

  it("'애견동반 가능해요!' 처럼 일반 허용 문장만 있으면 읽은 것이다 — C7 이 아니다(확인 기록이 있으면 '갈 수 있어요')", () => {
    const policy = parsePetPolicy('애견동반 가능해요!');
    expect(policy.unread).toBe(false);
    expect(judgeEligibility(TOFU, withVerifiedAt(policy, '2026-09-20')).level).toBe('ok');
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

  it('특정 요일에만 동반되는 곳은 어려움이 아니라 확인이다(C11) — 요일만 읽힌 원문도 못 읽음(C7)이 아니다', () => {
    const text = "매주 수요일에는 '반려동물 동반데이'";
    const policy = parsePetPolicy(text);
    expect(policy.petDays).toEqual(['수']);
    expect(policy.unread).toBe(false);
    const result = judgeEligibility(TOFU, policy);
    expect(result.level).toBe('cond');
    expect(primaryReason(result)).toMatchObject({ rule: 'C11', text: '매주 수요일에만 함께 들어갈 수 있어요', quote: text });
    expect(result.reasons.some((r) => r.rule === 'C7')).toBe(false);
    const two = judgeEligibility(TOFU, parsePetPolicy('매주 수·토요일에만 반려견 동반 가능'));
    expect(primaryReason(two)).toMatchObject({ rule: 'C11', text: '매주 수·토요일에만 함께 들어갈 수 있어요' });
  });

  it('시드 86곳에는 못 읽은 원문이 없다 — 이 규칙이 지금 사이트의 판정을 바꾸지 않는다', () => {
    expect(PLACES.filter((p) => p.policy.unread || p.policy.largeDogNo).map((p) => p.name)).toEqual([]);
  });
});

describe('judgeEligibility — 확인 기록 없는 일반 허용 문장(C9, todo/13 A2)', () => {
  const GENERIC = '애견동반 가능해요!';

  it("확인 기록이 있으면 일반 허용 문장만으로도 '갈 수 있어요' 그대로다", () => {
    const result = judgeEligibility(TOFU, withVerifiedAt(parsePetPolicy(GENERIC), '2026-10-01'));
    expect(result.level).toBe('ok');
    expect(result.reasons.some((r) => r.rule === 'C9')).toBe(false);
  });

  it('확인 기록이 없으면 확인이 필요하다 — 조건이 적혀 있지 않다는 것까지가 원문이다', () => {
    const result = judgeEligibility(TOFU, withVerifiedAt(parsePetPolicy(GENERIC), undefined));
    expect(result.level).toBe('cond');
    expect(primaryReason(result)).toMatchObject({ rule: 'C9', text: '조건이 적혀 있지 않아요. 가기 전에 확인해 주세요' });
  });

  it('구체 조건이 하나라도 있으면 C9 는 물러나고 기존 규칙대로 판정한다', () => {
    const policy = withVerifiedAt(parsePetPolicy('애견동반 가능, 소형견만 가능해요'), undefined);
    expect(policy.genericOnly).toBe(false);
    const result = judgeEligibility(BORI_AND_KONG, policy);
    expect(result.level).toBe('hard');
    expect(result.reasons.some((r) => r.rule === 'C9')).toBe(false);
    expect(judgeEligibility(TOFU, policy).level).toBe('ok');
  });

  it('AI 판단이 있어도 같다 — 읽은 조건이 없으면 일반 허용, 있으면 그 조건대로', () => {
    const empty: TPetPolicyFacts = {
      indoor: 'unknown', leash: false, largeDogOk: null, smallDogOnly: false, callFirst: false, vaccineRequired: false,
      feeFree: null, feeText: null, fees: [], weightLimitKg: null, maxDogs: null, notes: null,
    };
    const generic = withPolicyFacts(parsePetPolicy(GENERIC), empty, GENERIC);
    expect(judgeEligibility(TOFU, generic).reasons.map((r) => r.rule)).toContain('C9');
    const leash = withPolicyFacts(parsePetPolicy('애견동반 가능, 리드줄 필수'), { ...empty, leash: true }, '애견동반 가능, 리드줄 필수');
    expect(leash.genericOnly).toBe(false);
  });

  // 시드만 못 박는다(원문 공개 행 — 화면 항목엔 AI 판단이 없어 그것으로 가를 수 없다, 21 S8). pull 한 블로그 장소에 C9 가 서는 것은 이 규칙이 하는 일이다.
  const SEEDS = PLACES.filter((p) => p.petPolicyTextPublic === true);

  it('시드 86곳의 판정은 하나도 바뀌지 않는다 — 일반 허용 문장뿐인 시드가 없다', () => {
    expect(SEEDS.length).toBeGreaterThan(0);
    expect(SEEDS.filter((p) => p.policy.genericOnly && !p.policy.verified).map((p) => p.name)).toEqual([]);
    for (const dog of [TOFU, BORI_AND_KONG, KONG]) {
      for (const place of SEEDS) {
        expect(judgeEligibility(dog, place.policy).reasons.some((r) => r.rule === 'C9')).toBe(false);
      }
    }
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

describe('carrierSummary', () => {
  it('이동 수단이 없으면 "없어요" 가 아니라 무엇의 값인지 적는다', () => {
    expect(carrierSummary('none')).toBe('이동 수단 없음');
  });

  it('있으면 폼의 라벨을 그대로 쓴다', () => {
    expect(carrierSummary('bag')).toBe('이동가방·슬링백');
    expect(carrierSummary('cage')).toBe('케이지');
    expect(carrierSummary('stroller')).toBe('유모차');
  });
});

describe('judgeEligibility — 실내 조건을 모르는 식당·카페에 실내 자리가 필요하다(C12, todo/13 §5.2)', () => {
  const NO_INDOOR = ['포크', '오롬마르', '더클리프'];

  it("'실내 자리 필요' 를 켜면 실내를 말하지 않은 카페는 '갈 수 있어요' 가 아니다", () => {
    for (const name of NO_INDOOR) {
      const place = findPlace(name);
      expect(place.policy.indoor).toBe('unknown');
      const result = judgeEligibility(TOFU, place.policy, { needsIndoor: true });
      expect(result.level, name).toBe('cond');
      expect(result.reasons.find((r) => r.rule === 'C12'), name).toMatchObject({
        level: 'cond',
        text: '실내 동반은 적혀 있지 않아요. 확인해 주세요',
      });
    }
  });

  it('실내 자리가 필요하지 않으면 판정은 그대로다 — 실내를 묻지 않았다', () => {
    for (const name of NO_INDOOR) {
      const result = judgeEligibility(TOFU, findPlace(name).policy);
      expect(result.reasons.some((r) => r.rule === 'C12'), name).toBe(false);
    }
  });

  it('숙소는 실내외를 묻지 않는다 — 실내 조건이 없어도 C12 가 걸리지 않는다', () => {
    const stays = PLACES.filter((p) => p.type === 'stay' && p.policy.indoor === 'unknown');
    expect(stays.length).toBeGreaterThan(0);
    for (const place of stays) {
      expect(judgeEligibility(TOFU, place.policy, { needsIndoor: true }).reasons.some((r) => r.rule === 'C12'), place.name).toBe(false);
    }
  });

  it('원문이 비었거나 못 읽은 곳은 이미 U1·C7 이 말한다 — 같은 확인을 두 번 말하지 않는다', () => {
    const unread = { ...parsePetPolicy('사장님 강아지들이랑 같이 뛰어놀 수 있어요'), seating: true };
    expect(judgeEligibility(TOFU, unread, { needsIndoor: true }).reasons.some((r) => r.rule === 'C12')).toBe(false);
    const empty = { ...parsePetPolicy(''), seating: true };
    expect(judgeEligibility(TOFU, empty, { needsIndoor: true }).reasons.some((r) => r.rule === 'C12')).toBe(false);
  });

  it('시드(확인 기록이 있는 곳)의 식당·카페는 이 규칙에 안 걸린다 — 모두 실내·야외 중 하나를 읽었다', () => {
    const seeds = PLACES.filter((p) => p.verifiedAt && p.type !== 'stay');
    expect(seeds.length).toBeGreaterThan(0);
    const hit = seeds
      .filter((p) => judgeEligibility(TOFU, p.policy, { needsIndoor: true }).reasons.some((r) => r.rule === 'C12'))
      .map((p) => p.name);
    expect(hit).toEqual([]);
  });
});

describe('judgeEligibility — 중형견에게 크기 언급이 없는 곳을 말한다(I3, 14 W261019.5)', () => {
  const dog = (weightKg: number): TDogProfile => ({ dogs: [{ name: '보리', weightKg }], carrier: 'none' });
  const sizeLine = (weightKg: number, policy: ReturnType<typeof parsePetPolicy>) =>
    judgeEligibility(dog(weightKg), policy).reasons.find((r) => r.rule === 'I3');

  it('오늘당근("실내외 모두 가능" 뿐) × 12kg — 판정은 그대로 갈 수 있어요, 상세 근거에만 한 줄이고 카드 이유 줄은 없다', () => {
    const e = judgeEligibility(dog(12), findPlace('오늘당근').policy);
    expect(e.level).toBe('ok');
    expect(e.reasons.find((r) => r.rule === 'I3')).toMatchObject({ level: 'info', text: '크기 제한은 적혀 있지 않아요' });
    expect(primaryReason(e)).toBeUndefined();
  });

  it('경계 — 25kg 은 중형이라 이 줄, 26kg 은 대형이라 C5(확인 필요)가 말한다, 9kg 은 소형이라 없다', () => {
    const { policy } = findPlace('오늘당근');
    expect(sizeLine(25, policy)).toBeDefined();
    const large = judgeEligibility(dog(26), policy);
    expect(large.level).toBe('cond');
    expect(large.reasons.map((r) => r.rule)).toEqual(['C5']);
    expect(sizeLine(9, policy)).toBeUndefined();
  });

  it('원문이 크기를 말했으면 없다 — 중형·대형 OK · 대형 불가 · 무게 상한 · kg 요금', () => {
    expect(sizeLine(12, parsePetPolicy('중형견까지 동반 가능해요.'))).toBeUndefined();
    expect(sizeLine(12, parsePetPolicy('대형견도 동반 가능해요.'))).toBeUndefined();
    expect(sizeLine(12, parsePetPolicy('대형견은 동반이 어려워요.'))).toBeUndefined();
    expect(sizeLine(12, findPlace('선흘안').policy)).toBeUndefined();
    expect(sizeLine(12, findPlace('캄 : Kalm').policy)).toBeUndefined();
  });

  it('원문을 못 읽었거나 조건이 없으면 없다 — 읽지 못했는데 "적혀 있지 않다" 고 하면 틀린 말이다', () => {
    const unread = parsePetPolicy('ㅁㄴㅇㄹ 반려견');
    expect(unread.unread).toBe(true);
    expect(sizeLine(12, unread)).toBeUndefined();
    const noInfo = parsePetPolicy('');
    expect(noInfo.noInfo).toBe(true);
    expect(sizeLine(12, noInfo)).toBeUndefined();
  });
});

describe("judgeEligibility — '갈 수 있어요' 에도 우리 강아지 기준 크기 근거(I4, 14 W261027.2)", () => {
  const dog = (...weights: number[]): TDogProfile => ({
    dogs: weights.map((weightKg, i) => ({ name: ['보리', '두부', '콩이'][i], weightKg })),
    carrier: 'none',
  });
  const basis = (profile: TDogProfile, policy: ReturnType<typeof parsePetPolicy>) =>
    judgeEligibility(profile, policy).reasons.find((r) => r.rule === 'I4');

  it('백화stay × 30kg — 견종으로 읽은 것은 옮겨 읽었다고 말하고, 근거 문장을 인용한다. 카드 이유 줄은 아니다', () => {
    const { policy } = findPlace('백화stay');
    const e = judgeEligibility(dog(30), policy);
    expect(e.level).toBe('ok');
    expect(e.reasons.find((r) => r.rule === 'I4')).toMatchObject({
      level: 'info',
      text: '견종 제한이 없다고 적혀 있어 보리(30kg)도 되는 것으로 읽었어요',
      quote: policy.sources.largeDogOk,
    });
    expect(primaryReason(e)).toBeUndefined();
  });

  it('원문이 크기를 직접 말했으면 적힌 그대로 — 몸무게 제한 없음 · 대형견 가능', () => {
    expect(basis(dog(30), parsePetPolicy('몸무게 제한 없음.'))?.text).toBe('몸무게 제한이 없다고 적혀 있어요 · 보리(30kg)도 돼요');
    expect(basis(dog(30), parsePetPolicy('대형견도 동반 가능해요.'))?.text).toBe('대형견도 된다고 적혀 있어요 · 보리(30kg)도 돼요');
  });

  it('근거 문장이 지워진 행(블로그 출처)은 조립이 얹은 칸(`largeDogOkBy`)으로 말하고, 그 칸도 없으면 단정하지 않는다', () => {
    const policy = { ...parsePetPolicy('견종 제한 없음.'), sources: {} };
    expect(basis(dog(30), policy)?.text).toBe('대형견도 받는 것으로 읽었어요 · 보리(30kg)도 돼요');
    expect(basis(dog(30), { ...policy, largeDogOkBy: 'breedFree' as const })?.text).toBe('견종 제한이 없다고 적혀 있어 보리(30kg)도 되는 것으로 읽었어요');
  });

  it('여러 마리면 크기가 문제 되는 아이만 부르고, 소형 아이 하나면 대형견 허용을 말하지 않는다', () => {
    const policy = parsePetPolicy('대형견도 동반 가능해요.');
    expect(basis(dog(28, 4), policy)?.text).toBe('대형견도 된다고 적혀 있어요 · 보리(28kg)도 돼요');
    expect(basis(dog(4), policy)).toBeUndefined();
  });

  it('무게 구간이 받아 주면 그 구간 — 바로 밑이면 I2 가 말해 이 줄은 없다', () => {
    const policy = parsePetPolicy('7kg 미만 2마리까지 가능.');
    expect(basis(dog(5), policy)?.text).toBe('보리(5kg)는 7kg 미만 조건 안이에요');
    expect(basis(dog(5, 3), policy)?.text).toBe('보리(5kg)·두부(3kg) 모두 7kg 미만 조건 안이에요');
    const near = judgeEligibility(dog(6.5), policy);
    expect(near.reasons.map((r) => r.rule)).toContain('I2');
    expect(near.reasons.some((r) => r.rule === 'I4')).toBe(false);
  });

  it('소형견만 × 소형 아이', () => {
    expect(basis(dog(4), parsePetPolicy('소형견만 동반 가능해요.'))?.text).toBe('소형견만 된다고 적혀 있어요 · 보리(4kg)는 소형견이에요');
  });

  it("'갈 수 있어요' 가 아니면 없다 — 대형견 OK 인데 케이지가 없어 야외 자리만 · 조건 없음", () => {
    const cage = judgeEligibility(dog(30), parsePetPolicy('대형견도 동반 가능. 실내는 케이지 필수, 실외는 자유.'));
    expect(cage.level).toBe('cond');
    expect(cage.reasons.some((r) => r.rule === 'I4')).toBe(false);
    expect(basis(dog(30), parsePetPolicy(''))).toBeUndefined();
  });
});
