'use client';

import type { ReactNode } from 'react';
import { Button } from '../components/base/button';
import { cx } from '../utils/cx';

/**
 * 관리 화면의 고르는 칩 하나(09 T6.9) — 걸러 보기·사유·삼항·블랙리스트 기간이 모두 이것이다.
 *
 * **고른 칩을 핑크로 채우지 않는다.** 핑크 채움은 주 버튼(등록하기 등)의 꼴이라, 고른 칩이 그 옆에 서면
 * 가장 드문 동작과 가장 흔한 선택이 같은 모양이 된다 — 반려 폼에서는 고른 사유 칩(핑크)이 빨간 `반려하기` 바로
 * 위에 섰다. 그래서 바탕은 늘 `secondary` 이고, 고른 것은 테두리(`ring-brand` 두 겹)와 `aria-pressed` 로만 말한다.
 * `Button` 의 가장자리는 border 가 아니라 inset ring 이라 `border-brand` 로는 안 보인다.
 */
export function AdminFilterChip({
  pressed,
  size = 'sm',
  isDisabled,
  isLoading,
  className,
  onClick,
  children,
}: {
  pressed: boolean;
  size?: 'xs' | 'sm';
  isDisabled?: boolean;
  isLoading?: boolean;
  className?: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      size={size}
      color="secondary"
      className={cx(pressed && 'ring-2! ring-brand!', className)}
      aria-pressed={pressed}
      isDisabled={isDisabled}
      isLoading={isLoading}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}
