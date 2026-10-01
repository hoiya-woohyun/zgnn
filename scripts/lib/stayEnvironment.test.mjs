import { describe, expect, it } from 'vitest';
import { correctStayEnvironment, isEnvironmentEmpty, mergeStayEnvironment, parseStayEnvironment } from './stayEnvironment.mjs';

describe('parseStayEnvironment', () => {
  it('독채·마당을 읽는다', () => {
    expect(parseStayEnvironment('넓은 잔디 마당이 있는 독채 숙소에요.')).toEqual({
      standalone: true,
      yard: true,
      fencedYard: null,
      stairs: null,
    });
  });

  it('강아지 계단(용품)은 건물 계단이 아니다', () => {
    expect(parseStayEnvironment('넓은 마당 | 강아지 계단, 식기').stairs).toBeNull();
    expect(parseStayEnvironment('복층 구조라 아늑해요').stairs).toBe(true);
    expect(parseStayEnvironment('단층 독채라 계단이 없어요').stairs).toBe(false);
  });

  it('울타리는 마당 가까이 있어야 울타리 마당이고, 그러면 마당도 있다', () => {
    expect(parseStayEnvironment('펜스가 쳐진 잔디 마당')).toMatchObject({ fencedYard: true, yard: true });
    expect(parseStayEnvironment('주차장 울타리. 객실은 깔끔해요').fencedYard).toBeNull();
  });
});

describe('correctStayEnvironment', () => {
  it('근거 없는 true 는 뺀다, 근거 없는 false 도 null 로', () => {
    expect(correctStayEnvironment({ standalone: true, yard: true, fencedYard: true, stairs: false }, '넓은 마당이 있어요')).toEqual({
      standalone: null,
      yard: true,
      fencedYard: null,
      stairs: null,
    });
    expect(correctStayEnvironment({ stairs: false }, '모두 1층 객실')?.stairs).toBe(false);
    expect(correctStayEnvironment({ standalone: true }, '')).toBeNull();
    expect(correctStayEnvironment(null, '독채')).toBeNull();
  });
});

describe('mergeStayEnvironment', () => {
  it('칸마다 AI 가 말했으면 AI, 아니면 정규식', () => {
    expect(
      mergeStayEnvironment({ standalone: true, yard: null, fencedYard: null, stairs: true }, { standalone: null, yard: true, fencedYard: null, stairs: false }),
    ).toEqual({ standalone: true, yard: true, fencedYard: null, stairs: false });
    expect(isEnvironmentEmpty(mergeStayEnvironment(null, null))).toBe(true);
  });
});
