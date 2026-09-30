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

export type TAppStatus = {
  /** 같은 문구가 연달아 와도 다른 메시지로 알아보게(타이머·다시 읽어 주기). */
  id: number;
  text: string;
  link?: TAppStatusLink;
};

type TShowOpts = {
  link?: TAppStatusLink;
  /** 떠 있는 시간(ms). 링크가 있으면 누를 틈이 필요해 조금 더 길게 준다. */
  durationMs?: number;
};

/** 기본 노출 시간. 한 줄을 읽기에 충분하고, 다음 동작을 가릴 만큼 길지 않다. */
export const STATUS_DURATION_MS = 2000;

let current: TAppStatus | null = null;
let nextId = 1;
let timer: ReturnType<typeof setTimeout> | null = null;
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
  if (current === null) return;
  current = null;
  emit();
};

export const showAppStatus = (text: string, opts: TShowOpts = {}): TAppStatus => {
  if (timer) clearTimeout(timer);
  const status: TAppStatus = { id: nextId++, text, ...(opts.link ? { link: opts.link } : {}) };
  current = status;
  emit();
  timer = setTimeout(() => {
    timer = null;
    // 그 사이 다른 메시지로 바뀌었으면 그 메시지의 타이머가 치운다.
    if (current?.id === status.id) {
      current = null;
      emit();
    }
  }, opts.durationMs ?? STATUS_DURATION_MS);
  return status;
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
