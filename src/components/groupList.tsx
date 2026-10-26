import type { ReactNode } from 'react';
import { CARD_SURFACE } from './cardSurface';

type TGroupListProps = {
  children: ReactNode;
  className?: string;
};

/**
 * 그룹 리스트 — 같은 종류의 행이 둘 이상이면 **면 한 장 + 행 사이 1px 구분선**(22 G2.0 · A-1).
 * 행마다 카드를 따로 세우면 면이 N장이 되어 "덩어리 하나" 가 아니라 "카드 더미" 로 읽힌다.
 * 면은 한 겹이다 — 안쪽 구분은 구분선·소제목·여백으로만 하고 안쪽에 또 상자를 만들지 않는다(A-2).
 * 행은 `GroupListRow`. 행 사이 간격은 0, 묶음과 묶음 사이 32px 는 부르는 쪽 `Section` 의 `mt-8`.
 */
export function GroupList({ children, className = '' }: TGroupListProps) {
  return (
    <div className={`divide-y divide-secondary overflow-hidden ${CARD_SURFACE} ${className}`}>
      {children}
    </div>
  );
}
