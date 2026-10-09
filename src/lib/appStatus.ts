/**
 * 화면 아래에 잠깐 떴다 사라지는 상태 한 줄("링크를 복사했어요" · "저장했어요").
 *
 * 값은 React 밖 모듈 변수에 둔다. 알림을 띄우는 쪽(공유 버튼·하트·프로필 저장)과 그리는 쪽
 * (셸의 `AppStatusToast`)이 서로 모르는 곳에 있고, 프로필 저장처럼 **띄운 직후 화면이 바뀌는**
 * 경우에도 메시지가 살아남아야 해서다 — 화면 안 state 였다면 이동과 함께 지워진다.
 *
 * 그리는 자리는 반드시 `<main>` 밖이다(ADR-014). 스와이프 중 `<main>` 에 transform 이 걸리면
 * 그 안의 `fixed` 는 화면이 아니라 `<main>` 을 기준으로 삼아 자리가 어긋난다.
 *
 * 한 번에 하나만 보인다. 새 메시지는 이전 것을 바로 갈아 끼운다 — 줄을 세워 차례로 보여 주면
 * 이미 지나간 동작의 알림이 뒤늦게 떠서 지금 한 동작과 어긋나 읽힌다.
 */

export type TAppStatusLink = { href: string; label: string };

/**
 * 누르면 **그 자리에서** 무언가를 하는 버튼(되돌리기 — 12 U2.1·U2.2·U2.6). 링크와 달리 화면을 옮기지 않는다.
 * 누르면 알림은 닫힌다 — 같은 되돌리기를 두 번 누를 수 없게.
 */
export type TAppStatusAction = { label: string; onPress: () => void };

export type TAppStatus = {
  /** 같은 문구가 연달아 와도 다른 메시지로 알아보게(타이머·다시 읽어 주기). */
  id: number;
  text: string;
  link?: TAppStatusLink;
  action?: TAppStatusAction;
};

type TShowOpts = {
  link?: TAppStatusLink;
  action?: TAppStatusAction;
  /** 떠 있는 시간(ms). 링크가 있으면 누를 틈이 필요해 조금 더 길게 준다. */
  durationMs?: number;
};

/** 기본 노출 시간. 한 줄을 읽기에 충분하고, 다음 동작을 가릴 만큼 길지 않다. */
export const STATUS_DURATION_MS = 2000;

/**
 * 링크·버튼이 있는 알림의 **최소** 노출 시간(WCAG 2.2.1 — 누르기 전에 사라지면 안 된다, 12 U3.5).
 * 호출한 쪽이 이보다 짧게 줘도 이만큼은 둔다 — 문구를 읽고 겨냥해 누를 틈이다.
 */
export const STATUS_INTERACTIVE_MIN_MS = 5000;

/**
 * '되돌리기' 알림의 노출 시간. 최소 시간보다 길게 둔다 — 지운 뒤에야 "아, 그거 아니었는데" 를 깨닫는 자리라
 * 읽고 겨냥할 틈에 망설일 틈이 더해진다. 멈춤은 hover·포커스뿐이라 터치에서는 이 시간이 전부다(6초는 짧았다, 14 W261007.19).
 */
export const STATUS_UNDO_MS = 10_000;

/** 알림이 실제로 떠 있을 시간. 누를 것이 있으면 최소 시간을 보장한다. */
export const statusDurationMs = (opts: { link?: unknown; action?: unknown; durationMs?: number }): number => {
  const requested = opts.durationMs ?? STATUS_DURATION_MS;
  return opts.link || opts.action ? Math.max(requested, STATUS_INTERACTIVE_MIN_MS) : requested;
};

let current: TAppStatus | null = null;
let nextId = 1;
let timer: ReturnType<typeof setTimeout> | null = null;
/** 지금 알림이 사라질 시각(ms, `Date.now()` 기준). 멈춘 동안은 남은 시간을 `heldRemainingMs` 에 둔다. */
let deadline = 0;
let heldRemainingMs: number | null = null;
const listeners = new Set<() => void>();

const emit = () => {
  for (const listener of listeners) listener();
};

/** 지금 떠 있는 메시지. useSyncExternalStore 의 스냅샷 — 같은 값이면 같은 객체를 돌려준다. */
export const getAppStatus = (): TAppStatus | null => current;

/** 서버(정적 HTML)에서는 늘 비어 있다. 알림은 누른 뒤에만 생긴다. */
export const getServerAppStatus = (): TAppStatus | null => null;

export const subscribeAppStatus = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const clearAppStatus = () => {
  if (timer) clearTimeout(timer);
  timer = null;
  heldRemainingMs = null;
  if (current === null) return;
  current = null;
  emit();
};

const armTimer = (id: number, ms: number) => {
  if (timer) clearTimeout(timer);
  deadline = Date.now() + ms;
  timer = setTimeout(() => {
    timer = null;
    // 그 사이 다른 메시지로 바뀌었으면 그 메시지의 타이머가 치운다.
    if (current?.id === id) {
      current = null;
      emit();
    }
  }, ms);
};

export const showAppStatus = (text: string, opts: TShowOpts = {}): TAppStatus => {
  const status: TAppStatus = { id: nextId++, text, ...(opts.link ? { link: opts.link } : {}), ...(opts.action ? { action: opts.action } : {}) };
  current = status;
  heldRemainingMs = null;
  emit();
  armTimer(status.id, statusDurationMs(opts));
  return status;
};

/**
 * 포인터가 올라가 있거나 포커스가 들어가 있는 동안 타이머를 멈춘다(12 U3.5) — 누르려고 겨누는 중에 사라지면 안 된다.
 * 남은 시간은 기억해 두었다가 `releaseAppStatus` 가 이어 간다.
 */
export const holdAppStatus = () => {
  if (current === null || timer === null) return;
  clearTimeout(timer);
  timer = null;
  heldRemainingMs = Math.max(deadline - Date.now(), 0);
};

/** 멈췄던 타이머를 잇는다. 손을 떼자마자 사라지면 놀라니 남은 시간이 짧아도 기본 노출 시간만큼은 준다. */
export const releaseAppStatus = () => {
  if (current === null || heldRemainingMs === null) return;
  const ms = Math.max(heldRemainingMs, STATUS_DURATION_MS);
  heldRemainingMs = null;
  armTimer(current.id, ms);
};
/**
 * "처음 몇 번만 알린다" 를 세는 문. 부를 때마다 하나씩 세고, `limit` 번째까지만 true.
 *
 * 저장 알림(T3.2)처럼 처음에는 "어디에 저장됐는지" 를 알려 줘야 하지만 매번 뜨면 소음이 되는
 * 경우에 쓴다. 세션 동안만 센다 — 퍼시스트하면 앱을 다시 연 사람이 저장한 곳을 잊었어도
 * 다시 알려 주지 않는다.
 */
export const createFirstTimesGate = (limit: number) => {
  let count = 0;
  return (): boolean => {
    count += 1;
    return count <= limit;
  };
};

/**
 * 알림의 링크가 가리키는 화면에 이미 와 있는가. 그러면 셸이 알림을 걷는다 — '저장한 곳 보기' 가 저장한 곳 위에 남으면
 * 지금 화면으로 가라는 말이 된다(14 W261007.19). 알림을 일괄로 걷지 않는 것은 이동 뒤에도 살아야 하는 알림이 있어서다(프로필 저장).
 * 주소는 끝 슬래시 유무가 섞여 온다(`trailingSlash`) — 둘 다 떼고 견주고, 그 아래 경로(`/saved/x`)도 도착으로 친다.
 */
export const isAtStatusLink = (pathname: string, href: string): boolean => {
  const trim = (path: string) => path.replace(/\/+$/, '') || '/';
  const here = trim(pathname);
  const target = trim(href.split(/[?#]/)[0]);
  return here === target || here.startsWith(`${target}/`);
};
