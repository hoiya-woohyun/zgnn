import type { TPawKind } from '../../lib/pawTrail';
import { PawMark } from '../pawMark';

/**
 * 지나간 강아지의 발자국 모양 넷(`TPawKind`) — 발끝이 위(viewBox 0 0 48 48 의 위쪽)를 본다. 기울기는 바깥 칸이 `heading` 으로 준다.
 * 보통 발은 앱의 발바닥 표식(`PawMark`) 그대로고, 나머지는 실루엣으로 구별되게 그렸다 — 크기만 다르면 30% 투명도에서 같은 개로 보인다.
 */
export function AppShellPawPrintShape({ kind, className }: { kind: TPawKind; className?: string }) {
  if (kind === 'classic') return <PawMark className={className} />;
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      {kind === 'puppy' && (
        // 꼬마 — 동글동글한 발가락 넷과 둥근 발바닥.
        <>
          <circle cx="11" cy="20.5" r="4.4" fill="currentColor" />
          <circle cx="18.8" cy="13" r="4.6" fill="currentColor" />
          <circle cx="29.2" cy="13" r="4.6" fill="currentColor" />
          <circle cx="37" cy="20.5" r="4.4" fill="currentColor" />
          <ellipse cx="24" cy="32.5" rx="10.5" ry="9" fill="currentColor" />
        </>
      )}
      {kind === 'big' && (
        // 큰 개 — 넓게 벌어진 발가락 넷, 그 앞의 발톱 자국, 넓은 발바닥.
        <>
          <ellipse cx="10.5" cy="21" rx="4.4" ry="5.6" transform="rotate(-25 10.5 21)" fill="currentColor" />
          <ellipse cx="19.5" cy="13.5" rx="4.6" ry="6" fill="currentColor" />
          <ellipse cx="28.5" cy="13.5" rx="4.6" ry="6" fill="currentColor" />
          <ellipse cx="37.5" cy="21" rx="4.4" ry="5.6" transform="rotate(25 37.5 21)" fill="currentColor" />
          <ellipse cx="7" cy="13" rx="1.3" ry="2.3" transform="rotate(-25 7 13)" fill="currentColor" />
          <ellipse cx="18.5" cy="4.5" rx="1.3" ry="2.2" fill="currentColor" />
          <ellipse cx="29.5" cy="4.5" rx="1.3" ry="2.2" fill="currentColor" />
          <ellipse cx="41" cy="13" rx="1.3" ry="2.3" transform="rotate(25 41 13)" fill="currentColor" />
          <path
            d="M24 26c7.4 0 12.8 4.8 12.8 10.2 0 4.4-3.6 7.2-8 7.2-2.4 0-3.3-1-4.8-1s-2.4 1-4.8 1c-4.4 0-8-2.8-8-7.2C11.2 30.8 16.6 26 24 26Z"
            fill="currentColor"
          />
        </>
      )}
      {kind === 'slim' && (
        // 길쭉이 — 좁게 모인 긴 발가락(가운데 둘이 앞으로 나온 토끼발)과 위아래로 긴 발바닥.
        <>
          <ellipse cx="15" cy="17" rx="2.8" ry="5.4" transform="rotate(-12 15 17)" fill="currentColor" />
          <ellipse cx="21" cy="9.5" rx="2.8" ry="6" fill="currentColor" />
          <ellipse cx="27" cy="9.5" rx="2.8" ry="6" fill="currentColor" />
          <ellipse cx="33" cy="17" rx="2.8" ry="5.4" transform="rotate(12 33 17)" fill="currentColor" />
          <path d="M24 24c4.8 0 8.2 4.6 8.2 10.4 0 5-3.2 8.6-8.2 8.6s-8.2-3.6-8.2-8.6C15.8 28.6 19.2 24 24 24Z" fill="currentColor" />
        </>
      )}
    </svg>
  );
}
