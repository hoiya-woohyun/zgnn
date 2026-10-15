import { describe, expect, it } from 'vitest';
import { correctStayEnvironment, isEnvironmentEmpty, mergeStayEnvironment, parseStayEnvironment } from './stayEnvironment.mjs';

describe('parseStayEnvironment', () => {
  it('독채·마당을 읽는다', () => {
    expect(parseStayEnvironment('넓은 잔디 마당이 있는 독채 숙소에요.')).toEqual({
      standalone: true,
      yard: true,
      fencedYard: null,
      stairs: null,
      indoorRoom: null,
      furniture: null,
    });
  });

  it('강아지 계단(용품)은 건물 계단이 아니다', () => {
    expect(parseStayEnvironment('넓은 마당 | 강아지 계단, 식기').stairs).toBeNull();
    expect(parseStayEnvironment('복층 구조라 아늑해요').stairs).toBe(true);
    expect(parseStayEnvironment('단층 독채라 계단이 없어요').stairs).toBe(false);
  });

  // 08 T0.11 — lookbehind 를 걷고 앞 낱말을 캡처해 거른다. 용품 계단과 건물 계단이 한 글에 같이 있어도 건물 계단을 놓치지 않는다.
  it('용품 계단만 거른다 — 붙여 쓴 용품 · 건물 계단이 함께 있는 글', () => {
    expect(parseStayEnvironment('반려견계단, 펫 계단 비치').stairs).toBeNull();
    expect(parseStayEnvironment('강아지 계단 있어요. 2층 객실이라 계단을 올라가요').stairs).toBe(true);
  });

  it('울타리는 마당 가까이 있어야 울타리 마당이고, 그러면 마당도 있다', () => {
    expect(parseStayEnvironment('펜스가 쳐진 잔디 마당')).toMatchObject({ fencedYard: true, yard: true });
    expect(parseStayEnvironment('주차장 울타리. 객실은 깔끔해요').fencedYard).toBeNull();
  });

  // 14 W261013.11 — 객실 조건. 크기로 갈리는 문장은 칸이 강아지를 몰라 읽지 않는다.
  it('객실 안 · 마당만을 읽고, 크기로 갈리는 문장은 건너뛴다', () => {
    expect(parseStayEnvironment('반려견 오프리쉬는 객실 내부와 펜스 운동장에서만 가능해요').indoorRoom).toBe(true);
    expect(parseStayEnvironment('반려견과 함께 입실할 수 있어요').indoorRoom).toBe(true);
    expect(parseStayEnvironment('반려견은 객실 입실 불가, 마당에서만 이용해 주세요').indoorRoom).toBe(false);
    expect(parseStayEnvironment('테라스에서만 머물 수 있어요').indoorRoom).toBe(false);
    expect(parseStayEnvironment('소형견에 한해 동반 입실 가능').indoorRoom).toBeNull();
    expect(parseStayEnvironment('대형견은 마당에서만 이용 가능해요').indoorRoom).toBeNull();
    expect(parseStayEnvironment('15시 입실, 11시 퇴실').indoorRoom).toBeNull();
    expect(parseStayEnvironment('객실 내 흡연 금지').indoorRoom).toBeNull();
  });

  it('침대·소파 — 강아지 침대(용품)는 아니고, 불가능은 가능이 아니다', () => {
    expect(parseStayEnvironment('침대 위에 올라가도 괜찮아요').furniture).toBe(true);
    expect(parseStayEnvironment('침대와 소파는 올라가지 않게 해 주세요').furniture).toBe(false);
    expect(parseStayEnvironment('침대에 올라가는 건 불가능해요').furniture).toBe(false);
    expect(parseStayEnvironment('강아지 침대, 샴푸, 튜브 구비').furniture).toBeNull();
    expect(parseStayEnvironment('강아지 침대 사용 가능').furniture).toBeNull();
  });
});

describe('correctStayEnvironment', () => {
  it('근거 없는 true 는 뺀다, 근거 없는 false 도 null 로', () => {
    expect(correctStayEnvironment({ standalone: true, yard: true, fencedYard: true, stairs: false }, '넓은 마당이 있어요')).toEqual({
      standalone: null,
      yard: true,
      fencedYard: null,
      stairs: null,
      indoorRoom: null,
      furniture: null,
    });
    expect(correctStayEnvironment({ stairs: false }, '모두 1층 객실')?.stairs).toBe(false);
    expect(correctStayEnvironment({ standalone: true }, '')).toBeNull();
    expect(correctStayEnvironment(null, '독채')).toBeNull();
  });

  it('객실 칸의 true 는 금지 문장으로 통과하지 않는다', () => {
    expect(correctStayEnvironment({ furniture: true }, '침대에 올라가는 건 불가능해요')).toBeNull();
    expect(correctStayEnvironment({ furniture: false }, '침대에 올라가는 건 불가능해요')?.furniture).toBe(false);
    expect(correctStayEnvironment({ indoorRoom: false }, '대형견은 마당에서만 이용 가능해요')).toBeNull();
    expect(correctStayEnvironment({ indoorRoom: true }, '반려견과 함께 입실')?.indoorRoom).toBe(true);
  });
});

describe('mergeStayEnvironment', () => {
  it('칸마다 AI 가 말했으면 AI, 아니면 정규식', () => {
    expect(
      mergeStayEnvironment({ standalone: true, yard: null, fencedYard: null, stairs: true }, { standalone: null, yard: true, fencedYard: null, stairs: false }),
    ).toMatchObject({ standalone: true, yard: true, fencedYard: null, stairs: false, indoorRoom: null });
    expect(isEnvironmentEmpty(mergeStayEnvironment(null, null))).toBe(true);
  });
});
