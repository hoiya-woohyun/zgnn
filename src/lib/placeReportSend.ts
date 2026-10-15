/**
 * 사용자 제보를 **보내는** 얇은 모듈 — 사이트가 런타임에 Supabase 에 쓰는 두 자리 중 하나(ADR-021 R1 · 다른 하나는 실사용 이벤트 `uiEventsSend.ts`, ADR-029).
 *
 * supabase-js 를 쓰지 않는다. 필요한 것은 POST 한 번이고, 라이브러리를 끌어오면 GoTrue 클라이언트가 같이 와서
 * 사용자 화면에 인증 저장소(localStorage)가 생긴다. `/admin` 의 클라이언트(`adminSupabase.ts`)도 재사용하지 않는다 —
 * 세션·storageKey 를 들고 있어 사용자 화면에 끌려오면 안 된다.
 *
 * **응답 본문을 달라고 하지 않는다**(`Prefer: return=minimal`). 비로그인 역할에는 select 가 없어서, RETURNING 을 달라고 하면
 * 쓰기 자체가 42501 로 거부된다(supabase-js 의 `.insert().select()` 가 그 모양이다). 그래서 성공은 201 하나로만 안다.
 *
 * 헤더는 `apikey` 하나다 — publishable 키(`sb_publishable_…`)는 JWT 가 아니라 `Authorization: Bearer` 에 넣으면 안 된다.
 */

import { PROJECT_URL, PUBLISHABLE_KEY } from '../../scripts/lib/supabasePublic.mjs';
import { clearAppStatus, showAppStatus, STATUS_UNDO_MS } from './appStatus';
import {
  parseReportRecord,
  recordReport,
  unrecordReport,
  type TReportInsert,
  type TReportKind,
  type TReportRecord,
  type TReportSendFailure,
} from './placeReport';

export const APP_BUILD = process.env.NEXT_PUBLIC_APP_BUILD ?? 'dev';

export type TReportSendResult = { ok: true } | { ok: false; reason: TReportSendFailure };

/** HTTP 상태·PostgREST 코드 → 실패 갈래 — 순수(테스트한다). */
export function classifySendFailure(status: number, code?: string): TReportSendFailure {
  // 표가 원격에 없다(마이그레이션 미적용) · 권한이 없다(정책을 껐다) — 사용자가 고칠 수 없는 쪽.
  if (status === 404 || code === 'PGRST205' || code === '42P01') return 'unavailable';
  if (status === 401 || status === 403 || code === '42501') return 'unavailable';
  // CHECK·정책 with check 위반 — 내린 장소, 너무 긴 글.
  if (status === 400 || status === 409 || code === '23514' || code === '23503') return 'rejected';
  return 'network';
}

/**
 * `keepalive` — 탭을 닫거나 다른 앱으로 넘어가는 순간에 보낼 때(`sendPlaceReportUndoable`). 페이지가 내려가도 요청이 끝까지 간다.
 */
export async function sendPlaceReport(row: TReportInsert, { keepalive = false }: { keepalive?: boolean } = {}): Promise<TReportSendResult> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { ok: false, reason: 'offline' };
  let response: Response;
  try {
    response = await fetch(`${PROJECT_URL}/rest/v1/place_reports`, {
      method: 'POST',
      headers: {
        apikey: PUBLISHABLE_KEY,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(row),
      ...(keepalive ? { keepalive: true } : {}),
    });
  } catch {
    return { ok: false, reason: typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'network' };
  }
  if (response.ok) return { ok: true };
  let code: string | undefined;
  try {
    code = ((await response.json()) as { code?: string }).code;
  } catch {
    code = undefined;
  }
  return { ok: false, reason: classifySendFailure(response.status, code) };
}

/** 하루 한도 기록(R2 의 부드러운 한도). 앱 스토어(`zgnn-jeju`)와 키를 가른다 — 그쪽이 깨져 지워질 때 같이 지워지지 않게. */
const RECORD_KEY = 'zgnn-reports';

export function readReportRecord(): TReportRecord {
  try {
    return parseReportRecord(localStorage.getItem(RECORD_KEY));
  } catch {
    return {};
  }
}

export function rememberReport(placeId: string | null, kind: TReportKind, now: number = Date.now()): void {
  try {
    localStorage.setItem(RECORD_KEY, JSON.stringify(recordReport(readReportRecord(), placeId, kind, now)));
  } catch {
    // 저장소를 못 쓰는 환경(사파리 시크릿 등) — 한도가 풀리는 쪽이라 그대로 둔다.
  }
}

/** 남긴 기록 하나를 걷는다 — 되돌렸거나 미뤄 보내다 실패했을 때(`unrecordReport`). */
export function forgetReport(placeId: string | null, kind: TReportKind): void {
  try {
    localStorage.setItem(RECORD_KEY, JSON.stringify(unrecordReport(readReportRecord(), placeId, kind)));
  } catch {
    // 저장소를 못 쓰는 환경 — 남긴 것도 없다.
  }
}

type TUndoableSend = {
  /** 되돌리기 알림의 문구 — 보낸 것처럼 말한다(되돌리지 않으면 곧 보낸다). */
  text: string;
  onUndo: () => void;
  /** 보낸 뒤(성공·실패). 그때는 화면이 이미 바뀌었을 수 있다. */
  onDone: (result: TReportSendResult) => void;
  /** 테스트가 바꿔 끼운다. */
  send?: typeof sendPlaceReport;
};

/**
 * 되돌리기 알림이 걷힐 때 보낸다(14 W261010.7g). 보낸 제보는 다시 읽지도 지우지도 못해(insert 만) 되돌리기는 **아직 안 보냈을 때만** 된다 —
 * 그래서 보내는 순간을 알림이 걷히는 순간으로 미룬다. 시간이 다 됐거나, 다른 알림이 덮었거나, 화면을 옮겨 셸이 걷었으면 보내고
 * (`onDismiss`), 되돌리기를 눌렀으면 안 보낸다. 알림은 hover·포커스 동안 멈추니 되돌리기 가 보이는 동안은 늘 되돌릴 수 있다.
 *
 * 탭을 닫거나 다른 앱으로 넘어가면(`pagehide` · `visibilitychange` hidden — iOS 는 앱 전환기에서 닫을 때 pagehide 를 믿을 수 없다)
 * 그 자리에서 `keepalive` 로 보내고 알림을 걷는다 — 돌아왔을 때 이미 보낸 것의 되돌리기 가 남지 않게. 어느 길로든 한 번만 보낸다.
 */
export function sendPlaceReportUndoable(row: TReportInsert, { text, onUndo, onDone, send = sendPlaceReport }: TUndoableSend): void {
  let settled = false;
  const listening = typeof window !== 'undefined' && typeof document !== 'undefined';

  const stopListening = () => {
    if (!listening) return;
    window.removeEventListener('pagehide', leave);
    document.removeEventListener('visibilitychange', leaveIfHidden);
  };
  const flush = (keepalive: boolean) => {
    if (settled) return;
    settled = true;
    stopListening();
    void send(row, { keepalive }).then(onDone);
  };
  function leave() {
    flush(true);
    clearAppStatus();
  }
  function leaveIfHidden() {
    if (document.visibilityState === 'hidden') leave();
  }

  showAppStatus(text, {
    action: {
      label: '되돌리기',
      onPress: () => {
        settled = true;
        stopListening();
        onUndo();
      },
    },
    durationMs: STATUS_UNDO_MS,
    onDismiss: () => flush(false),
  });
  if (listening) {
    window.addEventListener('pagehide', leave);
    document.addEventListener('visibilitychange', leaveIfHidden);
  }
}
