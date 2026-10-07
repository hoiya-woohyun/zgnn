import { describe, expect, it } from 'vitest';
import {
  PROJECT_REF, SESSION_EXP_SKEW_MIN, SESSION_EXP_SKEW_S, SESSION_MAX_TTL_S, assertPublishableKey, formatTime, ignoredEnvWarning, jwtExpiresAt,
  projectUrl, resolveSupabaseCredentials, sessionTtlProblem, sessionUsableUntil,
} from './supabaseClient.mjs';

// 서명 없는 가짜 JWT — 서명은 서버가 확인하고, 여기선 `exp` 만 읽는다.
const jwt = (payload) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.sig`;
const NOW = 1_800_000_000;
const valid = jwt({ sub: 'u1', exp: NOW + 3600 });
const expired = jwt({ sub: 'u1', exp: NOW - 10 });
const PUB = 'sb_publishable_abcdefghijklmnop';
const PINNED = projectUrl(PROJECT_REF);

// 기본값: 키체인 없음 · env 비어 있음 · link 일치 · publishable 키 있음.
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
  it('service 키는 CI 든 아니든 거부한다 — v5 는 service 경로 자체가 없어 env 에 "있다" 가 곧 사고다. 세션이 유효해도 먼저 멈춘다', () => {
    for (const ci of [{}, { CI: 'true' }, { CI: '1' }, { CI: 'false' }, { CI: 'true', GITHUB_ACTIONS: 'true' }]) {
      const env = { ...ci, SUPABASE_SERVICE_ROLE_KEY: 'k' };
      expect(() => resolve({ env, readSession: () => valid })).toThrow(/어디서도 쓰지 않는다.*pnpm data login/s);
      expect(() => resolve({ env })).toThrow(/SUPABASE_SERVICE_ROLE_KEY 가 있다/);
    }
    // 옛 "CI 에서만 쓴다" 예외는 사라졌다 — CI=1 한 줄로 트립와이어를 넘어갈 수 없다
    expect(() => resolve({ env: { CI: '1', SUPABASE_SERVICE_ROLE_KEY: 'k' }, readSession: () => valid })).not.toThrow(/CI 에서만/);
  });

  it('readOnly + service 키 → anon(1b4264c 불변식) 이되 이름만 ignoredEnv 로 남긴다 — 조용히 넘기면 사고 감지가 사라진다', () => {
    const SERVICE = 'sb_secret_should_never_appear';
    for (const ci of [{}, { CI: '1' }, { CI: 'true', GITHUB_ACTIONS: 'true' }]) {
      expect(resolve({ env: { ...ci, SUPABASE_SERVICE_ROLE_KEY: SERVICE }, readOnly: true }))
        .toStrictEqual({ url: PINNED, key: PUB, source: 'anon', ignoredEnv: ['SUPABASE_SERVICE_ROLE_KEY'] });
    }
    expect(JSON.stringify(resolve({ env: { SUPABASE_SERVICE_ROLE_KEY: SERVICE }, readOnly: true }))).not.toContain(SERVICE); // 이름만, 값은 없다
    // service 키가 없으면 필드 자체가 없다 — 평소 반환 객체는 그대로
    expect(resolve({ readOnly: true })).toStrictEqual({ url: PINNED, key: PUB, source: 'anon' });
    expect(resolve({ env: { CI: 'true', GITHUB_ACTIONS: 'true' }, readOnly: true }).source).toBe('anon'); // 시크릿 없는 러너도 읽기는 된다
  });

  it('GITHUB_ACTIONS=true 여도 세션이 없으면 로그인 안내다 — Actions 전용 문구(gh secret set)는 사라졌다', () => {
    const env = { CI: 'true', GITHUB_ACTIONS: 'true' };
    expect(() => resolve({ env })).toThrow(/로그인이 필요하다.*pnpm data login/s);
    expect(() => resolve({ env })).not.toThrow(/gh secret set|GitHub Secrets/);
    expect(resolve({ env, readSession: () => valid }).source).toBe('session'); // 러너라는 이유로 세션을 거부하지도 않는다
  });

  it('SUPABASE_URL env 는 어떤 경로에서도 무시된다 — 허용된 명령 한 줄로 JWT 를 다른 호스트에 보낼 수 없게. env 로 URL 을 받던 service 경로는 없다', () => {
    expect(resolve({ env: { SUPABASE_URL: 'https://attacker' }, readSession: () => valid }).url).toBe(PINNED);
    expect(resolve({ env: { SUPABASE_URL: 'https://attacker' }, readOnly: true }).url).toBe(PINNED);
    expect(resolve({ env: { CI: '1', SUPABASE_URL: 'https://attacker', SUPABASE_SERVICE_ROLE_KEY: 'k' }, readOnly: true }).url).toBe(PINNED);
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
    expect(() => resolve()).toThrow(/로그인이 필요하다.*pnpm data login/s);
    expect(() => resolve({ readSession: () => 'garbage' })).toThrow(/JWT 가 아니다.*pnpm data login/s);
    expect(() => resolve({ readSession: () => expired })).toThrow(/만료됐다.*pnpm data login/s);
  });

  it('다시 로그인하면 풀리는 거부에만 loginNeeded 표식 — 워커가 이것만 보고 비밀번호를 묻는다', () => {
    const thrown = (opts) => {
      try { resolve(opts); } catch (e) { return e; }
      return null;
    };
    for (const readSession of [() => undefined, () => 'garbage', () => expired, () => jwt({ sub: 'u1', exp: NOW + 1 })]) {
      expect(thrown({ readSession }).loginNeeded).toBe(true);
    }
    // 로그인해도 안 풀리는 것 — 표식이 없어야 워커가 묻기를 되풀이하지 않는다
    expect(thrown({ env: { SUPABASE_SERVICE_ROLE_KEY: 'k' }, readSession: () => jwt({ sub: 'u1', exp: NOW + 3600 }) }).loginNeeded).toBeUndefined();
    expect(thrown({ linkedRef: 'abcdefghijklmnopqrst', readSession: () => jwt({ sub: 'u1', exp: NOW + 3600 }) }).loginNeeded).toBeUndefined();
    expect(thrown({ readSession: () => jwt({ sub: 'u1', exp: NOW + SESSION_MAX_TTL_S + 1 }) }).loginNeeded).toBeUndefined();
  });

  it('만료 여유(skew) 안쪽은 세션으로 쓰지 않는다 — 긴 분석이 중간에 401 로 죽지 않게(한 실행은 세션 창 안에)', () => {
    expect(() => resolve({ readSession: () => jwt({ sub: 'u1', exp: NOW + SESSION_EXP_SKEW_S - 1 }) })).toThrow(/세션으로 쓰지 않는다/);
    expect(() => resolve({ readSession: () => jwt({ sub: 'u1', exp: NOW + SESSION_EXP_SKEW_S }) })).toThrow(/세션으로 쓰지 않는다/);
    expect(resolve({ readSession: () => jwt({ sub: 'u1', exp: NOW + SESSION_EXP_SKEW_S + 1 }) }).source).toBe('session');
  });

  it('진짜 만료(exp 가 지남)는 "만료됐다(시각)" — skew 얘기는 하지 않는다', () => {
    let msg = '';
    try { resolve({ readSession: () => expired }); } catch (e) { msg = e.message; }
    expect(msg).toMatch(/^로그인 세션이 만료됐다\(/);
    expect(msg).toContain(formatTime(NOW - 10));
    expect(msg).not.toMatch(/분 전/);
    expect(msg).toContain('pnpm data login');
    // 두 문구가 갈리는 경계 — exp 가 정확히 지금이면 "만료됐다", 1초 뒤면 skew 창. `<` 로 바뀌면 "지금 만료되는데 N분 전" 이 된다
    expect(() => resolve({ readSession: () => jwt({ sub: 'u1', exp: NOW }) })).toThrow(/^로그인 세션이 만료됐다\(/);
    expect(() => resolve({ readSession: () => jwt({ sub: 'u1', exp: NOW }) })).not.toThrow(/분 전/);
    expect(() => resolve({ readSession: () => jwt({ sub: 'u1', exp: NOW + 1 }) })).toThrow(/분 전이라 세션으로 쓰지 않는다/);
  });

  it('skew 창 안(exp 는 아직 미래)은 "만료 N분 전이라 쓰지 않는다" 로 구분한다 — "미래 시각에 만료됐다" 로 읽히지 않게. N 은 상수에서 온다', () => {
    const exp = NOW + SESSION_EXP_SKEW_S - 60;
    let msg = '';
    try { resolve({ readSession: () => jwt({ sub: 'u1', exp }) }); } catch (e) { msg = e.message; }
    expect(SESSION_EXP_SKEW_MIN).toBe(SESSION_EXP_SKEW_S / 60);
    expect(msg).toContain(`만료 ${SESSION_EXP_SKEW_MIN}분 전이라 세션으로 쓰지 않는다`);
    expect(msg).toContain(`만료 ${formatTime(exp)}`);
    expect(msg).not.toMatch(/만료됐다/);
    expect(msg).toContain('pnpm data login');
  });

  it('sessionUsableUntil 은 exp 에서 skew 를 뺀 실효 시각 — login·createSupabase 가 사용자에게 보여 주는 값', () => {
    expect(sessionUsableUntil(NOW + 3600)).toBe(NOW + 3600 - SESSION_EXP_SKEW_S);
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

  it('안내 문구에 토큰·키 값이 실리지 않는다 — 트립와이어는 env 이름만 말한다', () => {
    let msg = '';
    try { resolve({ readSession: () => expired }); } catch (e) { msg = e.message; }
    expect(msg).not.toContain(expired);
    expect(msg).not.toContain(PUB);
    const SERVICE = 'sb_secret_should_never_appear';
    let trip = '';
    try { resolve({ env: { SUPABASE_SERVICE_ROLE_KEY: SERVICE } }); } catch (e) { trip = e.message; }
    expect(trip).toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(trip).not.toContain(SERVICE);
  });
});

// resolve 가 만든 객체를 그대로 넣는다 — 문구 쪽만 손으로 지은 객체로 검사하면 필드명 오타를 테스트가 함께 틀려 못 잡는다(생산자와 소비자가 같은 오타를 공유한다).
describe('ignoredEnvWarning — 경고가 조용히 사라지는 것을 막는 절반', () => {
  it('무시한 env 가 있으면 이름만 담은 한 줄, 없으면 undefined(찍지 않는다)', () => {
    const SERVICE = 'sb_secret_should_never_appear';
    const msg = ignoredEnvWarning(resolve({ env: { SUPABASE_SERVICE_ROLE_KEY: SERVICE }, readOnly: true }));
    expect(msg).toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(msg).not.toContain(SERVICE); // 이름만, 값은 없다
    expect(ignoredEnvWarning(resolve({ readOnly: true }))).toBeUndefined();
    expect(ignoredEnvWarning(resolve({ readSession: () => valid }))).toBeUndefined(); // 세션 경로엔 필드 자체가 없다
    expect(ignoredEnvWarning(undefined)).toBeUndefined();
  });
});

describe('projectUrl', () => {
  it('ref 로 URL 을 만든다 — SUPABASE_URL 을 따로 둘 필요가 없다', () => {
    expect(projectUrl('abc')).toBe('https://abc.supabase.co');
  });
});
