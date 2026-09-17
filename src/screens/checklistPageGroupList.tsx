import type { ReactNode } from 'react';
import type { TItemGroup } from '../lib/itemGroups';
import type { TItem } from '../types';

type TChecklistPageGroupListProps = {
  groups: TItemGroup[];
  renderRow: (item: TItem) => ReactNode;
};

/**
 * 묶음 머리글이 달린 준비물 목록.
 *
 * 묶음이 하나뿐이면 머리글을 생략한다 — 가를 것이 없는데 이름표만 붙으면, 읽는 사람은
 * 보이지 않는 다른 묶음을 찾게 된다.
 *
 * 머리글이 h3 인 것은 위 h2(이번 여행 / 그 밖에)의 아래 단계이기 때문이다. 글자를 작고
 * 흐리게 두는 것도 같은 이유다 — 급한 순서가 먼저 읽히고, 쓰는 자리는 그 안의 가름이다.
 */
export function ChecklistPageGroupList({ groups, renderRow }: TChecklistPageGroupListProps) {
  if (groups.length === 0) return null;

  if (groups.length === 1) {
    return <ul className="space-y-2">{groups[0].items.map(renderRow)}</ul>;
  }

  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <div key={group.id}>
          <h3 className="flex items-baseline gap-2 text-sm font-semibold text-tertiary">
            {group.label}
            <span className="text-xs font-normal text-quaternary">{group.items.length}가지</span>
          </h3>
          <ul className="mt-2 space-y-2">{group.items.map(renderRow)}</ul>
        </div>
      ))}
    </div>
  );
}
