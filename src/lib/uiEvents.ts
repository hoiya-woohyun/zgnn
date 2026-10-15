/**
 * 실사용 이벤트(ADR-029) — **무엇을 어떤 이름으로 적나**. 보내는 일은 `uiEventsSend.ts`, 듣는 일은 셸(`appShellUiEvents.ts`)이 한다.
 *
 * 순수하다. DOM 은 `TElementLike`(태그·속성·`closest`)로만 받는다 — 테스트에 jsdom 이 없다(vitest.config.mts).
 *
 * ## 이름은 두 층이다
 *
 * - **거친 층**: 모든 탭을 `요소 종류`로 적는다(`button` · 링크면 `a:<도착 경로>` · 바깥 링크면 `a:<호스트>`). 화면 글자·입력값은
 *   적지 않는다 — 강아지 무게·검색어가 들어 있는 칸도 같은 요소라서, 글자를 읽기 시작하면 ADR-021 「받지 않는 것」 을 넘는다.
 * - **이름 층**: `data-ev` 를 단 요소는 그 이름으로. 요소에 직접 달면 그 이름 하나, 감싸는 구역에 달면 `구역>종류` 가 된다
 *   (`tab>a:/places` — 같은 링크라도 탭바에서 눌렀는지 본문에서 눌렀는지 갈린다).
 *
 * **눌리지 않는 곳을 누른 것(`dead`)이 이 표의 이유다.** 이름 붙인 버튼만 세면 "버튼이 아닌 곳을 눌렀다" 는 원리적으로 안 잡힌다 —
 * 그래서 거친 층이 모든 탭을 받는다. 지도 캔버스처럼 탭이 버튼 없이 의미를 갖는 곳은 `data-ev-ignore` 로 뺀다.
 */

export const UI_EVENT_NAMES = ['view', 'tap', 'dead', 'rage', 'search'] as const;
export type TUiEventName = (typeof UI_EVENT_NAMES)[number];

/**
 * 표(`ui_events`) 한 줄. **빈 칸도 `null` 로 적는다** — PostgREST 배열 insert 는 모든 객체의 키가 같아야 하고
 * 하나라도 다르면 묶음 전체가 PGRST102 로 거절된다.
 */
export type TUiEventRow = {
  /** 페이지 로드 하나의 임시 아이디(메모리에만). 30분 쉬면 새로 — 재방문을 잇지 않는 것이 결정이다(ADR-029 결정 2). */
  sid: string;
  seq: number;
  /** 그 탭에서 처음 적은 때부터 흐른 ms. 받은 시각(`received_at`)은 묶어 보낸 때라 순서·간격은 이것으로 본다. */
  t_ms: number;
  name: TUiEventName;
  route: string;
  target: string | null;
  /** `search` 의 결과 수. 나머지는 null. */
  n: number | null;
  app_build: string;
};

/** 마이그레이션의 CHECK 와 같은 숫자다 — 한쪽만 바꾸면 그 줄이 든 묶음 전체가 400 이 된다. */
export const ROUTE_MAX = 120;
export const TARGET_MAX = 80;
export const SEQ_MAX = 5000;
export const T_MS_MAX = 86_400_000;
export const N_MAX = 100_000;
/** 한 번에 보낼 수 있는 줄 수 — 표의 트리거가 이보다 많으면 문 전체를 거절한다. 보내는 쪽(`uiEventsSend.ts`)은 25줄에서 비운다. */
export const BATCH_MAX = 50;
/** 표 크기 상한(150 MB) — 넘으면 트리거가 모든 insert 를 거절한다. 무료 500 MB 를 넘겨 프로젝트가 읽기 전용이 되지 않게. */
export const SIZE_LIMIT_BYTES = 157_286_400;

/** 이만큼 아무것도 안 적히면 다음 줄은 새 세션이다 — 아침에 연 탭을 저녁에 다시 보는 것은 같은 방문이 아니다. */
export const SESSION_IDLE_MS = 30 * 60_000;

export type TUiSession = { sid: string; startedAt: number; lastAt: number; seq: number };

/**
 * 다음 줄의 세션. **저장소에 두지 않는다**(sessionStorage 는 폰에선 며칠을 살고, 세션 복원·탭 복제가 같은 아이디와 같은 `seq` 를 두 탭에 나눠 준다 —
 * 집계의 앞뒤 화면이 두 탭을 섞는다). 페이지 로드 하나 · 30분 쉼 · 하루(`t_ms` 상한) · `seq` 상한 중 먼저 닿는 것에서 끊는다.
 */
export function advanceSession(previous: TUiSession | null, now: number, newId: () => string): TUiSession {
  if (
    !previous ||
    now - previous.lastAt > SESSION_IDLE_MS ||
    now - previous.startedAt > T_MS_MAX ||
    previous.seq >= SEQ_MAX
  ) {
    return { sid: newId(), startedAt: now, lastAt: now, seq: 0 };
  }
  return { ...previous, lastAt: now, seq: previous.seq + 1 };
}

/**
 * 경로·이름표·빌드에 허락하는 글자 — 마이그레이션의 `*_chars` CHECK 와 같은 집합이다. **이 표의 글자는 Claude 가 읽는다**(`/ux-eval` 종합) —
 * 누구나 publishable 키로 쓸 수 있는 표라, 공백·따옴표가 들어가면 문장이 되고 문장은 프롬프트가 된다. 밖의 글자는 `_` 로 바꿔 보낸다
 * (안 바꾸면 그 줄이 든 묶음 전체가 400 이다 — 퍼센트 인코딩된 한글 경로 같은 것).
 */
export const SAFE_TOKEN_CLASS = 'A-Za-z0-9_./:>-';
const UNSAFE = new RegExp(`[^${SAFE_TOKEN_CLASS}]`, 'g');
export const safeToken = (value: string): string => value.replace(UNSAFE, '_') || '_';

/** `send` 운영 표로 보낸다 · `log` 콘솔에만(확인용) · `null` 안 모은다. */
export type TCollectMode = 'send' | 'log' | null;

/** 기기 쪽 스위치 한 칸 — `off`(운영자 기기, `/admin` 을 열면 저절로) · `debug`(어느 주소에서든 콘솔로만). */
export const UI_EVENTS_FLAG_KEY = 'zgnn-ui-events';

export const isAdminRoute = (pathname: string): boolean => pathname === '/admin' || pathname.startsWith('/admin/');

/**
 * 모을까. **운영 주소에서만 보낸다** — `APP_BUILD` 로는 못 가른다: Vercel 밖에서도 `git rev-parse` 가 진짜 커밋을 넣어서
 * 로컬 `next dev`·분리 빌드(7728)·LAN 이 전부 운영 빌드처럼 보인다(next.config.mjs). 호스트 하나로 프리뷰 배포·LAN·`/ux-eval` 이 같이 빠진다.
 */
export function collectModeOf({
  hostname,
  siteHostname,
  pathname,
  flag,
  webdriver,
}: {
  hostname: string;
  siteHostname: string;
  pathname: string;
  flag: string | null;
  webdriver: boolean;
}): TCollectMode {
  if (isAdminRoute(pathname)) return null;
  if (flag === 'debug') return 'log';
  if (flag === 'off' || webdriver) return null;
  return hostname === siteHostname ? 'send' : null;
}

/** 경로 한 칸 — 끝 슬래시를 뗀다(`trailingSlash: true` 라 같은 화면이 두 이름으로 갈린다). 쿼리는 애초에 안 받는다. */
export const routeOf = (pathname: string): string => {
  const trimmed = pathname.replace(/\/+$/, '');
  return safeToken(trimmed || '/').slice(0, ROUTE_MAX);
};

/** 장소마다 갈리는 칸을 접는다 — 탭 이름이 장소 수만큼 흩어지면 "무엇을 눌렀나" 를 셀 수 없다. 화면 경로(`route`)는 접지 않는다. */
export const routeTemplateOf = (route: string): string => route.replace(/^\/place\/[^/]+/, '/place/:id');

/** 링크가 가는 곳 — 앱 안이면 경로 틀, 바깥이면 호스트만. 전화·메일은 번호·주소를 적지 않는다. */
export function linkTargetOf(href: string, origin: string): string {
  let url: URL;
  try {
    url = new URL(href, origin);
  } catch {
    return 'bad-href';
  }
  if (url.protocol === 'tel:') return 'tel';
  if (url.protocol === 'mailto:') return 'mail';
  if (url.origin !== origin) return safeToken(url.hostname);
  return routeTemplateOf(routeOf(url.pathname));
}

/** `Element` 가 그대로 들어맞는 최소 모양. */
export type TElementLike = {
  readonly tagName: string;
  getAttribute(name: string): string | null;
  closest(selector: string): TElementLike | null;
};

/** 눌러서 무언가가 일어나는 요소. 클릭 핸들러만 단 `div` 는 못 알아본다 — 그런 자리는 role 을 달거나 `data-ev` 로 이름을 준다. */
export const INTERACTIVE_SELECTOR = [
  'a[href]',
  'button',
  'input',
  'select',
  'textarea',
  'label',
  'summary',
  '[role="button"]',
  '[role="link"]',
  '[role="tab"]',
  '[role="switch"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="option"]',
  '[role="menuitem"]',
  '[role="slider"]',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/** 바탕을 누른 것 — 빈자리를 눌러 키보드를 내리는 손짓이라 dead 로 세지 않는다. */
const BACKGROUND_TAGS = new Set(['html', 'body', 'main']);

const clip = (value: string) => safeToken(value).slice(0, TARGET_MAX);

function kindOf(el: TElementLike, origin: string): string {
  const tag = el.tagName.toLowerCase();
  if (tag === 'a') return `a:${linkTargetOf(el.getAttribute('href') ?? '', origin)}`;
  if (tag === 'input') return `input:${el.getAttribute('type') ?? 'text'}`;
  return el.getAttribute('role') ?? tag;
}

/** `node` 는 연타를 가르는 데만 쓴다 — 같은 이름(`label`·`card>button`)의 **다른** 요소를 빠르게 누른 것은 연타가 아니다. */
export type TTap = { name: 'tap' | 'dead'; target: string; node: TElementLike };

/** 탭 하나를 이름으로. `null` 은 적지 않는다(무시 구역 · 바탕). */
export function tapOf(el: TElementLike | null, origin: string): TTap | null {
  if (!el || el.closest('[data-ev-ignore]')) return null;
  const interactive = el.closest(INTERACTIVE_SELECTOR);
  if (!interactive && BACKGROUND_TAGS.has(el.tagName.toLowerCase())) return null;

  const node = interactive ?? el;
  const own = interactive?.getAttribute('data-ev');
  if (own) return { name: 'tap', target: clip(own), node };

  const base = interactive ? kindOf(interactive, origin) : el.tagName.toLowerCase();
  const zone = node.closest('[data-ev]')?.getAttribute('data-ev');
  return { name: interactive ? 'tap' : 'dead', target: clip(zone ? `${zone}>${base}` : base), node };
}

/** 3번째 탭이 이 간격 안에 같은 곳에 오면 rage 다. */
export const RAGE_GAP_MS = 700;
export const RAGE_TAPS = 3;
/**
 * 이보다 가까운 두 번째 클릭은 사람이 아니라 브라우저가 낸 메아리다 — `label` 을 누르면 안의 `input` 에 클릭이 한 번 더 간다.
 * 그대로 세면 체크 한 번이 탭 둘이 되고, 세 번째 탭에서 rage 가 선다.
 */
export const ECHO_MS = 40;

export type TTapMemory = { at: number; node: unknown; burst: number } | null;

/** 연타는 **같은 요소**를 몰아 누른 것이다 — 이름만 같으면 체크리스트 세 줄을 빠르게 체크한 것도 rage 가 된다. */
export function rememberTap(
  previous: TTapMemory,
  node: unknown,
  at: number,
): { memory: TTapMemory; echo: boolean; rage: boolean } {
  if (previous && at - previous.at < ECHO_MS) return { memory: previous, echo: true, rage: false };
  const burst = previous && previous.node === node && at - previous.at <= RAGE_GAP_MS ? previous.burst + 1 : 1;
  // 한 번 몰아친 것은 rage 한 줄 — 네 번째·다섯 번째 탭이 줄을 더 세우지 않는다.
  return { memory: { at, node, burst }, echo: false, rage: burst === RAGE_TAPS };
}

/**
 * 끌다 놓은 클릭인가 — 화면 페이저는 끌기 뒤의 클릭을 React capture 에서 멈추지만(`appShellSwipe` 등의 `onClickCapture`), 문서 capture 는 그보다 먼저 본다.
 * 그래서 누른 자리와 뗀 자리가 이만큼 벌어진 클릭은 탭으로 세지 않는다(터치는 브라우저가 이미 안 보내고, 마우스 끌기가 남는다).
 */
export const DRAG_SLOP_PX = 10;
export const isDragClick = (down: { x: number; y: number } | null, up: { x: number; y: number }): boolean =>
  down !== null && Math.hypot(up.x - down.x, up.y - down.y) > DRAG_SLOP_PX;

/**
 * 화면을 덮는 바탕인가 — 하단 시트·모달의 어두운 바탕, 고르기 칸의 밑장을 누르면 닫힌다. 닫히는 동안 그 바탕이 아직 DOM 에 있어
 * 눌리지 않는 `div` 로 잡히는데, 그건 "버튼인 줄 알고 눌렀다" 가 아니라 닫는 손짓이다. 눌리지 않는 요소일 때만 묻는다.
 */
export const coversViewport = (rect: { width: number; height: number }, viewport: { width: number; height: number }): boolean =>
  rect.width >= viewport.width * 0.9 && rect.height >= viewport.height * 0.6;

/**
 * 보내기가 이 상태로 실패하면 이 페이지 로드 동안은 더 보내지 않는다 — 표가 아직 없다(404 · db push 전) · 정책을 껐다(401/403) ·
 * 모양이 어긋났다(400). 같은 실패를 화면마다 되풀이할 이유가 없다. 망 실패(상태 없음)는 다음 묶음에서 다시 해 본다.
 */
export const stopsSendingOn = (status: number): boolean => status >= 400 && status < 500;

export function uiEventRow({
  sid,
  seq,
  startedAt,
  at,
  name,
  route,
  target = null,
  n = null,
  build,
}: {
  sid: string;
  seq: number;
  startedAt: number;
  at: number;
  name: TUiEventName;
  route: string;
  target?: string | null;
  n?: number | null;
  build: string;
}): TUiEventRow | null {
  if (seq > SEQ_MAX) return null;
  return {
    sid,
    seq,
    t_ms: Math.min(Math.max(Math.round(at - startedAt), 0), T_MS_MAX),
    name,
    route: routeOf(route),
    target: target === null ? null : clip(target),
    n: n === null ? null : Math.min(Math.max(0, Math.round(n)), N_MAX),
    app_build: build.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 40) || 'dev',
  };
}
