/**
 * **서버 워커 깨우기**(ADR-028 결정 3·4, todo/20 T7) — `/admin` 이 요청 줄(또는 `requested_at`)을 DB 에 남긴 **뒤에**, 같은 출처의
 * `POST ${NEXT_PUBLIC_WORKER_URL}`(프로덕션 빌드만 `/api/worker/run`, `next.config.mjs`)로 서버 워커(Vercel)를 한 번 두드린다.
 *
 * 깨우기는 덤이다 — 실패해도 요청은 그대로 남아 로컬 워커(`pnpm data`)가 집는다. 그래서 **절대 던지지 않고**, 토큰·응답 본문은 어디에도 찍지 않는다.
 *
 * 클라이언트(`createAdminClient`)에는 auth 세션이 없다(refresh token 은 로그인 때 버린다 — ADR-016, `adminSupabase.ts`). 그래서 새로 고쳐 보낼 수 없고,
 * 세션 객체(`TAdminSession`)의 토큰·`exp` 를 받아 남은 시간이 모자라면 **보내지 않고** `expiring` 으로 알린다(ADR-028 결정 4 — JWT 가 12시간이라 로그인 뒤 약 11시간은 깨운다).
 */

import type { TAdminSession } from './adminSession';

/** 깨우기 주소. 빈 문자열이면 깨우지 않는다(로컬 dev·분리 빌드). */
export const WORKER_WAKE_URL = process.env.NEXT_PUBLIC_WORKER_URL ?? '';

/** `scripts/lib/workerQueue.mjs` 의 같은 이름 상수와 같은 값 — 서버 워커의 `workers.host`. 앱은 scripts 를 import 하지 않아 값을 한 번 더 적는다. */
export const REMOTE_WORKER_HOST = 'vercel';

/**
 * 보내도 되는 최소 남은 시간 = 서버의 앞당김 30분(`SESSION_EXP_SKEW_S`) + 사슬 여유 20분.
 * 30분만 보면 31분 남은 토큰은 서버에서 1분짜리가 되어 첫 홉에서 끊긴다 — 한 홉(≤300초)마다 실효가 5분 넘게 남아야 자기 자신을 다시 부르기 때문이다.
 */
export const WAKE_MIN_REMAINING_S = (30 + 20) * 60;

/** 순수 — 남은 시간이 여유보다 적거나 `exp` 를 모르면 true(이 토큰으로는 서버 워커가 한 바퀴를 못 돈다). */
export function tooShortToWake(expiresAtSec: number | undefined, nowSec: number): boolean {
  if (expiresAtSec === undefined || !Number.isFinite(expiresAtSec)) return true;
  return expiresAtSec - nowSec < WAKE_MIN_REMAINING_S;
}

/** started·busy 는 서버가 일한다, local 은 로컬 워커가 살아 서버가 비켰다, off 는 깨울 주소 없음, expiring 은 토큰이 짧아 안 보냈다. */
export type TWakeResult = 'started' | 'busy' | 'local' | 'off' | 'expiring' | 'failed';

type TWakeOptions = { url?: string; fetchImpl?: typeof fetch; nowSec?: number };

const BODY_STATE: Record<string, TWakeResult> = { started: 'started', busy: 'busy', local: 'local' };

/** 어떤 경우에도 던지지 않는다 — 네트워크 오류·깨진 본문·낯선 상태는 전부 `failed`. */
export async function wakeRemoteWorker(session: Pick<TAdminSession, 'accessToken' | 'expiresAt'> | null, opts: TWakeOptions = {}): Promise<TWakeResult> {
  const url = opts.url ?? WORKER_WAKE_URL;
  if (url === '') return 'off';
  try {
    if (!session?.accessToken) return 'failed';
    const nowSec = opts.nowSec ?? Math.floor(Date.now() / 1000);
    if (tooShortToWake(session.expiresAt, nowSec)) return 'expiring';
    const response = await (opts.fetchImpl ?? fetch)(url, { method: 'POST', headers: { Authorization: `Bearer ${session.accessToken}` } });
    if (response.status !== 200 && response.status !== 202) return 'failed';
    const body: unknown = await response.json();
    const state = typeof body === 'object' && body !== null ? (body as { state?: unknown }).state : undefined;
    const result = typeof state === 'string' ? BODY_STATE[state] : undefined;
    if (!result) return 'failed';
    // 200 은 local, 202 는 started·busy 만 — 상태와 본문이 어긋나면 계약 밖이다.
    return (response.status === 200) === (result === 'local') ? result : 'failed';
  } catch {
    return 'failed';
  }
}

/** 순수 — 화면 한 줄. 서버가 일하든 로컬이 받든 조용히, 깨우기를 못 했을 때만 말한다(요청은 남았다). */
export function wakeNotice(result: TWakeResult): string | null {
  if (result === 'failed') return '서버 워커를 못 깨웠어요 — 로컬 워커(pnpm data)가 켜지면 이어 받아요';
  if (result === 'expiring') return '로그인이 곧 끝나 서버 워커는 못 깨웠어요 — 다시 로그인하면 다음 요청부터 서버가 돌려요. 이번 요청은 로컬 워커(pnpm data)가 이어 받아요';
  return null;
}
