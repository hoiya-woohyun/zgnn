/**
 * 운영자 검수 화면이 쓰는 Supabase 클라이언트 — CLI(`scripts/lib/supabaseClient.mjs:132-151`)와 같은 모양이다.
 *
 * supabase-js 의 브라우저 기본값을 셋 다 끈다.
 *  - `persistSession: false` · `autoRefreshToken: false`: 라이브러리가 refresh token 을 localStorage 에 넣고
 *    조용히 갱신하면 만료가 사라져 사실상 영구 로그인이 된다(ADR-016 경계 "exp ≤ 1일"). 세션 보관은
 *    `adminSession.ts` 가 access token 하나로만 한다.
 *  - JWT 는 `global.headers.Authorization` 에 넣고 **apikey 자리(두 번째 인자)는 publishable 키로 둔다.**
 *    바꿔 넣으면 401 이다 — PostgREST 는 apikey 로 프로젝트를 고르고 Authorization 으로 사람을 고른다.
 *
 * 값(PROJECT_URL·PUBLISHABLE_KEY)은 공개 상수다(ADR-016 결정 4). 경계는 이 키가 아니라 RLS·GRANT 이고,
 * 그래서 이 파일이 번들에 그대로 실려도 된다 — `scripts/check-bundle.mjs` 가 "우리 호스트 하나만" 을 지킨다.
 */

import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { PROJECT_URL, PUBLISHABLE_KEY } from '../../scripts/lib/supabasePublic.mjs';
import { jwtExpiresAt, type TAdminSession } from './adminSession';

const AUTH_OPTIONS = { persistSession: false, autoRefreshToken: false } as const;

/** 운영자 세션으로 읽고 쓰는 클라이언트. 토큰이 바뀌면 새로 만든다(헤더가 생성 시점에 박히므로). */
export function createAdminClient(accessToken: string): SupabaseClient {
  return createClient(PROJECT_URL, PUBLISHABLE_KEY, {
    auth: AUTH_OPTIONS,
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

/**
 * 이메일·비밀번호 로그인. 매직링크가 아닌 이유는 SMTP 가 없고 회원가입이 꺼져 있어서다(docs/todo/05).
 *
 * **refresh token 은 받자마자 버린다** — 아래 반환값에 담지 않는 것이 그 전부다(저장 경로가 없으므로).
 */
export async function signInAdmin(email: string, password: string): Promise<TAdminSession> {
  const client = createClient(PROJECT_URL, PUBLISHABLE_KEY, { auth: AUTH_OPTIONS });
  const { data, error } = await client.auth.signInWithPassword({ email, password });

  if (error) {
    // 자격 오류와 그 밖(네트워크·서버·잠김)을 가른다 — 다음에 할 일이 다르다(다시 입력 vs 잠시 뒤 재시도).
    if (error.status === 400) throw new Error('이메일이나 비밀번호가 맞지 않아요.');
    throw new Error(`로그인을 못 했어요 — ${error.message}`);
  }

  const accessToken = data.session?.access_token;
  if (!accessToken) throw new Error('로그인 응답에 세션이 없어요 — 잠시 뒤 다시 시도해 주세요.');

  const expiresAt = jwtExpiresAt(accessToken);
  // 만료를 못 읽은 토큰은 받지 않는다. "언제 끝나는지 모르는 세션" 이 ADR-016 이 막으려는 바로 그것이다.
  if (expiresAt === undefined) throw new Error('토큰에서 만료 시각을 읽지 못했어요 — 다시 로그인해 주세요.');

  return { accessToken, expiresAt, email: data.user?.email ?? email };
}

/**
 * 운영자인가. `operators` 테이블을 직접 읽지 않고 `is_operator()` 를 부르는 이유 —
 * 비운영자에게 RLS 는 **에러가 아니라 빈 결과**를 준다(0행 = false). 그래서 화면이
 * "후보가 없어요" 로 잘못 말하지 않고 "운영자 계정이 아니에요" 라고 말할 수 있다.
 */
export async function isOperator(client: SupabaseClient): Promise<boolean> {
  const { data, error } = await client.rpc('is_operator');
  if (error) throw new Error(`운영자 확인: ${error.message}`);
  return data === true;
}
