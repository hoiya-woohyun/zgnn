'use client';

import { useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/*
 * 헤더의 자리를 모듈 한 칸에 둔다. 헤더가 ref 로 자리를 적으면(`registerAppBarSlot`) 구독한 슬롯들이 다시 그린다.
 * 효과 안에서 DOM 을 찾아 상태에 넣는 방식은 렌더가 렌더를 부르고, 무엇보다 **헤더와 화면이 같은 커밋에 처음 붙을 때**
 * (탭 화면 → 상세) 렌더 중에는 자리가 아직 없다 — ref 는 커밋 뒤에 불리므로 그 순서를 그대로 따른다.
 */
let slot: HTMLElement | null = null;
const listeners = new Set<() => void>();

/** `AppBar` 가 제목 자리 요소에 ref 로 건다. 떠날 때 null 로 불린다. */
export function registerAppBarSlot(el: HTMLElement | null) {
  slot = el;
  listeners.forEach((listener) => listener());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/**
 * 하위 화면 헤더(`AppBar`)의 제목 자리를 화면이 채운다.
 *
 * 헤더는 셸이 붙이고(ADR-007) 경로밖에 모른다 — 기본은 화면의 h1 글을 복사해 띄운다. 그보다 많이 보여 주고 싶은 화면
 * (상세: 종류 아이콘·이름·동네·종류)만 이것으로 **자기 내용을 헤더 안에 그린다.** 헤더를 화면이 직접 다는 것이 아니라
 * 셸의 헤더에 내용만 빌려주는 것이라, 뒤로가기·상태바 덮개·스크롤을 따라 올라오는 동작은 그대로 셸 몫이다.
 *
 * 헤더는 경로가 바뀌어도 남아 있어(상세 → 근처 상세) 자리도 같은 요소다. 화면이 떠나면 포털이 걷히고, 비면 h1 복사본이 선다.
 * 정적 HTML·하이드레이션 첫 프레임에는 비어 있다 — 그때 제목은 아직 줄 밑에 숨어 있으므로(스크롤 0) 보이는 차이가 없다.
 */
export function AppBarSlot({ children }: { children: ReactNode }) {
  const target = useSyncExternalStore(
    subscribe,
    () => slot,
    () => null,
  );
  return target ? createPortal(children, target) : null;
}
