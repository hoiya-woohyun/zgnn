import { useSyncExternalStore } from 'react';
import type { TTripDay } from './tripPlan';

/**
 * 저장 화면의 **이번 방문 목록** — 들어올 때 찍은 저장 id 를 나갈 때까지 붙든다.
 *
 * 저장 화면에서 하트를 끄면 카드가 그 자리에서 **바로 사라지지 않는다.** 하트만 비고, 목록에서 빠지는 것은
 * 다음에 들어왔을 때다. 눌렀다가 바로 다시 누르는 일이 잦고(비교하다 마음이 바뀐다), 카드가 사라지면
 * "어디 있었지" 가 되어 예전엔 되돌리기 토스트로 메웠다 — 카드가 남아 있으면 하트 자체가 되돌리기다.
 *
 * 그래서 끈 카드의 **자리·메모·날짜 라벨**을 기억해 뒀다가, 같은 방문 안에서 다시 켜면 `restoreSaved` 로 그대로 돌린다
 * (`toggleSaved` 로 켜면 맨 뒤에 붙고 메모는 없다). 기억은 화면을 나가면 버린다 — 다른 화면에서 켠 하트가
 * 옛 자리·옛 메모를 물려받으면 안 된다.
 *
 * 모듈 변수인 이유: 쓰는 쪽이 둘이다(화면이 목록을, 저장 버튼이 기억을). 화면이 수명을 쥔다(`enter`/`leave`).
 */

type TUnsavedMemory = { index: number; note?: string; day?: TTripDay };

let snapshot: readonly string[] | null = null;
const unsaved = new Map<string, TUnsavedMemory>();
const listeners = new Set<() => void>();

const notify = () => {
  for (const listener of listeners) listener();
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** 저장 화면에 들어왔다 — 하이드레이션이 끝난 뒤의 저장 목록으로 부른다. */
export function enterSavedPage(savedIds: readonly string[]): void {
  snapshot = [...savedIds];
  unsaved.clear();
  notify();
}

/** 저장 화면을 나갔다 — 목록도 기억도 버린다. */
export function leaveSavedPage(): void {
  snapshot = null;
  unsaved.clear();
  notify();
}

/** 저장 화면에서 하트를 껐다 — 다시 켜면 돌려줄 자리와 메모. 화면 밖에서는 아무것도 안 한다. */
export function rememberUnsavedOnSavedPage(id: string, memory: TUnsavedMemory): void {
  if (snapshot === null) return;
  unsaved.set(id, memory);
}

/** 저장 화면에서 하트를 다시 켰다 — 기억이 있으면 꺼내 주고 지운다(한 번만 쓴다). */
export function takeUnsavedOnSavedPage(id: string): TUnsavedMemory | undefined {
  const memory = unsaved.get(id);
  unsaved.delete(id);
  return memory;
}

/** 들어올 때 찍은 목록. 아직 안 들어왔으면(하이드레이션 전) null. */
export const useSavedPageSnapshot = (): readonly string[] | null =>
  useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => null,
  );

/**
 * 화면에 그릴 id — 들어올 때 목록을 순서대로, 그 뒤에 그 사이 새로 저장된 것(순수 함수).
 * 들어올 때 있던 id 는 하트를 꺼도 남는다. 그게 이 모듈의 전부다.
 */
export const listSavedPage = (snapshot: readonly string[], savedIds: readonly string[]): string[] => [
  ...snapshot,
  ...savedIds.filter((id) => !snapshot.includes(id)),
];
