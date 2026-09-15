import type { TIconProps } from './iconProps';

/**
 * 카페 아이콘(김이 오르는 잔). @untitledui/icons 에 없어서 직접 그렸다.
 * Untitled UI 규격을 그대로 따른다 — 24×24, stroke 2, round cap/join, currentColor.
 */
export const IconCoffee = ({ size = 24, color = 'currentColor', ...props }: TIconProps) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    stroke={color}
    strokeWidth="2"
    fill="none"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    {...props}
  >
    <path d="M3 10h13v5a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5v-5Z" />
    <path d="M16 11.5h1.5a2.5 2.5 0 0 1 0 5H16" />
    <path d="M7 3v2.5M11 2.5V5" />
  </svg>
);
