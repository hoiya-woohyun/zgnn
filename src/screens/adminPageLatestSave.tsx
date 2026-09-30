'use client';

import { Button } from '../components/base/button';
import type { TLatestPlan } from '../lib/adminLatest';
import { AdminChangeList } from './adminChangeList';

/**
 * **최신본으로 저장하기** — 짝지은 기존 장소를 이 후보의 최신 분석 값으로 덮는다(`overwriteWithLatest`).
 *
 * 합치기(빈 칸만 채움)와 나란히 두는 이유: 재분석 뒤의 후보는 기존 장소에 짝이 붙는데, 그 장소는 칸이 이미 다 차 있어
 * 합치기로는 새 판단이 한 칸도 안 들어간다(사용자 지적 — 되살려서 합치기·반려하기·고치기뿐이고 최신본으로 저장이 없다).
 *
 * **버튼보다 목록이 먼저다.** 덮어쓰기는 사람이 쓴 문장을 지울 수 있어서, 무엇이 무엇으로 바뀌는지를 읽은 뒤에만 누르게 한다.
 * 목록은 쓰기와 **같은 patch** 에서 나온다(`latestPlan`) — 본 것과 덮이는 것이 어긋날 수 없다.
 * 바뀌는 칸이 없으면 버튼을 그리지 않고 그렇다고만 말한다(빈 update 도 재빌드 트리거를 부른다).
 */
export function AdminPageLatestSave({
  plan,
  label,
  caption,
  busy,
  onSave,
}: {
  plan: TLatestPlan;
  label: string;
  caption: string;
  busy: boolean;
  onSave: () => void;
}) {
  if (!plan.changes.length) {
    return <p className="text-xs text-tertiary">새 분석이 지금 장소 값과 같아요 — 최신본으로 덮을 칸이 없어요.</p>;
  }
  return (
    <div className="space-y-2 rounded-lg bg-secondary px-3 py-2">
      <AdminChangeList title="최신본으로 저장하면 — 지금 장소 값 → 새 분석 값" changes={plan.changes} />
      <div className="flex flex-wrap items-center gap-2">
        <Button color="secondary" size="sm" isDisabled={busy} onClick={onSave}>
          {label}
        </Button>
        <span className="text-xs text-tertiary">{caption}</span>
      </div>
    </div>
  );
}
