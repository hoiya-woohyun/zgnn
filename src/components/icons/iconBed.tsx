import type { TIconProps } from './iconProps';

/**
 * 숙소 아이콘. @untitledui/icons 에 침대 아이콘이 없어서 직접 그렸다.
 * Untitled UI 규격을 그대로 따른다 — 24×24, stroke 2, round cap/join, currentColor.
 */
export const IconBed = ({ size = 24, color = 'currentColor', ...props }: TIconProps) => (
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
    <path d="M2 17V5M2 11h20v6M22 17v-3" />
    <path d="M6.5 11V8.5h5a2 2 0 0 1 2 2V11" />
    <path d="M2 17h20" />
  </svg>
);
