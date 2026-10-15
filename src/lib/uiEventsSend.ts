/**
 * 실사용 이벤트를 **모아서 보내는** 모듈(ADR-029). 무엇을 적는지는 `uiEvents.ts`, 언제 적는지는 셸(`appShellUiEvents.ts`)이다.
 *
 * 제보(`placeReportSend.ts`)와 같은 길이다 — supabase-js 없이 `fetch` 한 번, `apikey` 헤더 하나, `Prefer: return=minimal`.
 * 비로그인 역할에는 select 가 없어서 RETURNING 을 달라고 하면 쓰기 자체가 42501 이다.
 *
 * **탭마다 보내지 않는다.** 메모리에 모았다가 25개가 차거나, 처음 쌓인 지 15초가 지나거나, 화면을 내릴 때(`visibilitychange`·`pagehide`)
 * 배열 하나로 보낸다. 내릴 때 보내기는 `keepalive` 에 기대는데, 이 요청은 `apikey` 헤더 때문에 CORS 사전 요청이 붙고 그 조합은
 * 브라우저마다 믿을 만하지 않다(`sendBeacon` 은 헤더를 못 싣는다). 그래서 대부분은 화면이 보이는 동안 이미 나가고, 내릴 때는 꼬리만 남게 둔다.
 *
 * **실패는 아무에게도 말하지 않는다.** 사용자가 할 수 있는 일이 없다 — 4xx 면 이 페이지 로드 동안 멈추고(`stopsSendingOn`),
 * 망 실패면 그 묶음만 버린다. 다시 보내는 큐는 두지 않는다(오프라인에서 생긴 줄은 버린다).
 */

import { PROJECT_URL, PUBLISHABLE_KEY } from '../../scripts/lib/supabasePublic.mjs';
import { SITE_URL } from './siteIndex';
import {
  collectModeOf,
  stopsSendingOn,
  uiEventRow,
  UI_EVENTS_FLAG_KEY,
  type TCollectMode,
  type TUiEventName,
  type TUiEventRow,
} from './uiEvents';

const APP_BUILD = process.env.NEXT_PUBLIC_APP_BUILD ?? 'dev';
const SITE_HOSTNAME = new URL(SITE_URL).hostname;
const SESSION_KEY = 'zgnn-ui-session';

const FLUSH_AT = 25;
const FLUSH_AFTER_MS = 15_000;

let queue: TUiEventRow[] = [];
/** 쌓인 줄을 모은 방식 — 보낼 때 다시 재지 않는다. `debug` 기기가 `/admin` 으로 넘어가며 비우면 콘솔 몫이 운영 표로 갈 수 있다. */
let queueMode: TCollectMode = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let stopped = false;

const readFlag = (): string | null => {
  try {
    return localStorage.getItem(UI_EVENTS_FLAG_KEY);
  } catch {
    return null;
  }
};

const modeFor = (pathname: string): TCollectMode =>
  collectModeOf({
    hostname: window.location.hostname,
    siteHostname: SITE_HOSTNAME,
    pathname,
    flag: readFlag(),
    webdriver: navigator.webdriver === true,
  });

type TSession = { sid: string; startedAt: number; seq: number };

/** `crypto.randomUUID` 는 보안 출처(https·localhost)에서만 있다 — LAN 의 http 로 `debug` 를 켜면 없다. 표의 칸이 uuid 라 모양은 맞춘다. */
const randomId = (): string => {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

/** 탭 하나의 임시 아이디. sessionStorage 라 새로고침에는 이어지고 탭을 닫으면 사라진다. 못 쓰는 환경이면 이 페이지 로드 동안만. */
let memorySession: TSession | null = null;
function nextSeq(now: number): TSession {
  let session = memorySession;
  if (!session) {
    try {
      const saved = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null') as TSession | null;
      if (saved && typeof saved.sid === 'string') session = saved;
    } catch {
      session = null;
    }
  }
  session = session ? { ...session, seq: session.seq + 1 } : { sid: randomId(), startedAt: now, seq: 0 };
  memorySession = session;
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // 시크릿 창 등 — 메모리 값으로 이어 간다.
  }
  return session;
}

/** 운영자 기기 표시 — `/admin` 을 연 기기는 그 뒤로 안 모은다. `debug` 로 둔 기기는 그대로 둔다. */
export function markOperatorDevice(): void {
  try {
    if (localStorage.getItem(UI_EVENTS_FLAG_KEY) !== 'debug') localStorage.setItem(UI_EVENTS_FLAG_KEY, 'off');
  } catch {
    // 못 쓰면 운영자 화면 자체는 어차피 안 모은다(`collectModeOf`).
  }
}

export function recordUiEvent(
  name: TUiEventName,
  { pathname = window.location.pathname, target = null, n = null }: { pathname?: string; target?: string | null; n?: number | null } = {},
): void {
  const mode = modeFor(pathname);
  if (stopped || !mode) return;
  const now = Date.now();
  const { sid, startedAt, seq } = nextSeq(now);
  const row = uiEventRow({ sid, seq, startedAt, at: now, name, route: pathname, target, n, build: APP_BUILD });
  if (!row) return;
  queueMode = mode;
  queue.push(row);
  if (queue.length >= FLUSH_AT) flushUiEvents();
  else timer ??= setTimeout(flushUiEvents, FLUSH_AFTER_MS);
}

export function flushUiEvents(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  if (queue.length === 0) return;
  const batch = queue;
  queue = [];

  if (queueMode === 'log') {
    console.debug('[ui-events]', batch);
    return;
  }
  void fetch(`${PROJECT_URL}/rest/v1/ui_events`, {
    method: 'POST',
    keepalive: true,
    headers: {
      apikey: PUBLISHABLE_KEY,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(batch),
  })
    .then((response) => {
      if (stopsSendingOn(response.status)) stopped = true;
    })
    .catch(() => {
      // 망 실패 — 이 묶음만 버린다.
    });
}
