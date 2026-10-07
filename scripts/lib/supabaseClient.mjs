// Supabase 클라이언트를 만드는 유일한 곳(ADR-016 v5: Auth 로그인 모델, service 키 없음). 인증은 두 출처 중 하나로, 스크립트 종류가 고른다:
//   1. 키체인의 로그인 세션(`pnpm data login` 이 넣은 access token) — 쓰기 스크립트(collect·analyze·apply·seed). publishable 키 + `Authorization: Bearer <JWT>` 로
//      PostgREST 에 가고, RLS 가 `operators` 허용 목록으로 가른다. `exp` 가 지났으면 여기서 멈추고 다시 로그인하라고 한다.
//   2. publishable 키만(anon) — `pnpm data pull`(readOnly). Vercel 빌드와 로컬이 같은 경로다. RLS 가 published places·items 의 select 만 허용한다.
// service_role 키는 어디서도 쓰지 않는다(v5 에서 Actions 폐지) — env 에 있으면 "안 쓴다" 가 아니라 **멈춘다**(resolveSupabaseCredentials 의 트립와이어).
// 값은 이 프로세스 안에만 있고 찍지 않는다 — 어느 출처를 썼는지(이름)만 로그에 남긴다. 경계는 세 가지뿐이다: 파일에 값이 없다 · `exp`(≤1일) ·
// RLS 범위. 키체인 deny 는 이 머신에서 경계가 아니다(`node -e` 로 읽힌다) — 읽어도 하루면 죽고 운영자 권한 밖은 못 하게 하는 것이 설계다.
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { readSession as readKeychainSession } from './sessionKeychain.mjs';
import { PROJECT_REF, PROJECT_URL, PUBLISHABLE_KEY, assertPublishableKey } from './supabasePublic.mjs';

// 공개 상수(PROJECT_REF·PUBLISHABLE_KEY·assertPublishableKey·projectUrl)는 브라우저(src/lib/admin*)와 나눠 쓰려고 supabasePublic.mjs 로 옮겼다(ADR-018).
// 이 모듈은 node 전용(키체인·fs)이라 브라우저가 못 가져오고, 기존 importer(login.mjs·테스트)는 같은 이름을 계속 쓰게 여기서 다시 내보낸다.
export { PROJECT_REF, PUBLISHABLE_KEY, assertPublishableKey, projectUrl } from './supabasePublic.mjs';

const ROOT = new URL('../../', import.meta.url);

// 만료 직전 토큰으로 긴 `pnpm data analyze`(한 실행이 세션 창 안에 끝나야 한다 — analyzeCandidates.mjs 의 DEFAULT_LIMIT 주석) 를 시작해 중간에 401 로 죽지 않게, 이만큼 앞당겨 "만료" 로 본다.
export const SESSION_EXP_SKEW_S = 30 * 60;
// 요구 ⑤ "토큰 1일 미만" 을 코드가 단언한다 — 대시보드 JWT expiry 는 값 없이 검증할 수 없으니, 더 긴 토큰은 세션으로 쓰지도 저장하지도 않는다.
export const SESSION_MAX_TTL_S = 24 * 60 * 60;

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

const LOGIN_HINT = '사용자 터미널에서 `pnpm data login`(이메일·비밀번호) 뒤 다시 실행. 에이전트 세션 안에서는 되지 않는다.';

// 세션 수명이 하루를 넘으면 세션으로 쓰지 않는다(login.mjs 도 저장 전에 같은 검사). 반환: 문제 없으면 undefined, 있으면 이유.
export function sessionTtlProblem(exp, now) {
  if (exp - now > SESSION_MAX_TTL_S) {
    return `세션 수명이 하루를 넘는다(만료 ${formatTime(exp)}) — 대시보드 Authentication → JWT expiry 를 86400 이하로 내리고 다시 pnpm data login`;
  }
  return undefined;
}

// 순수 함수: 출처를 골라 { url, key, source, accessToken?, expiresAt?, ignoredEnv? } 를 돌려주거나 throw. 값을 읽는 쪽(env·키체인·시계)은 전부 주입 가능.
// readOnly(pull-db): **항상 anon** — 세션이 있어도 쓰지 않는다. published 만 읽는 스크립트에 운영자 토큰을 실을 이유가 없고, 그래야
// Vercel 과 로컬이 같은 경로로 돌며, 비운영자 세션이 빈 결과를 내는 경우도 없다. 쓰기 스크립트는 세션이 없거나 만료면 그 자리에서 멈춘다 —
// anon 으로 보내면 첫 insert 에서 RLS 42501 로 죽는데, 그 메시지는 "로그인하라" 로 읽히지 않는다.
// URL 은 코드 상수로 고정한다(env 로 못 바꾼다) — 바꿀 수 있으면 `SUPABASE_URL=https://attacker pnpm data apply` 한 줄이 키체인 JWT 를 밖으로 보낸다.
export function resolveSupabaseCredentials({
  env = process.env,
  readSession = readKeychainSession,
  now = () => Date.now() / 1000,
  readOnly = false,
  linkedRef = linkedProjectRef(),
  publishableKey = PUBLISHABLE_KEY,
} = {}) {
  const url = PROJECT_URL;
  if (linkedRef && linkedRef !== PROJECT_REF) {
    throw new Error(`link 된 프로젝트(${linkedRef})가 코드의 PROJECT_REF(${PROJECT_REF})와 다르다 — 스키마와 데이터가 다른 프로젝트를 가리킨다. 둘 중 하나를 고친다.`);
  }
  assertPublishableKey(publishableKey);
  if (!publishableKey) throw new Error('publishable 키가 코드에 없다 — scripts/lib/supabasePublic.mjs 의 PUBLISHABLE_KEY(대시보드 Project Settings → API Keys 의 Publishable key 행, 공개값).');
  // readOnly 는 env 에 service 키가 남아 있어도 anon 이다 — "빌드는 anon" 이 env 정리 순서가 아니라 코드 불변식이 되게(1b4264c). 다만 조용히 넘기면
  // 감지가 사라진다: 옛 .env.local 잔존을 처음 잡은 것이 `pnpm data pull` 의 출처 로그였다. 그래서 이름만 `ignoredEnv` 에 얹고 createSupabase 가 한 줄 경고로 찍는다.
  if (readOnly) {
    return { url, key: publishableKey, source: 'anon', ...(env.SUPABASE_SERVICE_ROLE_KEY ? { ignoredEnv: ['SUPABASE_SERVICE_ROLE_KEY'] } : {}) };
  }
  // 트립와이어(경계가 아니라 사고 감지용): v5 는 service 키를 어디서도 쓰지 않으므로 env 에 "있다" 자체가 사고다. CI 든 아니든 멈춘다 — 예외를 두면(옛 `CI=1`)
  // 그 한 줄로 넘어가고, 조용히 무시하면 감지가 사라진다. 세션이 유효해도 먼저 본다: 키를 지우기 전엔 쓰기 스크립트가 돌지 않게.
  if (env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('로컬 env 에 SUPABASE_SERVICE_ROLE_KEY 가 있다 — ADR-016 v5 는 service 키를 어디서도 쓰지 않는다. 셸·.env.local 에서 지우고 `pnpm data login` 세션으로 붙는다.');
  }

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
    throw new Error(`로그인 세션이 만료 ${SESSION_EXP_SKEW_MIN}분 전이라 세션으로 쓰지 않는다(만료 ${formatTime(exp)} — 긴 pnpm data analyze 가 중간에 죽지 않게 ${SESSION_EXP_SKEW_MIN}분 앞당겨 본다) — ${LOGIN_HINT}`);
  }
  return { url, key: publishableKey, source: 'session', accessToken: token, expiresAt: exp };
}

const SOURCE_LABEL = {
  session: '로그인 세션(JWT — operators RLS)',
  anon: 'publishable(anon — published 읽기만)',
};

// readOnly 가 env 의 service 키를 무시하고 anon 으로 갔을 때의 한 줄(이름만, 값은 없다). 무시할 게 없으면 undefined — 찍지 않는다.
// 문구 생성만 떼어 낸 이유: 이 경고는 "조용히 넘기면 사고 감지가 사라진다" 를 막으려고 있는 건데, createSupabase 안의
// console.error 로 두면 그 경고 자체가 테스트에 안 잡힌다 — 필드명 오타 하나로 경고가 사라져도 초록이다.
export function ignoredEnvWarning(creds) {
  if (!creds?.ignoredEnv?.length) return undefined;
  return `경고: env 의 ${creds.ignoredEnv.join('·')} 를 무시했다(anon 으로 붙음) — ADR-016 v5 는 service 키를 어디서도 쓰지 않는다. 셸·.env.local 에서 지운다.`;
}

// 스크립트 진입점용: 실패하면 이유를 찍고 exit 1. 조용히 스냅샷으로 넘어가지 않는다(Vercel 빌드가 옛 데이터로 돌아가는 걸 막는다).
// 어느 출처를 썼는지 한 줄 찍는다 — 두 출처는 `pnpm data pull` 결과가 같아 로그 없이는 무엇으로 붙었는지 알 수 없다. 옛 .env.local 잔존을 처음 잡은 것도 이 로그였다.
export function createSupabase({ readOnly = false } = {}) {
  let creds;
  try {
    creds = resolveSupabaseCredentials({ readOnly });
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
  const until = creds.expiresAt ? ` · 만료 ${formatTime(creds.expiresAt)}(실효 ${formatTime(sessionUsableUntil(creds.expiresAt))} 까지)` : '';
  // 라벨이 없는 출처를 새로 넣어도 `Supabase 인증: undefined` 가 되지 않게 — 이름이라도 찍는다.
  console.log(`Supabase 인증: ${SOURCE_LABEL[creds.source] ?? creds.source}${until}`);
  // 빌드는 계속된다 — 멈추면 "빌드는 anon" 이 다시 env 정리 순서에 묶인다.
  const warning = ignoredEnvWarning(creds);
  if (warning) console.error(warning);
  return createClient(creds.url, creds.key, {
    auth: { persistSession: false, autoRefreshToken: false },
    // 사용자 JWT 는 두 번째 인자(apikey)가 아니라 Authorization 헤더로 간다 — apikey 자리에 넣으면 401 이 나서 RLS 버그처럼 보인다.
    ...(creds.accessToken ? { global: { headers: { Authorization: `Bearer ${creds.accessToken}` } } } : {}),
  });
}
