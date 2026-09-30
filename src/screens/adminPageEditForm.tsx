'use client';

import { Button } from '../components/base/button';
import { Input } from '../components/base/input';
import { Select } from '../components/base/select';
import { TYPE_LABEL } from '../lib/adminCandidates';
import { Checkbox } from '../components/base/checkbox';
import {
  draftFromExtracted,
  editPreview,
  editProblem,
  editSummary,
  EDITABLE_TYPES,
  identityChanged,
  type TCandidateEditDraft,
  type TPolicyDraft,
  type TTriState,
} from '../lib/adminEdit';
import type { TCandidateExtracted } from '../lib/adminCandidates';
import { cx } from '../utils/cx';

const INDOOR_OPTIONS: { key: TPolicyDraft['indoor']; label: string }[] = [
  { key: 'unknown', label: '언급 없음' },
  { key: 'free', label: '실내 자유' },
  { key: 'cage', label: '실내는 케이지' },
  { key: 'outdoorOnly', label: '야외만' },
];

/**
 * 삼항 한 줄. **체크박스로 두지 않는다** — `false`("불가 라고 적혀 있다")와 `null`("언급이 없다")이 한 칸이 되면
 * 그 둘이 구별되지 않는데, 판정은 정반대다. BUG-009 가 정확히 그 혼동이었다(`largeDogOk` 가 참/거짓 한 칸이라
 * 28kg 보호자에게 원문과 반대되는 안내가 떴다).
 */
function TriRow({
  label,
  value,
  yes,
  no,
  busy,
  onChange,
}: {
  label: string;
  value: TTriState;
  yes: string;
  no: string;
  busy: boolean;
  onChange: (next: TTriState) => void;
}) {
  const options: { key: TTriState; text: string }[] = [
    { key: 'unknown', text: '언급 없음' },
    { key: 'yes', text: yes },
    { key: 'no', text: no },
  ];
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="w-20 shrink-0 text-xs text-tertiary">{label}</span>
      {options.map((option) => (
        <Button
          key={option.key}
          size="sm"
          color={value === option.key ? 'primary' : 'secondary'}
          aria-pressed={value === option.key}
          isDisabled={busy}
          onClick={() => onChange(option.key)}
        >
          {option.text}
        </Button>
      ))}
    </div>
  );
}

/**
 * 후보 고치기 폼 — 펼친 줄 안에서만 열린다(`adminPageGroupCard`).
 *
 * **승인 전 후보만 고친다.** 사이트에 이미 올라간 `places` 행은 이 폼이 닿지 않는다 — 그쪽은 되돌릴 길이 없고
 * (`places` 변경이 곧 재빌드 트리거다) 여기는 승인 전이라 실수의 값이 작다.
 *
 * **동반 정보는 구조값과 조건 원문을 나란히 둔다.** 갈라 놓을 수 없어서다 — `correctPetPolicyFacts` 가
 * 원문에 근거 없는 판단을 지우고(사람이 넣은 값도 예외가 아니다) 그 보정은 사이트가 그릴 때마다 다시 돈다.
 * 그래서 오른쪽에 **미리보기**를 둔다: 지금 값이 칩으로 무엇이 되는지, 무엇이 원문에 없어 빠지는지.
 * 빠진 것이 보이면 왼쪽 원문에 그 말을 더하면 된다 — 그러라고 원문 칸이 있다.
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
  const setPolicy = (patch: Partial<TPolicyDraft>) => set({ policy: { ...draft.policy, ...patch } });
  const { cell, corrections } = editPreview(draft);

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

      {/* ── 동반 정보 ─────────────────────────────────────────────────────────
        * 원문과 구조값이 **한 상자 안에** 있고 결과가 그 아래 붙는다. 셋을 떼어 놓으면 "원문을 고쳐서 칩이
        * 생겼다" 는 인과가 화면에서 끊긴다 — 이 상자의 요점이 그 인과다.
        */}
      <div className="mt-3 rounded-lg bg-secondary px-3 py-2">
        <p className="text-xs font-semibold text-secondary">동반 정보</p>

        <label className="mt-2 block text-xs text-tertiary" htmlFor="admin-edit-policy-text">
          조건 원문 — 블로그 본문에 적힌 문장
        </label>
        <textarea
          id="admin-edit-policy-text"
          rows={2}
          value={draft.petPolicyText}
          disabled={busy}
          onChange={(event) => set({ petPolicyText: event.target.value })}
          className="mt-1 block w-full rounded-lg border border-primary bg-primary px-3 py-2 text-sm text-primary shadow-xs outline-focus-ring disabled:cursor-not-allowed disabled:bg-disabled_subtle"
        />
        {/*
          * 원문이 비면 구조값을 아무리 채워도 반영기가 안 쓴다(ADR-017) — 버튼을 끄는 대신 이유를 말한다.
          * 끄면 "왜 안 되지" 가 되고, 여기서는 할 일(원문을 적는다)이 바로 위 칸에 있다.
          */}
        {!draft.petPolicyText.trim() && (
          <p className="mt-1 text-xs text-warning-primary">
            원문이 비어 있으면 아래 조건은 사이트에 안 나가요 — 본문의 조건 문장을 적어 주세요.
          </p>
        )}

        <div className="mt-2 space-y-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="w-20 shrink-0 text-xs text-tertiary">실내</span>
            {INDOOR_OPTIONS.map((option) => (
              <Button
                key={option.key}
                size="sm"
                color={draft.policy.indoor === option.key ? 'primary' : 'secondary'}
                aria-pressed={draft.policy.indoor === option.key}
                isDisabled={busy}
                onClick={() => setPolicy({ indoor: option.key })}
              >
                {option.label}
              </Button>
            ))}
          </div>
          <TriRow
            label="대형견"
            value={draft.policy.largeDogOk}
            yes="가능"
            no="불가"
            busy={busy}
            onChange={(largeDogOk) => setPolicy({ largeDogOk })}
          />
          <TriRow
            label="추가 요금"
            value={draft.policy.feeFree}
            yes="없음"
            no="있음"
            busy={busy}
            onChange={(feeFree) => setPolicy({ feeFree })}
          />
          <div className="flex flex-wrap items-center gap-3 pt-0.5">
            <Checkbox size="sm" label="리드줄" isSelected={draft.policy.leash} isDisabled={busy} onChange={(leash) => setPolicy({ leash })} />
            <Checkbox size="sm" label="소형견만" isSelected={draft.policy.smallDogOnly} isDisabled={busy} onChange={(smallDogOnly) => setPolicy({ smallDogOnly })} />
            <Checkbox size="sm" label="전화 확인" isSelected={draft.policy.callFirst} isDisabled={busy} onChange={(callFirst) => setPolicy({ callFirst })} />
          </div>
          <div className="grid gap-2 pt-1 md:grid-cols-2">
            <Input label="무게 상한(kg)" size="sm" value={draft.policy.weightLimitKg} isDisabled={busy} onChange={(weightLimitKg) => setPolicy({ weightLimitKg })} />
            <Input label="마릿수 상한" size="sm" value={draft.policy.maxDogs} isDisabled={busy} onChange={(maxDogs) => setPolicy({ maxDogs })} />
            <Input label="요금 문장" size="sm" value={draft.policy.feeText} isDisabled={busy} onChange={(feeText) => setPolicy({ feeText })} />
            <Input label="그 밖의 조건" size="sm" value={draft.policy.notes} isDisabled={busy} onChange={(notes) => setPolicy({ notes })} />
          </div>
        </div>

        {/*
          * **결과를 미리 돌려 보여 준다.** 표의 동반 정보 칸과 같은 함수(`previewFor`→`policyCell`)라
          * 저장 뒤 화면과 어긋날 수 없다. 이 줄이 없으면 보정에 지워진 값이 조용히 사라진다.
          */}
        <div className="mt-2 border-t border-dashed border-tertiary pt-2">
          <p className="text-xs text-tertiary">사이트에 이렇게 나가요</p>
          <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-tertiary">
            {cell.items.length ? (
              cell.items.map((item) => (
                <span
                  key={item.label}
                  className={cx('rounded px-1.5 py-px font-medium', item.tone === 'warn' ? 'bg-warning-primary text-warning-primary' : 'bg-primary text-secondary')}
                >
                  {item.label}
                </span>
              ))
            ) : (
              <span>{cell.message}</span>
            )}
          </div>
          {corrections.length > 0 && (
            <p className="mt-1 text-xs text-warning-primary">원문에 없어서 뺀 것: {corrections.join(' · ')}</p>
          )}
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
