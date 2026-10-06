import { useSyncExternalStore } from 'react';

const subscribeNever = () => () => undefined;
/** 하루 단위로 충분하다 — 매 렌더 다른 값을 돌려주면 `useSyncExternalStore` 가 끝없이 다시 그린다. */
const today = () => Math.floor(Date.now() / 86_400_000) * 86_400_000;
/** 정적 HTML 을 그리는 순간에는 지금이 언제인지 모른다(빌드 시각 ≠ 보는 시각). 날짜에 기대는 말은 브라우저에서만 한다. */
const unknownNow = () => null;

/** 오늘(UTC 자정 ms). 정적 HTML·하이드레이션 첫 프레임은 `null`. */
export const useToday = (): number | null => useSyncExternalStore(subscribeNever, today, unknownNow);
