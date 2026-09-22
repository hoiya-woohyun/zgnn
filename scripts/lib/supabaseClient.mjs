// Supabase 클라이언트를 만드는 유일한 곳(ADR-016 v4: Auth 로그인 모델). 인증은 세 출처 중 하나로, 이 순서로 정해진다:
//   1. env `SUPABASE_SERVICE_ROLE_KEY` — GitHub Actions 만. RLS 를 우회하는 키라 러너 밖엔 두지 않는다.
//   2. 키체인의 로그인 세션(`pnpm data:login` 이 넣은 access token) — 로컬. publishable 키 + `Authorization: Bearer <JWT>` 로
//      PostgREST 에 가고, RLS 가 `operators` 허용 목록으로 가른다. `exp` 가 지났으면 여기서 멈추고 다시 로그인하라고 한다.
//   3. publishable 키만(anon) — Vercel 빌드의 `data:pull`. RLS 가 published places·items 의 select 만 허용한다.
// 값은 이 프로세스 안에만 있고 찍지 않는다 — 어느 출처를 썼는지(이름)만 로그에 남긴다. 경계는 세 가지뿐이다: 파일에 값이 없다 · `exp`(≤1일) ·
// RLS 범위. 키체인 deny 는 이 머신에서 경계가 아니다(`node -e` 로 읽힌다) — 읽어도 하루면 죽고 운영자 권한 밖은 못 하게 하는 것이 설계다.
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { readSession as readKeychainSession } from './sessionKeychain.mjs';

const ROOT = new URL('../../', import.meta.url);

// 둘 다 공개값이다. ref 는 API 주소의 서브도메인이고, publishable 키는 브라우저 번들에 실으라고 만든 키다(RLS 가 방어선).
// 코드 상수인 이유: Vercel·Actions 엔 `supabase/.temp/project-ref`(gitignored) 가 없다. link 된 ref 가 이 값과 다르면 아래서 멈춘다.
export const PROJECT_REF = 'qfzasaszpwcgtbzirujx';
export const PUBLISHABLE_KEY = 'sb_publishable_OqCciy03V9rlf6X2l9mJvA_vimcVhSz';

// "공개 상수" 자리에 secret/service_role 키를 붙여 넣어도 PostgREST 는 그대로 동작한다(오히려 RLS 우회) — 형식으로 막는다.
export function assertPublishableKey(key) {
  if (key && !/^sb_publishable_[A-Za-z0-9_-]{16,}$/.test(key)) {
    throw new Error('PUBLISHABLE_KEY 는 sb_publishable_ 로 시작해야 한다 — secret/service_role/legacy JWT 를 넣으면 레포에 시크릿이 커밋된다.');
  }
}
assertPublishableKey(PUBLISHABLE_KEY);

// 만료 직전 토큰으로 긴 `data:analyze`(20분 상한) 를 시작해 중간에 401 로 죽지 않게, 이만큼 앞당겨 "만료" 로 본다.
export const SESSION_EXP_SKEW_S = 30 * 60;
// 요구 ⑤ "토큰 1일 미만" 을 코드가 단언한다 — 대시보드 JWT expiry 는 값 없이 검증할 수 없으니, 더 긴 토큰은 세션으로 쓰지도 저장하지도 않는다.
export const SESSION_MAX_TTL_S = 24 * 60 * 60;

export function projectUrl(ref) {
  return `https://${ref}.supabase.co`;
}

// 안내 문구용. 사용자가 보는 "만료" 는 exp 가 아니라 exp − skew 다 — exp 만 보여 주면 "만료 전인데 왜 거부하나" 가 되고, 시각만 보여 주면
// "미래에 만료됐다" 로 읽힌다. login·createSupabase·거부 문구가 같은 값과 같은 형식으로 말하게 한 곳에 둔다.
export const formatTime = (sec) => new Date(sec * 1000).toLocaleString('ko-KR');
export const sessionUsableUntil = (exp) => exp - SESSION_EXP_SKEW_S;
export const SESSION_EXP_SKEW_MIN = Math.round(SESSION_EXP_SKEW_S / 60);

// JWT 의 `exp`(초) 또는 undefined(JWT 가 아님). 서명은 확인하지 않는다 — 서버가 한다. 여기선 안내 문구를 고르기 위한 것.
export function jwtExpiresAt(token) {
  const parts = typeof token === 'string' ? token.split('.') : [];
  if (parts.length !== 3) return undefined;
  try {
    const exp = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')).exp;
    return Number.isFinite(exp) ? exp : undefined;
  } catch {
    return undefined;
  }
}

function linkedProjectRef() {
  try {
    return readFileSync(new URL('supabase/.temp/project-ref', ROOT), 'utf8').trim();
  } catch {
    return undefined;
  }
}

const LOGIN_HINT = '사용자 터미널에서 `pnpm data:login`(이메일·비밀번호) 뒤 다시 실행. 에이전트 세션 안에서는 되지 않는다.';

// 세션 수명이 하루를 넘으면 세션으로 쓰지 않는다(login.mjs 도 저장 전에 같은 검사). 반환: 문제 없으면 undefined, 있으면 이유.
export function sessionTtlProblem(exp, now) {
  if (exp - now > SESSION_MAX_TTL_S) {
    return `세션 수명이 하루를 넘는다(만료 ${formatTime(exp)}) — 대시보드 Authentication → JWT expiry 를 86400 이하로 내리고 다시 pnpm data:login`;
  }
  return undefined;
}

// 순수 함수: 출처를 골라 { url, key, source, accessToken? } 를 돌려주거나 throw. 값을 읽는 쪽(env·키체인·시계)은 전부 주입 가능.
// readOnly(pull-db): **항상 anon** — 세션이 있어도 쓰지 않는다. published 만 읽는 스크립트에 운영자 토큰을 실을 이유가 없고, 그래야
// Vercel 과 로컬이 같은 경로로 돌며, 비운영자 세션이 빈 결과를 내는 경우도 없다. 쓰기 스크립트는 세션이 없거나 만료면 그 자리에서 멈춘다 —
// anon 으로 보내면 첫 insert 에서 RLS 42501 로 죽는데, 그 메시지는 "로그인하라" 로 읽히지 않는다.
// URL 은 세션·anon 경로에서 코드 상수로 고정한다 — env 로 바꿀 수 있으면 `SUPABASE_URL=https://attacker pnpm data:apply` 한 줄이 키체인 JWT 를 밖으로 보낸다.
export function resolveSupabaseCredentials({
  env = process.env,
  readSession = readKeychainSession,
  now = () => Date.now() / 1000,
  readOnly = false,
  linkedRef = linkedProjectRef(),
  publishableKey = PUBLISHABLE_KEY,
} = {}) {
  const url = projectUrl(PROJECT_REF);
  const inCi = env.CI === 'true' || env.CI === '1'; // GitHub Actions `CI=true`, Vercel `CI=1`
  // service 키는 CI 에서만 받아들인다. 로컬 env 에 남아 있으면 조용히 RLS 를 우회하는 대신 여기서 멈춘다 — readOnly 라도 같다(anon 으로 넘어가지 않는다:
  // 실측: 옛 .env.local 이 남아 있어 `data:pull` 이 세션 없이 service 로 붙었다). 트립와이어다(CI=1 을 붙이면 넘어간다) — 경계가 아니라 사고 감지용.
  if (env.SUPABASE_SERVICE_ROLE_KEY && !inCi) {
    throw new Error('로컬 env 에 SUPABASE_SERVICE_ROLE_KEY 가 있다 — ADR-016 v4 는 service 키를 CI 에서만 쓴다. .env.local·셸에서 지우고 `pnpm data:login` 세션으로 붙는다.');
  }
  // readOnly 는 CI 에 service 키가 남아 있어도 anon 이다 — "빌드는 anon" 이 Vercel env 정리 순서가 아니라 코드 불변식이 되게(self-cr 지적). 아래 anon 반환.
  if (!readOnly) {
    if (env.SUPABASE_SERVICE_ROLE_KEY) return { url: env.SUPABASE_URL || url, key: env.SUPABASE_SERVICE_ROLE_KEY, source: 'service' };
    // Actions 러너에서 시크릿이 비었을 때 "로그인하라" 는 안내는 틀린 방향이다 — 그 자리에서 시크릿 이름을 말한다.
    if (env.GITHUB_ACTIONS === 'true') throw new Error('GitHub Secrets 의 SUPABASE_SERVICE_ROLE_KEY 가 비어 있다 — `gh secret set SUPABASE_SERVICE_ROLE_KEY`.');
  }
  if (linkedRef && linkedRef !== PROJECT_REF) {
    throw new Error(`link 된 프로젝트(${linkedRef})가 코드의 PROJECT_REF(${PROJECT_REF})와 다르다 — 스키마와 데이터가 다른 프로젝트를 가리킨다. 둘 중 하나를 고친다.`);
  }
  assertPublishableKey(publishableKey);
  if (!publishableKey) throw new Error('publishable 키가 코드에 없다 — scripts/lib/supabaseClient.mjs 의 PUBLISHABLE_KEY(대시보드 Project Settings → API Keys 의 Publishable key 행, 공개값).');
  if (readOnly) return { url, key: publishableKey, source: 'anon' };

  const token = readSession();
  if (!token) throw new Error(`로그인이 필요하다 — ${LOGIN_HINT}`);
  const exp = jwtExpiresAt(token);
  if (exp === undefined) throw new Error(`저장된 세션이 JWT 가 아니다 — ${LOGIN_HINT}`);
  const at = now();
  const tooLong = sessionTtlProblem(exp, at);
  if (tooLong) throw new Error(tooLong);
  // 진짜 만료와 skew 창 안을 나눠 말한다 — 후자를 "만료됐다(미래 시각)" 로 쓰면 시계가 틀린 것처럼 읽힌다.
  if (exp <= at) throw new Error(`로그인 세션이 만료됐다(${formatTime(exp)}) — ${LOGIN_HINT}`);
  if (sessionUsableUntil(exp) <= at) {
    throw new Error(`로그인 세션이 만료 ${SESSION_EXP_SKEW_MIN}분 전이라 세션으로 쓰지 않는다(만료 ${formatTime(exp)} — 긴 data:analyze 가 중간에 죽지 않게 ${SESSION_EXP_SKEW_MIN}분 앞당겨 본다) — ${LOGIN_HINT}`);
  }
  return { url, key: publishableKey, source: 'session', accessToken: token, expiresAt: exp };
}

const SOURCE_LABEL = {
  service: 'env(service key — RLS 우회)',
  session: '로그인 세션(JWT — operators RLS)',
  anon: 'publishable(anon — published 읽기만)',
};

// 스크립트 진입점용: 실패하면 이유를 찍고 exit 1. 조용히 스냅샷으로 넘어가지 않는다(CI 가 옛 데이터로 빌드되는 걸 막는다).
// 어느 출처를 썼는지 한 줄 찍는다 — `data:pull` 은 세 출처 모두에서 같은 결과가 나와 로그 없이는 무엇으로 붙었는지 알 수 없다.
export function createSupabase({ readOnly = false } = {}) {
  let creds;
  try {
    creds = resolveSupabaseCredentials({ readOnly });
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
  const until = creds.expiresAt ? ` · 만료 ${formatTime(creds.expiresAt)}(실효 ${formatTime(sessionUsableUntil(creds.expiresAt))} 까지)` : '';
  console.log(`Supabase 인증: ${SOURCE_LABEL[creds.source]}${until}`);
  return createClient(creds.url, creds.key, {
    auth: { persistSession: false, autoRefreshToken: false },
    // 사용자 JWT 는 두 번째 인자(apikey)가 아니라 Authorization 헤더로 간다 — apikey 자리에 넣으면 401 이 나서 RLS 버그처럼 보인다.
    ...(creds.accessToken ? { global: { headers: { Authorization: `Bearer ${creds.accessToken}` } } } : {}),
  });
}
