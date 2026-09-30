'use client';

import { Button } from '../components/base/button';
import { Input } from '../components/base/input';
import { Select } from '../components/base/select';
import { TYPE_LABEL } from '../lib/adminCandidates';
import {
  editProblem,
  editSummary,
  EDITABLE_TYPES,
  identityChanged,
  type TCandidateEditDraft,
} from '../lib/adminEdit';
import type { TCandidateExtracted } from '../lib/adminCandidates';
import { draftFromExtracted } from '../lib/adminEdit';

/**
 * 후보 고치기 폼 — 펼친 줄 안에서만 열린다(`adminPageGroupCard`).
 *
 * **승인 전 후보만 고친다.** 사이트에 이미 올라간 `places` 행은 이 폼이 닿지 않는다 — 그쪽은 되돌릴 길이 없고
 * (`places` 변경이 곧 재빌드 트리거다) 여기는 승인 전이라 실수의 값이 작다.
 *
 * ⚠️ **동반 정보(`petPolicy`)는 여기 없다.** 넣으려면 `correctPetPolicyFacts` 를 지나야 하는데 그 함수가
 * 원문에 근거 없는 판단을 지우므로(사람이 넣은 값도 예외가 아니다), 고쳐도 사이트에는 안 나가는 일이
 * 조용히 벌어진다. 조건 원문이 빈 후보는 아예 `pet_policy` 를 안 쓰기도 한다 — 자세한 것은 `adminEdit.ts` 머리 주석.
 *
 * 저장 버튼을 **바뀐 것이 없으면 끈다.** 빈 저장은 `extracted` 를 통째로 다시 쓰는 일이라(jsonb update)
 * 아무 효과 없이 낡은 스냅샷으로 덮어쓸 위험만 남는다.
 */
export function AdminPageEditForm({
  draft,
  original,
  busy,
  onChange,
  onCancel,
  onSave,
}: {
  draft: TCandidateEditDraft;
  /** 고치기 전 값 — '바뀐 것' 과 '짝을 다시 잡는다' 를 말하려면 둘을 비교해야 한다. */
  original: TCandidateExtracted;
  busy: boolean;
  onChange: (next: TCandidateEditDraft) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const before = draftFromExtracted(original);
  const changed = editSummary(draft, before);
  const problem = editProblem(draft);
  const rematch = identityChanged(draft, original);
  const set = (patch: Partial<TCandidateEditDraft>) => onChange({ ...draft, ...patch });

  return (
    <div className="border-t border-dashed border-tertiary px-4 py-3">
      <div className="grid gap-3 md:grid-cols-2">
        <Input
          label="이름"
          size="sm"
          value={draft.name}
          onChange={(value) => set({ name: value })}
          isDisabled={busy}
        />
        <Select
          label="종류"
          size="sm"
          selectedKey={draft.type}
          onSelectionChange={(key) => key && set({ type: key as TCandidateEditDraft['type'] })}
          isDisabled={busy}
        >
          {EDITABLE_TYPES.map((type) => (
            <Select.Item key={type} id={type}>
              {TYPE_LABEL[type]}
            </Select.Item>
          ))}
        </Select>
        <Input
          label="주소"
          size="sm"
          value={draft.address}
          onChange={(value) => set({ address: value })}
          isDisabled={busy}
          className="md:col-span-2"
        />
        {/*
          * 좌표는 두 칸이다. 한 칸만 채운 상태는 `validGeo` 가 통째로 버려 좌표가 조용히 사라지므로
          * `editProblem` 이 저장을 막는다 — 여기서 말해 주지 않으면 버튼만 꺼져 이유를 알 수 없다.
          */}
        <Input label="위도" size="sm" value={draft.lat} onChange={(value) => set({ lat: value })} isDisabled={busy} />
        <Input label="경도" size="sm" value={draft.lng} onChange={(value) => set({ lng: value })} isDisabled={busy} />
        {/*
          * AI 요약만 `<textarea>` 다. `components/base` 에 TextArea 가 없고 그 폴더는 Untitled UI 복사본이라
          * 건드리지 않는다(CLAUDE.md) — 한 자리에서만 쓰는 것이라 감싸는 컴포넌트를 새로 만들지 않고 여기 둔다.
          * 한 줄 `Input` 으로 두지 않는 이유: 이 값은 두 문장이고 승인되면 그대로 사이트의 소개가 된다.
          */}
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-secondary" htmlFor="admin-edit-features">
            AI 요약
          </label>
          <textarea
            id="admin-edit-features"
            rows={3}
            value={draft.features}
            disabled={busy}
            onChange={(event) => set({ features: event.target.value })}
            className="mt-1.5 block w-full rounded-lg border border-primary bg-primary px-3 py-2 text-sm text-primary shadow-xs outline-focus-ring placeholder:text-placeholder focus:outline-2 focus:outline-offset-2 disabled:cursor-not-allowed disabled:bg-disabled_subtle"
          />
          <p className="mt-1.5 text-xs text-tertiary">승인하면 이 문장이 그대로 사이트의 소개가 돼요.</p>
        </div>
      </div>

      {/*
        * 짝을 다시 잡는다는 것을 **누르기 전에** 말한다. 이름·주소를 고치는 가장 흔한 이유가
        * "네이버가 동명의 다른 가게를 집었다" 이고, 그때 사람이 기대하는 것이 정확히 이 재계산이다.
        */}
      {rematch && (
        <p className="mt-2 text-xs text-tertiary">
          이름·종류·주소·좌표가 바뀌어서, 저장할 때 <span className="font-semibold">어느 장소와 같은 곳인지 다시 찾아요.</span>{' '}
          짝이 바뀌거나 풀릴 수 있어요.
        </p>
      )}
      {problem && <p className="mt-2 text-xs text-error-primary">{problem}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          color="primary"
          size="sm"
          isDisabled={busy || changed.length === 0 || Boolean(problem)}
          isLoading={busy}
          onClick={onSave}
        >
          저장
        </Button>
        <Button color="secondary" size="sm" isDisabled={busy} onClick={onCancel}>
          취소
        </Button>
        {changed.length > 0 && <span className="text-xs text-tertiary">바뀐 것: {changed.join(' · ')}</span>}
      </div>
    </div>
  );
}
