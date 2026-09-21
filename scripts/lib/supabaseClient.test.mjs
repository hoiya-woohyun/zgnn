import { describe, expect, it } from 'vitest';
import {
  PROJECT_REF, SESSION_EXP_SKEW_S, SESSION_MAX_TTL_S, assertPublishableKey, jwtExpiresAt, projectUrl, resolveSupabaseCredentials, sessionTtlProblem,
} from './supabaseClient.mjs';

// 서명 없는 가짜 JWT — 서명은 서버가 확인하고, 여기선 `exp` 만 읽는다.
const jwt = (payload) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.sig`;
const NOW = 1_800_000_000;
const valid = jwt({ sub: 'u1', exp: NOW + 3600 });
const expired = jwt({ sub: 'u1', exp: NOW - 10 });
const PUB = 'sb_publishable_abcdefghijklmnop';
const PINNED = projectUrl(PROJECT_REF);

// 기본값: 키체인 없음 · 로컬(CI 아님) · link 일치 · publishable 키 있음.
const resolve = (over = {}) => resolveSupabaseCredentials({
  env: {},
  readSession: () => undefined,
  now: () => NOW,
  linkedRef: PROJECT_REF,
  publishableKey: PUB,
  ...over,
});

describe('jwtExpiresAt', () => {
  it('exp 를 초 단위로 돌려주고, JWT 가 아니면 undefined', () => {
    expect(jwtExpiresAt(valid)).toBe(NOW + 3600);
    expect(jwtExpiresAt('sb_secret_x')).toBeUndefined();
    expect(jwtExpiresAt('a.b.c')).toBeUndefined(); // payload 가 JSON 이 아님
    expect(jwtExpiresAt(jwt({ sub: 'u1' }))).toBeUndefined(); // exp 없음
    expect(jwtExpiresAt(undefined)).toBeUndefined();
  });
});

describe('assertPublishableKey — 공개 상수 자리에 시크릿이 들어오는 것을 형식으로 막는다', () => {
  it('sb_publishable_ 만 통과. 빈 값은 "없음" 이지 오류가 아니다', () => {
    expect(() => assertPublishableKey(PUB)).not.toThrow();
    expect(() => assertPublishableKey('')).not.toThrow();
    expect(() => assertPublishableKey('sb_secret_abcdefghijklmnop')).toThrow(/sb_publishable_/);
    expect(() => assertPublishableKey(jwt({ role: 'service_role' }))).toThrow(/sb_publishable_/);
    expect(() => assertPublishableKey(jwt({ role: 'anon' }))).toThrow(/sb_publishable_/); // legacy anon JWT 도 새 키로 바꿔 쓴다
  });
});

describe('resolveSupabaseCredentials — 출처', () => {
  it('CI 의 service key 가 먼저다(세션이 있어도). URL 은 이 경로에서만 env 로 바꿀 수 있다', () => {
    expect(resolve({ env: { CI: 'true', SUPABASE_SERVICE_ROLE_KEY: 'k' }, readSession: () => valid }))
      .toEqual({ url: PINNED, key: 'k', source: 'service' });
    expect(resolve({ env: { CI: '1', SUPABASE_URL: 'https://u', SUPABASE_SERVICE_ROLE_KEY: 'k' } }).url).toBe('https://u'); // Vercel 은 CI=1
  });

  it('service key 경로는 publishable 키·link 상태와 무관하다(Actions 러너엔 둘 다 없다)', () => {
    expect(resolve({ env: { CI: 'true', SUPABASE_SERVICE_ROLE_KEY: 'k' }, publishableKey: '', linkedRef: 'other' }).source).toBe('service');
  });

  it('로컬(CI 아님)에 service key 가 있으면 조용히 RLS 를 우회하지 않고 멈춘다 — 남은 .env.local 이 그 사고였다', () => {
    expect(() => resolve({ env: { SUPABASE_SERVICE_ROLE_KEY: 'k' }, readSession: () => valid })).toThrow(/CI 에서만/);
    expect(() => resolve({ env: { SUPABASE_SERVICE_ROLE_KEY: 'k' }, readOnly: true })).toThrow(/CI 에서만/);
    expect(() => resolve({ env: { CI: 'false', SUPABASE_SERVICE_ROLE_KEY: 'k' } })).toThrow(/CI 에서만/);
  });

  it('GitHub Actions 인데 service key 가 없으면 로그인 안내가 아니라 시크릿 이름을 말한다', () => {
    expect(() => resolve({ env: { CI: 'true', GITHUB_ACTIONS: 'true' }, readSession: () => valid })).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
    expect(() => resolve({ env: { CI: 'true', GITHUB_ACTIONS: 'true', SUPABASE_URL: 'https://u' } })).toThrow(/gh secret set/);
  });

  it('세션·anon 경로는 SUPABASE_URL env 를 무시한다 — 허용된 명령 한 줄로 JWT 를 다른 호스트에 보낼 수 없게', () => {
    expect(resolve({ env: { SUPABASE_URL: 'https://attacker' }, readSession: () => valid }).url).toBe(PINNED);
    expect(resolve({ env: { SUPABASE_URL: 'https://attacker' }, readOnly: true }).url).toBe(PINNED);
  });

  it('유효한 세션이 있으면 publishable 키 + accessToken(session)', () => {
    expect(resolve({ readSession: () => valid })).toEqual({ url: PINNED, key: PUB, source: 'session', accessToken: valid, expiresAt: NOW + 3600 });
  });

  it('readOnly 는 항상 anon — 유효한 세션이 있어도 토큰을 싣지 않고, 세션 상태를 읽지도 않는다', () => {
    let read = 0;
    const r = resolve({ readOnly: true, readSession: () => { read++; return valid; } });
    expect(r).toEqual({ url: PINNED, key: PUB, source: 'anon' });
    expect(read).toBe(0);
    expect(resolve({ readOnly: true, readSession: () => expired })).toEqual({ url: PINNED, key: PUB, source: 'anon' });
    expect(resolve({ readOnly: true, readSession: () => 'garbage' })).toEqual({ url: PINNED, key: PUB, source: 'anon' });
  });

  it('쓰기 스크립트: 세션이 없거나·JWT 가 아니거나·만료면 로그인 안내로 멈춘다', () => {
    expect(() => resolve()).toThrow(/로그인이 필요하다.*pnpm data:login/s);
    expect(() => resolve({ readSession: () => 'garbage' })).toThrow(/JWT 가 아니다.*pnpm data:login/s);
    expect(() => resolve({ readSession: () => expired })).toThrow(/만료됐다.*pnpm data:login/s);
  });

  it('만료 여유(skew) 안쪽은 이미 만료로 본다 — 20분짜리 분석이 중간에 401 로 죽지 않게', () => {
    expect(() => resolve({ readSession: () => jwt({ sub: 'u1', exp: NOW + SESSION_EXP_SKEW_S - 1 }) })).toThrow(/만료됐다/);
    expect(resolve({ readSession: () => jwt({ sub: 'u1', exp: NOW + SESSION_EXP_SKEW_S + 1 }) }).source).toBe('session');
  });

  it('요구 ⑤: 수명이 하루를 넘는 세션은 거부한다 — 대시보드 JWT expiry 를 코드가 단언한다', () => {
    expect(() => resolve({ readSession: () => jwt({ sub: 'u1', exp: NOW + SESSION_MAX_TTL_S + 1 }) })).toThrow(/하루를 넘는다.*JWT expiry/s);
    expect(resolve({ readSession: () => jwt({ sub: 'u1', exp: NOW + SESSION_MAX_TTL_S }) }).source).toBe('session');
    expect(sessionTtlProblem(NOW + SESSION_MAX_TTL_S + 1, NOW)).toMatch(/86400/);
    expect(sessionTtlProblem(NOW + 3600, NOW)).toBeUndefined();
  });

  it('link 된 프로젝트가 코드의 ref 와 다르면 멈춘다(스키마와 데이터가 갈라지는 걸 막는다). link 파일이 없으면 통과', () => {
    expect(() => resolve({ linkedRef: 'abcdefghijklmnopqrst', readSession: () => valid })).toThrow(/PROJECT_REF/);
    expect(resolve({ linkedRef: undefined, readSession: () => valid }).source).toBe('session');
  });

  it('publishable 키가 코드에 없거나 형식이 틀리면 세션·anon 경로 모두 멈춘다', () => {
    expect(() => resolve({ publishableKey: '', readSession: () => valid })).toThrow(/PUBLISHABLE_KEY/);
    expect(() => resolve({ publishableKey: '', readOnly: true })).toThrow(/PUBLISHABLE_KEY/);
    expect(() => resolve({ publishableKey: 'sb_secret_abcdefghijklmnop', readOnly: true })).toThrow(/sb_publishable_/);
  });

  it('안내 문구에 토큰·키 값이 실리지 않는다', () => {
    let msg = '';
    try { resolve({ readSession: () => expired }); } catch (e) { msg = e.message; }
    expect(msg).not.toContain(expired);
    expect(msg).not.toContain(PUB);
  });
});

describe('projectUrl', () => {
  it('ref 로 URL 을 만든다 — SUPABASE_URL 을 따로 둘 필요가 없다', () => {
    expect(projectUrl('abc')).toBe('https://abc.supabase.co');
  });
});
