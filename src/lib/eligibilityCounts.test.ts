import { describe, expect, it } from 'vitest';
import { headlineFor, judgeEligibility } from './eligibility';
import { carrierWhatIf, carrierWhatIfText, countByLevel, LEVEL_COUNT_LABEL, levelCountParts, outdoorFallback, reachablePlaces, splitReachable } from './eligibilityCounts';
import { parsePetPolicy } from './petPolicy';
import { PLACE_TYPES, placesOfType } from './places';
import type { TDogProfile } from '../types';

// 리뷰(2026-09-29) 민준 — 대형견 2마리, 이동 수단 없음.
const DAEJANG_AND_CHOCO: TDogProfile = {
  dogs: [{ name: '대장', weightKg: 28 }, { name: '초코', weightKg: 17 }],
  carrier: 'none',
};

describe('countByLevel', () => {
  // 리뷰 §2 표는 확인 3 · 정보 없음 5 였다 — 맘앤도그("정보 없음 … 대형견도 동반 가능!!")가 정보 없음 → 확인으로 옮겼다(14 W261006.3).
  // 2026-10-08 숙소 26 → 31곳(블로그 5곳)으로 확인 4 → 6 · 어려움 14 → 17(19 T2.1).
  it('숙소 × 대형 2마리 — 가능 4 · 확인 6 · 정보 없음 4 · 어려움 17', () => {
    expect(countByLevel(placesOfType('stay'), DAEJANG_AND_CHOCO)).toEqual({ ok: 4, outdoor: 0, cond: 6, unknown: 4, hard: 17 });
  });

  it('레벨 합은 곳 수와 같다', () => {
    const places = placesOfType('restaurant');
    const counts = countByLevel(places, DAEJANG_AND_CHOCO);
    expect(counts.ok + counts.outdoor + counts.cond + counts.unknown + counts.hard).toBe(places.length);
  });

  it('빈 목록이면 전부 0', () => {
    expect(countByLevel([], DAEJANG_AND_CHOCO)).toEqual({ ok: 0, outdoor: 0, cond: 0, unknown: 0, hard: 0 });
  });

  // 14 W261007.5 — 카드가 "야외 자리에서 갈 수 있어요" 인 곳을 '확인 필요' 로 세지 않는다.
  describe('야외 자리만 되는 곳은 outdoor 로 따로', () => {
    const BORI: TDogProfile = { dogs: [{ name: '보리', weightKg: 30 }], carrier: 'none' };
    const restaurants = placesOfType('restaurant');

    it('식당 × 30kg — 야외 칸이 야외 차선 시트(outdoorFallback)와 같은 곳 수', () => {
      expect(countByLevel(restaurants, BORI).outdoor).toBe(outdoorFallback(restaurants, BORI)?.length);
    });

    it('야외 칸의 곳은 전부 머리글이 "야외 자리에서 갈 수 있어요" 다', () => {
      const outdoorOnly = restaurants.filter((place) => countByLevel([place], BORI).outdoor === 1);
      expect(outdoorOnly.length).toBeGreaterThan(0);
      for (const place of outdoorOnly) {
        expect(headlineFor(judgeEligibility(BORI, place.policy))).toBe('야외 자리에서 갈 수 있어요');
      }
    });

    it('실내 자리가 꼭 필요하면 야외는 0', () => {
      expect(countByLevel(restaurants, BORI, { needsIndoor: true }).outdoor).toBe(0);
    });
  });
});

describe('reachablePlaces — 홈 "갈 수 있는 곳 N곳" 과 그 시트 (14 W261007.12)', () => {
  const DUBU: TDogProfile = { dogs: [{ name: '두부', weightKg: 7 }], carrier: 'none' };
  const BORI: TDogProfile = { dogs: [{ name: '보리', weightKg: 30 }], carrier: 'none' };

  it.each([
    ['두부 7kg', DUBU, {}],
    ['보리 30kg', BORI, {}],
    ['보리 30kg · 실내 자리 필요', BORI, { needsIndoor: true }],
  ])('%s — 길이가 countByLevel 의 가능 + 야외와 같다', (_, dog, opts) => {
    for (const type of PLACE_TYPES) {
      const places = placesOfType(type);
      const counts = countByLevel(places, dog, opts);
      expect(reachablePlaces(places, dog, opts)).toHaveLength(counts.ok + counts.outdoor);
    }
  });

  it('가능 먼저, 야외 뒤 — 식당 × 30kg 는 야외 곳만이고 그게 야외 차선과 같은 곳', () => {
    const restaurants = placesOfType('restaurant');
    expect(reachablePlaces(restaurants, BORI)).toEqual(outdoorFallback(restaurants, BORI));
  });

  it('종류마다 가능이 야외보다 앞에 온다', () => {
    for (const type of PLACE_TYPES) {
      const levels = reachablePlaces(placesOfType(type), DUBU).map((place) => judgeEligibility(DUBU, place.policy).level);
      const firstOutdoor = levels.indexOf('cond');
      expect(firstOutdoor === -1 || levels.lastIndexOf('ok') < firstOutdoor).toBe(true);
    }
  });
});

describe('splitReachable — 히어로 N 의 가능 · 야외 두 칸 (14 W261013.2)', () => {
  const DUBU: TDogProfile = { dogs: [{ name: '두부', weightKg: 7 }], carrier: 'none' };
  const BORI: TDogProfile = { dogs: [{ name: '보리', weightKg: 30 }], carrier: 'none' };

  it.each([
    ['두부 7kg', DUBU, {}],
    ['보리 30kg', BORI, {}],
    ['보리 30kg · 실내 자리 필요', BORI, { needsIndoor: true }],
  ])('%s — 이어 붙이면 reachablePlaces, 두 길이는 countByLevel 의 가능 · 야외', (_, dog, opts) => {
    for (const type of PLACE_TYPES) {
      const places = placesOfType(type);
      const { ok, outdoor } = splitReachable(places, dog, opts);
      const counts = countByLevel(places, dog, opts);
      expect([...ok, ...outdoor]).toEqual(reachablePlaces(places, dog, opts));
      expect([ok.length, outdoor.length]).toEqual([counts.ok, counts.outdoor]);
    }
  });

  it('야외 칸의 곳은 전부 머리글이 "야외 자리에서 갈 수 있어요" 다 — 시트의 \'야외만\' 표식이 카드와 같은 말', () => {
    const { outdoor } = splitReachable(placesOfType('restaurant'), BORI);
    expect(outdoor.length).toBeGreaterThan(0);
    for (const place of outdoor) expect(headlineFor(judgeEligibility(BORI, place.policy))).toBe('야외 자리에서 갈 수 있어요');
  });
});

describe('carrierWhatIf — 이동가방이 있으면 몇 곳이 열리나', () => {
  const TOFU_NONE: TDogProfile = { dogs: [{ name: '두부', weightKg: 4 }], carrier: 'none' };
  const cageOnly = [parsePetPolicy('케이지 동반시 가능.'), parsePetPolicy('실내는 케이지 필수.')].map((policy) => ({ policy }));

  it('이동 수단 없음 + 케이지 필수 식당들 → 가방이면 어려움에서 벗어난다', () => {
    expect(carrierWhatIf(cageOnly, TOFU_NONE)).toEqual({
      carrier: 'bag',
      hard: 2,
      opened: 2,
      counts: { ok: 0, outdoor: 0, cond: 2, unknown: 0, hard: 0 },
      cageAsk: 2,
    });
  });

  it("원문이 이동가방을 적은 곳은 '가능', 전화 확인이 남는 곳은 '확인 필요' 로 센다 — 전엔 다 '확인 필요' 였다(14 W261013.14h)", () => {
    const places = [
      parsePetPolicy('케이지 동반시 가능.'), // 가방이면 C2 → 확인 필요
      parsePetPolicy('실내는 이동가방 필수.'), // 가방이면 가능
      parsePetPolicy('실내는 이동가방 필수. 방문 전 전화 문의 필수.'), // 가방이어도 C6 → 확인 필요
    ].map((policy) => ({ policy }));
    const whatIf = carrierWhatIf(places, TOFU_NONE);
    expect(whatIf?.counts).toEqual({ ok: 1, outdoor: 0, cond: 2, unknown: 0, hard: 0 });
    expect(carrierWhatIfText(whatIf!)).toBe(
      '어려움 3곳 중 이동가방이 있으면 1곳은 ‘가능’, 2곳은 ‘확인 필요’ 로 바뀌어요. 케이지라고 적힌 곳이 가방도 받는지는 물어봐야 알아요',
    );
  });

  it('칸이 하나면 "N곳이 ‘확인 필요’ 로", \'가능\' 만이면 "으로" — 원문이 이동가방이면 케이지 문장은 안 붙는다', () => {
    expect(carrierWhatIfText(carrierWhatIf(cageOnly, TOFU_NONE)!)).toBe(
      '어려움 2곳 중 이동가방이 있으면 2곳이 ‘확인 필요’ 로 바뀌어요. 케이지라고 적힌 곳이 가방도 받는지는 물어봐야 알아요',
    );
    const bagOnly = [{ policy: parsePetPolicy('실내는 이동가방 필수.') }];
    expect(carrierWhatIfText(carrierWhatIf(bagOnly, TOFU_NONE)!)).toBe('어려움 1곳 중 이동가방이 있으면 1곳이 ‘가능’ 으로 바뀌어요');
  });

  it("원문이 유모차만 적었으면 C2 여도 '케이지' 라고 부르지 않는다(14 W261019.3)", () => {
    const strollerOnly = [{ policy: parsePetPolicy('실내는 유모차 필수.') }];
    const whatIf = carrierWhatIf(strollerOnly, TOFU_NONE)!;
    expect(whatIf.counts.cond).toBe(1);
    expect(whatIf.cageAsk).toBe(0);
    expect(carrierWhatIfText(whatIf)).toBe('어려움 1곳 중 이동가방이 있으면 1곳이 ‘확인 필요’ 로 바뀌어요');
  });

  it('실제 식당 — 칸별 합이 벗어난 수와 같다', () => {
    const whatIf = carrierWhatIf(placesOfType('restaurant'), TOFU_NONE)!;
    expect(Object.values(whatIf.counts).reduce((a, b) => a + b, 0)).toBe(whatIf.opened);
  });

  // 문장의 "어려움 N곳 중" 은 목록 머리의 "어려움 N" 과 같은 무리여야 한다 — 따로 세면 한쪽만 고쳐도 테스트가 통과하고 두 수가 갈린다(14 W261019.3).
  it.each([false, true])('실제 식당 — 모수가 목록 머리의 어려움 수와 같다(needsIndoor %s)', (needsIndoor) => {
    const restaurants = placesOfType('restaurant');
    const whatIf = carrierWhatIf(restaurants, TOFU_NONE, { needsIndoor })!;
    const { hard } = countByLevel(restaurants, TOFU_NONE, { needsIndoor });
    expect(whatIf.hard).toBe(hard);
    expect(carrierWhatIfText(whatIf).startsWith(`어려움 ${hard}곳 중 `)).toBe(true);
  });

  it('실제 식당 목록에서도 0 보다 크다', () => {
    expect(carrierWhatIf(placesOfType('restaurant'), TOFU_NONE)?.opened).toBeGreaterThan(0);
  });

  it('이미 이동가방 프로필이면 null', () => {
    expect(carrierWhatIf(cageOnly, { ...TOFU_NONE, carrier: 'bag' })).toBeNull();
  });

  it('결과가 0곳이면 null', () => {
    expect(carrierWhatIf([], TOFU_NONE)).toBeNull();
  });

  it('대형견은 가방이어도 H4 가 그대로라 열리는 곳이 없다 → null', () => {
    expect(carrierWhatIf(cageOnly, DAEJANG_AND_CHOCO)).toBeNull();
  });
});

describe('outdoorFallback — 갈 수 있는 곳이 없을 때 야외 자리로 되는 곳 (14 W261006.5)', () => {
  const BORI: TDogProfile = { dogs: [{ name: '보리', weightKg: 30 }], carrier: 'none' };

  it('식당 × 30kg — 가능 0곳, 야외 자리로는 무거버거·온평바다한그릇 2곳(크기·전화 확인이 남은 부부키친·정체불명은 빠진다)', () => {
    const restaurants = placesOfType('restaurant');
    expect(countByLevel(restaurants, BORI).ok).toBe(0);
    const outdoor = outdoorFallback(restaurants, BORI);
    // 시트 안의 카드가 전부 "야외 자리에서 갈 수 있어요" 여야 한다 — "돼요" 라고 한 줄 밑에서 "확인이 필요해요" 가 나오지 않게.
    expect(outdoor?.map((place) => place.name)).toEqual(['무거버거', '온평바다한그릇 성산본점']);
    expect(outdoor?.every((place) => headlineFor(judgeEligibility(BORI, place.policy)) === '야외 자리에서 갈 수 있어요')).toBe(
      true,
    );
    // 그 곳들만 시트로 펼치므로 곳 자체를, 목록 순서대로 돌려준다(14 W261006.5a).
    expect(outdoor?.every((place) => place.policy.outdoorFree)).toBe(true);
    expect(outdoor?.map((place) => place.id)).toEqual(
      restaurants.filter((place) => outdoor?.includes(place)).map((place) => place.id),
    );
  });

  it('갈 수 있는 곳이 하나라도 있으면 null', () => {
    expect(outdoorFallback(placesOfType('restaurant'), { dogs: [{ name: '콩이', weightKg: 5 }], carrier: 'none' })).toBeNull();
  });

  it('실내 자리가 꼭 필요하면 야외는 차선이 아니다 → null', () => {
    expect(outdoorFallback(placesOfType('restaurant'), BORI, { needsIndoor: true })).toBeNull();
  });

  it('야외가 열린 곳이 없으면 null', () => {
    expect(outdoorFallback([{ policy: parsePetPolicy('케이지 동반시 가능.') }], BORI)).toBeNull();
  });
});

describe('LEVEL_COUNT_LABEL', () => {
  // 목록 머리(placesPageResults)가 이 표의 순서대로 칸을 늘어놓는다 — 홈 카드와 같은 이름·같은 순서.
  it('이름과 순서가 홈 카드·목록 머리의 기준이다', () => {
    expect(Object.entries(LEVEL_COUNT_LABEL)).toEqual([
      ['ok', '가능'],
      ['outdoor', '야외'],
      ['cond', '확인 필요'],
      ['unknown', '정보 없음'],
      ['hard', '어려움'],
    ]);
  });
});

describe('levelCountParts', () => {
  it('0 인 레벨은 빼고, 이름표 순서대로 "이름 수"', () => {
    expect(levelCountParts({ ok: 20, outdoor: 7, cond: 0, unknown: 3, hard: 14 })).toEqual(['가능 20', '야외 7', '정보 없음 3', '어려움 14']);
    expect(levelCountParts({ ok: 0, outdoor: 0, cond: 0, unknown: 0, hard: 0 })).toEqual([]);
  });
});
