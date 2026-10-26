import type { ReactNode } from 'react';

type TGroupListProps = {
  /** 그룹 머리 — 14/600 `text-tertiary`. 화면의 섹션 머리(16/700)보다 한 단 낮은, 목록 위의 이름표다. */
  title?: string;
  children: ReactNode;
  className?: string;
};

/**
 * 그룹 리스트 — 같은 종류의 행을 **크림 위에 1px 구분선으로** 쌓는다(22 G2.0a · design-audit B-17, ADR-003 v25).
 * 처음(G2.0)엔 흰 면 한 장 + 구분선이었는데, 둥근 흰 면이 화면마다 쌓이는 것 자체가 "AI 가 만든 카드 구성" 으로 읽혀
 * 면을 걷었다. 면은 상세 판정·지도·떠 있는 시트에만 남는다. 그래서 이 부품엔 면을 켜는 갈래가 없다.
 * 행은 `GroupListRow`(눌림 `bg-tertiary`), 그룹과 그룹 사이는 `GroupListBand`(8px 띠). 부르는 쪽이 좌우 여백(`px-4`)을 준다.
 */
export function GroupList({ title, children, className = '' }: TGroupListProps) {
  return (
    <div className={className}>
      {title && <h2 className="pt-4 pb-1 text-sm font-semibold text-tertiary">{title}</h2>}
      <div className="divide-y divide-secondary">{children}</div>
    </div>
  );
}

/** 그룹 사이 8px 띠 — 화면 폭 전체(부르는 쪽 여백 밖)에 깐다. 여백 32 대신 띠로 묶음을 가른다. */
export function GroupListBand({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`h-2 bg-tertiary ${className}`} />;
}
