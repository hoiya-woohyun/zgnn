import { describe, expect, it } from 'vitest';
import {
  appendReviewerNote,
  jwtExpiresAt,
  SESSION_EXP_SKEW_S,
  SESSION_MAX_TTL_S,
  sessionProblem,
  type TAdminSession,
} from './adminSession';

/*
 * 토큰 조각은 손으로 계산해 박아 둔다 — 테스트가 같은 인코딩을 다시 구현하면 둘이 같이 틀려도 초록이 된다.
 *   eyJleHAiOjEyMzQ1Njc4OTB9               = {"exp":1234567890}            (길이 4의 배수, 패딩 불필요)
 *   eyJleHAiOjE4MDAwMDAwMDAsImFiIjoxfQ     = {"exp":1800000000,"ab":1}     (패딩 '==' 를 떼어 낸 모양)
 *   eyJleHAiOjE4MDAwMDAwMDAsInN1YiI6Iv___yJ9 = {"exp":1800000000,"sub":"ÿÿÿ"} (base64url 의 '_' 가 들어 있다)
 */
const jwt = (payloadSegment: string) => `eyJhbGciOiJIUzI1NiJ9.${payloadSegment}.c2lnbmF0dXJl`;

const session = (patch: Partial<TAdminSession> = {}): TAdminSession => ({
  accessToken: jwt('eyJleHAiOjEyMzQ1Njc4OTB9'),
  expiresAt: 1_234_567_890,
  email: 'operator@example.com',
  ...patch,
});

describe('jwtExpiresAt — 토큰에서 만료 시각만 꺼낸다', () => {
  it('정상 토큰의 exp 를 초 단위로 읽는다', () => {
    expect(jwtExpiresAt(jwt('eyJleHAiOjEyMzQ1Njc4OTB9'))).toBe(1_234_567_890);
  });

  it('패딩이 떨어진 조각도 읽는다 — JWT 는 `=` 없이 온다', () => {
    expect(jwtExpiresAt(jwt('eyJleHAiOjE4MDAwMDAwMDAsImFiIjoxfQ'))).toBe(1_800_000_000);
  });

  it("base64url 글자('-'·'_')가 섞여도 읽는다 — atob 은 base64 만 받는다", () => {
    const payload = 'eyJleHAiOjE4MDAwMDAwMDAsInN1YiI6Iv___yJ9';
    expect(payload).toContain('_');
    expect(jwtExpiresAt(jwt(payload))).toBe(1_800_000_000);
  });

  it('세 조각이 아니면 undefined — 토큰이 아니다', () => {
    expect(jwtExpiresAt('eyJhbGciOiJIUzI1NiJ9.eyJleHAiOjEyMzQ1Njc4OTB9')).toBeUndefined();
    expect(jwtExpiresAt('')).toBeUndefined();
  });

  it('payload 를 못 읽거나 exp 가 숫자가 아니면 undefined', () => {
    expect(jwtExpiresAt(jwt('***'))).toBeUndefined();
    // {"exp":"1234567890"} — 문자열 exp
    expect(jwtExpiresAt(jwt('eyJleHAiOiIxMjM0NTY3ODkwIn0'))).toBeUndefined();
    // {"sub":"a"} — exp 없음
    expect(jwtExpiresAt(jwt('eyJzdWIiOiJhIn0'))).toBeUndefined();
  });
});

describe('sessionProblem — 이 세션을 지금 써도 되는가', () => {
  const now = 1_000_000;

  it('만료가 넉넉히 남은 세션은 none', () => {
    expect(sessionProblem(session({ expiresAt: now + 12 * 60 * 60 }), now)).toBe('none');
  });

  it('없거나 모양이 깨진 세션은 invalid — 지우고 로그인 화면으로 간다', () => {
    expect(sessionProblem(null, now)).toBe('invalid');
    expect(sessionProblem(session({ accessToken: '' }), now)).toBe('invalid');
    expect(sessionProblem({ ...session(), expiresAt: undefined } as unknown as TAdminSession, now)).toBe('invalid');
    expect(sessionProblem({ ...session(), email: undefined } as unknown as TAdminSession, now)).toBe('invalid');
  });

  it('만료 직전은 expired — 버튼을 누른 뒤 401 을 받는 것보다 먼저 말한다', () => {
    expect(sessionProblem(session({ expiresAt: now - 1 }), now)).toBe('expired');
    expect(sessionProblem(session({ expiresAt: now + SESSION_EXP_SKEW_S }), now)).toBe('expired');
    expect(sessionProblem(session({ expiresAt: now + SESSION_EXP_SKEW_S + 1 }), now)).toBe('none');
  });

  it('하루를 넘는 토큰은 tooLong — ADR-016 의 경계(exp ≤ 1일)를 코드로 지킨다', () => {
    expect(sessionProblem(session({ expiresAt: now + SESSION_MAX_TTL_S + 1 }), now)).toBe('tooLong');
    expect(sessionProblem(session({ expiresAt: now + SESSION_MAX_TTL_S }), now)).toBe('none');
  });
});

describe('appendReviewerNote — 남의 사유를 덮지 않는다', () => {
  it('기존 메모가 있으면 줄을 바꿔 덧붙인다', () => {
    expect(appendReviewerNote('[data:review] 목록글', '[admin] 승인')).toBe('[data:review] 목록글\n[admin] 승인');
  });

  it('기존 메모가 없으면 그 줄 하나만 남는다', () => {
    expect(appendReviewerNote(null, '[admin] 승인')).toBe('[admin] 승인');
    expect(appendReviewerNote(undefined, '[admin] 승인')).toBe('[admin] 승인');
    expect(appendReviewerNote('', '[admin] 승인')).toBe('[admin] 승인');
  });
});
