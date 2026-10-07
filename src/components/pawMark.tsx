/** 이 앱의 발바닥 표식 — 홈 히어로의 머리, 그리고 이스터에그 조각(하트 둘레·발자국·준비물 완료)이 같은 모양을 쓴다. */
export function PawMark({ className = 'h-9 w-9 text-brand-300' }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <ellipse cx="14.5" cy="15.5" rx="5" ry="6.4" fill="currentColor" />
      <ellipse cx="25.5" cy="11.5" rx="5" ry="6.8" fill="currentColor" />
      <ellipse cx="36" cy="16.5" rx="4.8" ry="6.2" fill="currentColor" />
      <path
        d="M25 24.5c6.4 0 11.4 4.4 11.4 9.4 0 4.2-3.4 6.6-7.6 6.6-2.2 0-3 -.9-5.1-.9-2.1 0-2.9.9-5.1.9-4.2 0-7.6-2.4-7.6-6.6 0-5 5.6-9.4 14-9.4Z"
        fill="currentColor"
      />
    </svg>
  );
}
