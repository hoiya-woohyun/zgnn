import { describe, expect, it } from 'vitest';
import { parsePetPolicy } from './petPolicy';
import { tripDayVerdict } from './tripDayVerdict';
import type { TDogProfile } from '../types';

const DAEJANG_CHOCO: TDogProfile = { dogs: [{ name: '대장', weightKg: 18 }, { name: '초코', weightKg: 12 }], carrier: 'none' };
const CHOCO: TDogProfile = { dogs: [{ name: '초코', weightKg: 12 }], carrier: 'none' };

const OK = '실내외 모두 가능.';
const OUTDOOR = '야외 테라스만 가능'; // C1 — 카드 배지는 "야외 자리에서 갈 수 있어요"
const ASK = '중형견 이상은 사전 문의'; // C7 — 확인이 필요해요
const NO_INFO = '';
const LIMIT = '15kg 이하 2마리까지'; // 대장(18kg)이 걸린다

const day = (...texts: string[]) =>
  texts.map((text, index) => ({ id: `p${index + 1}`, name: `가게${index + 1}`, policy: parsePetPolicy(text) }));

describe('tripDayVerdict — 하루 머리 한 줄(16 T2.3)', () => {
  it('빈 하루는 말하지 않는다', () => {
    expect(tripDayVerdict(CHOCO, [])).toBeNull();
  });

  it('다 되면 데려가는 아이 전부가 주어', () => {
    expect(tripDayVerdict(DAEJANG_CHOCO, day(OK, OK))).toEqual({
      level: 'ok',
      headline: '대장이와 초코는 이 날 다 갈 수 있어요',
      subsetLine: null,
      hardIds: [],
    });
  });

  it('야외 자리만 되는 곳은 "확인이 필요해요" 로 세지 않는다 — 카드 배지와 같은 말', () => {
    expect(tripDayVerdict(CHOCO, day(OK, OUTDOOR))?.headline).toBe('초코는 이 날 다 갈 수 있어요 — 1곳은 야외 자리에서');
    expect(tripDayVerdict(CHOCO, day(OUTDOOR, ASK))?.headline).toBe('이 날 1곳은 확인이 필요해요');
  });

  it('정보가 없는 곳은 장소가 주어 — 강아지 이름을 앞세우지 않는다', () => {
    expect(tripDayVerdict(CHOCO, day(OK, NO_INFO))?.headline).toBe('이 날 1곳은 동반 조건이 공개돼 있지 않아요');
    expect(tripDayVerdict(CHOCO, day(ASK, NO_INFO, NO_INFO))?.headline).toBe(
      '이 날 1곳은 확인이 필요하고, 2곳은 동반 조건이 공개돼 있지 않아요',
    );
  });

  it('어려운 곳이 하나면 그 이름, 여럿이면 수 — 다른 걸린 곳보다 앞선다', () => {
    expect(tripDayVerdict(DAEJANG_CHOCO, day(ASK, LIMIT))?.headline).toBe('대장이와 초코는 가게2에 가기 어려워요');
    const two = tripDayVerdict(DAEJANG_CHOCO, day(LIMIT, NO_INFO, LIMIT));
    expect(two?.headline).toBe('대장이와 초코는 이 날 2곳에 가기 어려워요');
    expect(two?.hardIds).toEqual(['p1', 'p3']);
  });

  it('"이 날은 초코만" — 조합이 다 풀면 다 갈 수 있어요', () => {
    expect(tripDayVerdict(DAEJANG_CHOCO, day(LIMIT, OK))?.subsetLine).toBe('이 날은 초코만 데려가면 다 갈 수 있어요');
  });

  it('조합의 정보 없음은 실패가 아니다 — "확인된 정보가 없어요" 가 아니라 "어려운 곳은 없어요"', () => {
    expect(tripDayVerdict(DAEJANG_CHOCO, day(LIMIT, NO_INFO))?.subsetLine).toBe('이 날은 초코만 데려가면 어려운 곳은 없어요');
  });

  describe('누구로도 되면 상세와 같은 말 — "콩이나 해피 중 한 마리만"(14 W261019.9a)', () => {
    const KONG_HAPPY: TDogProfile = { dogs: [{ name: '콩', weightKg: 2.5 }, { name: '해피', weightKg: 12 }], carrier: 'none' };
    // 웨스티하우스 원문 그대로 — 콩은 10kg 구간, 해피는 20kg 구간이 받고 둘이 같이는 안 된다.
    const WESTIE = '10kg 미만의 경우 최대 2마리 가능. 20kg 미만(중형견)의 경우 최대 1마리 가능.';

    it('웨스티하우스 × 콩·해피 — "해피만" 이 아니다', () => {
      expect(tripDayVerdict(KONG_HAPPY, day(WESTIE, OK))?.subsetLine).toBe(
        '이 날은 콩이나 해피 중 한 마리만 데려가면 다 갈 수 있어요',
      );
    });

    it('세 마리 중 누구 한 마리만 빼도 되면 빠지는 쪽으로', () => {
      const three: TDogProfile = {
        dogs: [{ name: '단비', weightKg: 5 }, { name: '솜', weightKg: 7 }, { name: '구름', weightKg: 6 }],
        carrier: 'none',
      };
      expect(tripDayVerdict(three, day('2마리까지', OK))?.subsetLine).toBe(
        '이 날은 단비, 솜이, 구름이 중 한 마리만 두고 가면 다 갈 수 있어요',
      );
    });

    it('묶음은 하루 전체로 센다 — 다른 곳이 해피를 막으면 "콩이만"', () => {
      expect(tripDayVerdict(KONG_HAPPY, day(WESTIE, '5kg 이하'))?.subsetLine).toBe('이 날은 콩이만 데려가면 다 갈 수 있어요');
    });
  });

  it('한 마리면 조합을 묻지 않는다', () => {
    const verdict = tripDayVerdict({ dogs: [{ name: '대장', weightKg: 18 }], carrier: 'none' }, day(LIMIT));
    expect(verdict?.headline).toBe('대장이는 가게1에 가기 어려워요');
    expect(verdict?.subsetLine).toBeNull();
  });
});
