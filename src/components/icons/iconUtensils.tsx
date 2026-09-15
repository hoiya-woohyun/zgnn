import type { TIconProps } from './iconProps';

/**
 * 식당 아이콘(포크와 나이프). @untitledui/icons 에 없어서 직접 그렸다.
 * Untitled UI 규격을 그대로 따른다 — 24×24, stroke 2, round cap/join, currentColor.
 */
export const IconUtensils = ({ size = 24, color = 'currentColor', ...props }: TIconProps) => (
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
    <path d="M7 3v7a2.5 2.5 0 0 1-2.5 2.5h0A2.5 2.5 0 0 1 2 10V3" />
    <path d="M4.5 12.5V21" />
    <path d="M17 3c2 1.2 3 3.3 3 5.5S19 13 17 13.5V21" />
  </svg>
);
