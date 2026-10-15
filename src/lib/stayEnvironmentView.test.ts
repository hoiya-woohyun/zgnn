import { describe, expect, it } from 'vitest';
import { environmentPhrases, roomPhrases } from './stayEnvironmentView';
import type { TStayEnvironment } from '../types';

const env = (patch: Partial<TStayEnvironment>): TStayEnvironment => ({
  standalone: null,
  yard: null,
  fencedYard: null,
  stairs: null,
  indoorRoom: null,
  furniture: null,
  ...patch,
});

describe('environmentPhrases', () => {
  it('아는 것만, 울타리 마당이면 마당을 두 번 말하지 않는다', () => {
    expect(environmentPhrases(env({ standalone: true, yard: true, fencedYard: true, stairs: false }))).toEqual(['독채', '울타리 있는 마당', '계단 없음']);
    expect(environmentPhrases(env({ yard: true, stairs: true }))).toEqual(['마당', '계단·복층 있음']);
    expect(environmentPhrases(undefined)).toEqual([]);
  });

  it('객실 조건은 숙소 환경 줄에 섞지 않는다', () => {
    expect(environmentPhrases(env({ indoorRoom: true, furniture: false }))).toEqual([]);
  });
});

describe('roomPhrases', () => {
  it('원문이 말한 칸만 — 모르면 줄이 없다', () => {
    expect(roomPhrases(env({ indoorRoom: true, furniture: true }))).toEqual(['객실 안에서 함께 지내요', '침대·소파에 올라가도 돼요']);
    expect(roomPhrases(env({ indoorRoom: false }))).toEqual(['객실엔 못 들어가요(마당·테라스만)']);
    expect(roomPhrases(env({ furniture: false }))).toEqual(['침대·소파엔 못 올라가요']);
    expect(roomPhrases(env({ standalone: true, yard: true }))).toEqual([]);
    expect(roomPhrases(undefined)).toEqual([]);
  });
});
