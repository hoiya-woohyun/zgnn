import type { SVGProps } from 'react';

/**
 * @untitledui/icons 의 아이콘 prop 과 같은 모양.
 * 커스텀 아이콘도 같은 자리에 바꿔 끼울 수 있어야 해서 시그니처를 맞춰 둔다.
 */
export type TIconProps = SVGProps<SVGSVGElement> & {
  color?: string;
  size?: number;
};
