import { useCallback, useState } from 'react';

/**
 * 한 번 도는 CSS 애니메이션(`styles/microMotion.css`)을 **누른 순간에** 다시 트는 번호.
 *
 * 돌려준 번호를 움직일 요소의 `key` 로 쓴다 — 번호가 바뀌면 요소가 새로 붙어 애니메이션이 처음부터 돈다(연달아 눌러도
 * 앞의 것이 끝나길 기다리지 않는다). 0 이면 아직 한 번도 안 틀었다는 뜻이라 모션 클래스를 붙이지 않는다.
 *
 * 상태 변화(false → true)를 보고 트는 대신 이것을 쓰는 이유: 저장·체크 상태는 마운트 뒤에 읽어 오므로(skipHydration)
 * 첫 프레임의 변화가 누름처럼 보인다 — 화면을 열 때마다 하트가 전부 튄다.
 */
export function useReplay() {
  const [count, setCount] = useState(0);
  const replay = useCallback(() => setCount((current) => current + 1), []);
  return [count, replay] as const;
}
