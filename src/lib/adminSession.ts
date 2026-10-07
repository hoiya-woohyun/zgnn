/**
 * 운영자 검수 화면(`/admin`)의 로그인 세션 — **access token 하나만** 들고 있다(ADR-016 · ADR-018).
 *
 * supabase-js 의 브라우저 기본값(`persistSession` + `autoRefreshToken` + localStorage 의 refresh token)을
 * 쓰지 않는 이유가 여기 있다. refresh token 을 저장하면 만료가 사실상 사라져 **영구 로그인**이 되고,
 * ADR-016 이 그은 경계("값이 파일에 없다 · exp ≤ 1일 · RLS 범위") 중 두 번째가 조용히 깨진다.
 * CLI(`scripts/login.mjs`)가 키체인에 access token 만 넣는 것과 같은 원칙이고, 대가도 같다 —
 * 원격 JWT expiry 가 12시간이라 하루에 한 번 다시 로그인한다.
 *
 * 저장소는 localStorage 다. 정적 내보내기라 서버가 없어 쿠키를 읽어 줄 쪽이 없고,
 * sessionStorage 는 탭을 닫으면 사라져 검수 도중 새로고침 한 번에 다시 로그인하게 된다.
 * 모든 접근은 함수 안에서, try/catch 로 감싼다 — 사생활 보호 모드·사이트 데이터 차단에서는 접근 자체가 던지고,
 * 이 모듈의 순수 함수들은 localStorage 가 없는 곳(vitest)에서도 테스트된다.
 */

export type TAdminSession = {
  accessToken: string;
  /** JWT 의 `exp`(초 단위 epoch). 토큰 안에 든 값을 그대로 쓴다 — 우리가 계산한 만료는 서버와 어긋날 수 있다. */
  expiresAt: number;
  email: string;
};

export const ADMIN_SESSION_KEY = 'zgnn.admin.session';

/** `scripts/lib/supabaseClient.mjs` 의 SESSION_MAX_TTL_S 와 같은 값·같은 뜻 — 하루보다 긴 토큰은 거부한다(ADR-016 경계). */
export const SESSION_MAX_TTL_S = 24 * 60 * 60;

/**
 * 만료 직전을 만료로 본다. CLI 는 30분을 보는데(긴 배치가 중간에 401 로 죽지 않게) 여기는 1분이다 —
 * 화면은 버튼을 누를 때마다 다시 확인하고, 만료됐으면 사용자가 그 자리에서 다시 로그인할 수 있다.
 */
export const SESSION_EXP_SKEW_S = 60;

export type TSessionProblem = 'none' | 'expired' | 'tooLong' | 'invalid';

/**
 * base64url 한 조각 → 바이트 문자열. `atob` 는 base64 만 받으므로 글자를 바꾸고 `=` 로 4의 배수까지 채운다 —
 * JWT 조각은 패딩 없이 오기 때문에 이 줄이 없으면 길이에 따라 들쭉날쭉 실패한다.
 */
const decodeBase64Url = (segment: string): string | undefined => {
  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  try {
    return atob(padded);
  } catch {
    return undefined;
  }
};

/**
 * JWT 의 `exp`(초). 읽을 수 없으면 undefined — 서명은 검증하지 않는다.
 * 검증은 서버(PostgREST)가 하고, 여기서 보는 것은 "이 토큰을 더 보내 볼 가치가 있는가" 하나다.
 *
 * `atob` 는 UTF-8 을 모르므로 payload 에 한글이 있으면 글자가 깨지지만, 우리가 꺼내는 `exp` 는 숫자라 무해하다.
 */
export function jwtExpiresAt(token: string): number | undefined {
  const parts = (token ?? '').split('.');
  if (parts.length !== 3) return undefined;
  const json = decodeBase64Url(parts[1]);
  if (!json) return undefined;
  try {
    const { exp } = JSON.parse(json) as { exp?: unknown };
    return typeof exp === 'number' && Number.isFinite(exp) ? exp : undefined;
  } catch {
    return undefined;
  }
}

/** 이 세션을 지금 써도 되는가. 화면이 갈래마다 다른 문구를 띄우므로 boolean 이 아니라 사유를 돌려준다. */
export function sessionProblem(session: TAdminSession | null, nowSec: number): TSessionProblem {
  if (
    !session ||
    typeof session.accessToken !== 'string' ||
    session.accessToken === '' ||
    typeof session.email !== 'string' ||
    typeof session.expiresAt !== 'number' ||
    !Number.isFinite(session.expiresAt)
  ) {
    return 'invalid';
  }
  if (session.expiresAt <= nowSec + SESSION_EXP_SKEW_S) return 'expired';
  if (session.expiresAt - nowSec > SESSION_MAX_TTL_S) return 'tooLong';
  return 'none';
}

const nowSeconds = () => Math.floor(Date.now() / 1000);

/**
 * 저장된 세션. 쓸 수 없는 세션(만료·형식 이상·너무 긴 TTL)은 **지우고** null 을 돌려준다 —
 * 남겨 두면 다음 요청이 401 을 받고 화면은 "왜 비었는지" 를 말할 수 없다.
 */
export function readAdminSession(nowSec: number = nowSeconds()): TAdminSession | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(ADMIN_SESSION_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  let parsed: TAdminSession | null = null;
  try {
    parsed = JSON.parse(raw) as TAdminSession;
  } catch {
    clearAdminSession();
    return null;
  }
  if (sessionProblem(parsed, nowSec) !== 'none') {
    clearAdminSession();
    return null;
  }
  return parsed;
}

/** 검사를 통과한 세션만 저장한다. 통과 못 한 것은 던진다 — 로그인 화면이 그 문구를 그대로 보여 준다. */
export function writeAdminSession(session: TAdminSession): void {
  const problem = sessionProblem(session, nowSeconds());
  if (problem === 'tooLong') {
    throw new Error('토큰 유효기간이 하루를 넘어요 — Supabase 의 JWT expiry 설정을 확인해 주세요.');
  }
  if (problem !== 'none') {
    throw new Error('로그인 정보를 저장할 수 없어요 — 다시 로그인해 주세요.');
  }
  try {
    localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(session));
  } catch {
    // 저장이 막혀도(사생활 보호 모드) 이번 세션은 메모리에 있어 검수는 된다 — 새로고침하면 다시 로그인한다.
  }
}

export function clearAdminSession(): void {
  try {
    localStorage.removeItem(ADMIN_SESSION_KEY);
  } catch {
    // 지울 수 없으면 읽기도 막힌 상태다 — 할 일이 없다.
  }
}

/**
 * `candidates.reviewer_note` 에 한 줄 덧붙이기. 옛 터미널 검수 창(ADR-024 로 지웠다)이 `[data:review]` 로 남긴 줄과 **같은 모양**이다 —
 * 같은 칸에 쌓이므로 덮어쓰면 사람이 남긴 사유가 사라진다. 태그만 `[admin]` 으로 다르다.
 */
export function appendReviewerNote(existing: string | null | undefined, line: string): string {
  return existing ? `${existing}\n${line}` : line;
}
