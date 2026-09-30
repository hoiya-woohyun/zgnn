'use client';

import { Button } from '../components/base/button';
import { Input } from '../components/base/input';
import { Select } from '../components/base/select';
import { TYPE_LABEL } from '../lib/adminCandidates';
import { Checkbox } from '../components/base/checkbox';
import type { ReactNode } from 'react';
import {
  draftFromExtracted,
  editChanges,
  editFieldText,
  editPreview,
  editProblem,
  EDITABLE_TYPES,
  identityChanged,
  type TCandidateEditDraft,
  type TPolicyDraft,
  type TTriState,
} from '../lib/adminEdit';
import type { TCandidateExtracted } from '../lib/adminCandidates';
import type { TPolicyCell } from '../lib/adminPreview';
import { cx } from '../utils/cx';
import { AdminChangeList } from './adminChangeList';

const INDOOR_OPTIONS: { key: TPolicyDraft['indoor']; label: string }[] = [
  { key: 'unknown', label: '언급 없음' },
  { key: 'free', label: '실내 자유' },
  { key: 'cage', label: '실내는 케이지' },
  { key: 'outdoorOnly', label: '야외만' },
];

/**
 * 삼항 버튼 셋. **체크박스로 두지 않는다** — `false`("불가 라고 적혀 있다")와 `null`("언급이 없다")이 한 칸이 되면
 * 그 둘이 구별되지 않는데, 판정은 정반대다. BUG-009 가 정확히 그 혼동이었다(`largeDogOk` 가 참/거짓 한 칸이라
 * 28kg 보호자에게 원문과 반대되는 안내가 떴다).
 */
function TriButtons({
  value,
  yes,
  no,
  busy,
  onChange,
}: {
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
    <div className="flex flex-wrap gap-1.5">
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

/** 폼에서 쓰는 `<textarea>` 모양. `components/base` 에 TextArea 가 없고 그 폴더는 Untitled UI 복사본이라 건드리지 않는다(CLAUDE.md). */
const TEXTAREA =
  'block w-full rounded-lg border border-primary bg-primary px-3 py-2 text-sm text-primary shadow-xs outline-focus-ring placeholder:text-placeholder focus:outline-2 focus:outline-offset-2 disabled:cursor-not-allowed disabled:bg-disabled_subtle';

/** 표의 세 열 — 항목 · 지금 값 · 고칠 값. 머리글과 줄이 같은 상수를 본다(한쪽만 고치면 열이 어긋난다). */
const EDIT_GRID = 'md:grid md:grid-cols-[7rem_minmax(0,2fr)_minmax(0,3fr)] md:gap-3';

/**
 * 한 줄 — **왼쪽에 지금 값(읽기 전용), 오른쪽에 입력.** 바뀐 줄은 분홍 바탕 + `바뀜` 표시가 붙는다.
 *
 * 입력칸만 두던 자리다. 입력칸은 고치는 순간 원래 값을 지우므로, 몇 칸을 손댄 뒤에는 "원래 무엇이었나" 가 화면
 * 어디에도 없었다(사용자 지적). 지금 값을 옆에 **고정해 두면** 운영자는 한 줄에서 "이것을 → 이것으로" 를 읽는다.
 */
function EditRow({
  label,
  current,
  changed,
  children,
}: {
  label: string;
  current: string;
  changed: boolean;
  children: ReactNode;
}) {
  return (
    <div className={cx('space-y-1 rounded-md px-2 py-1.5', EDIT_GRID, 'md:items-start md:space-y-0', changed && 'bg-brand-primary')}>
      <div className="flex items-center gap-1.5 pt-1 text-xs font-medium text-secondary">
        {label}
        {changed && <span className="rounded bg-brand-solid px-1 py-px text-[0.625rem] font-semibold text-primary_on-brand">바뀜</span>}
      </div>
      <div className={cx('min-w-0 pt-1 text-xs whitespace-pre-line', changed ? 'text-tertiary line-through' : 'text-tertiary')}>
        <span className="text-quaternary md:hidden">지금 값 · </span>
        {current}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** 사이트에 나갈 동반 칩 한 벌. 미리보기의 전·후가 같은 모양이어야 "무엇이 생기고 사라졌나" 가 보인다. */
function PreviewChips({ cell }: { cell: TPolicyCell }) {
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-tertiary">
      {cell.items.length ? (
        cell.items.map((item) => (
          <span
            key={item.label}
            className={cx('rounded px-1.5 py-px font-medium', item.tone === 'warn' ? 'bg-warning-primary text-warning-primary' : 'bg-secondary text-secondary')}
          >
            {item.label}
          </span>
        ))
      ) : (
        <span>{cell.message}</span>
      )}
    </div>
  );
}

/**
 * 후보 고치기 폼 — 펼친 줄 안에서만 열린다(`adminPageGroupCard`).
 *
 * **모양은 "지금 값 | 고칠 값" 표다**(2026-09-30). 줄마다 원래 값이 옆에 고정돼 있고, 바뀐 줄은 칠해지고,
 * 저장 버튼 바로 위에 **저장하면 바뀌는 것** 목록(`지금 값 → 고칠 값`)이 선다. 그 전에는 입력칸만 있고
 * 버튼 옆에 `바뀐 것: 이름 · 동반 정보` 한 줄이었는데, 칸 이름만으로는 무엇을 무엇으로 바꾸는지가 안 보였다.
 *
 * **승인 전 후보만 고친다.** 사이트에 이미 올라간 `places` 행은 이 폼이 닿지 않는다 — 그쪽은 되돌릴 길이 없고
 * (`places` 변경이 곧 재빌드 트리거다) 여기는 승인 전이라 실수의 값이 작다.
 *
 * **동반 정보는 구조값과 조건 원문을 한 무리로 둔다.** 갈라 놓을 수 없어서다 — `correctPetPolicyFacts` 가
 * 원문에 근거 없는 판단을 지우고(사람이 넣은 값도 예외가 아니다) 그 보정은 사이트가 그릴 때마다 다시 돈다.
 * 그래서 그 아래에 **사이트 미리보기(지금 → 저장하면)**를 둔다: 칩으로 무엇이 되는지, 무엇이 원문에 없어 빠지는지.
 * 빠진 것이 보이면 조건 원문에 그 말을 더하면 된다 — 그러라고 원문 칸이 있다.
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
  const changes = editChanges(draft, before);
  const changedKeys = new Set(changes.map((change) => change.key));
  const problem = editProblem(draft);
  const rematch = identityChanged(draft, original);
  const set = (patch: Partial<TCandidateEditDraft>) => onChange({ ...draft, ...patch });
  const setPolicy = (patch: Partial<TPolicyDraft>) => set({ policy: { ...draft.policy, ...patch } });
  const { cell, corrections } = editPreview(draft);
  const { cell: cellBefore } = editPreview(before);
  const row = (key: string, label: string, children: ReactNode) => (
    <EditRow label={label} current={editFieldText(before, key)} changed={changedKeys.has(key)}>
      {children}
    </EditRow>
  );

  return (
    <div className="space-y-3 border-t border-dashed border-tertiary px-4 py-3">
      <p className="text-xs text-tertiary">
        왼쪽이 지금 값, 오른쪽에 고칠 값을 적어요. 바꾼 줄은 <span className="rounded bg-brand-primary px-1">분홍</span>으로 칠해지고,
        저장 전에 아래에서 한 번 더 모아 보여 줘요.
      </p>

      <section className="rounded-lg border border-secondary bg-primary p-1.5">
        <div className={cx('hidden px-2 py-1 text-[0.6875rem] font-semibold text-tertiary', EDIT_GRID)}>
          <span>항목</span>
          <span>지금 값</span>
          <span>고칠 값</span>
        </div>
        <p className="px-2 pt-1 text-xs font-semibold text-secondary">장소</p>
        {row('name', '이름', <Input aria-label="이름" size="sm" value={draft.name} onChange={(value) => set({ name: value })} isDisabled={busy} />)}
        {row(
          'type',
          '종류',
          <Select
            aria-label="종류"
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
          </Select>,
        )}
        {row('address', '주소', <Input aria-label="주소" size="sm" value={draft.address} onChange={(value) => set({ address: value })} isDisabled={busy} />)}
        {/*
          * 좌표는 두 칸이다. 한 칸만 채운 상태는 `validGeo` 가 통째로 버려 좌표가 조용히 사라지므로
          * `editProblem` 이 저장을 막는다 — 여기서 말해 주지 않으면 버튼만 꺼져 이유를 알 수 없다.
          */}
        {row(
          'geo',
          '좌표',
          <div className="grid grid-cols-2 gap-2">
            <Input aria-label="위도" placeholder="위도" size="sm" value={draft.lat} onChange={(value) => set({ lat: value })} isDisabled={busy} />
            <Input aria-label="경도" placeholder="경도" size="sm" value={draft.lng} onChange={(value) => set({ lng: value })} isDisabled={busy} />
          </div>,
        )}
        {/* 한 줄 `Input` 으로 두지 않는 이유: 이 값은 두 문장이고 승인되면 그대로 사이트의 소개가 된다. */}
        {row(
          'features',
          'AI 요약',
          <>
            <textarea
              aria-label="AI 요약"
              rows={3}
              value={draft.features}
              disabled={busy}
              onChange={(event) => set({ features: event.target.value })}
              className={TEXTAREA}
            />
            <p className="mt-1 text-xs text-tertiary">승인하면 이 문장이 그대로 사이트의 소개가 돼요.</p>
          </>,
        )}

        {/* ── 동반 정보 ─────────────────────────────────────────────────────────
          * 원문과 구조값이 **한 무리 안에** 있고 결과(미리보기)가 그 아래 붙는다. 셋을 떼어 놓으면 "원문을 고쳐서 칩이
          * 생겼다" 는 인과가 화면에서 끊긴다 — 이 무리의 요점이 그 인과다.
          */}
        <p className="mt-2 border-t border-secondary px-2 pt-2 text-xs font-semibold text-secondary">동반 정보</p>
        {row(
          'petPolicyText',
          '조건 원문',
          <>
            <textarea
              aria-label="조건 원문"
              rows={2}
              value={draft.petPolicyText}
              disabled={busy}
              placeholder="블로그 본문에 적힌 조건 문장"
              onChange={(event) => set({ petPolicyText: event.target.value })}
              className={TEXTAREA}
            />
            {/*
              * 원문이 비면 구조값을 아무리 채워도 반영기가 안 쓴다(ADR-017) — 버튼을 끄는 대신 이유를 말한다.
              * 끄면 "왜 안 되지" 가 되고, 여기서는 할 일(원문을 적는다)이 바로 이 칸에 있다.
              */}
            {!draft.petPolicyText.trim() ? (
              <p className="mt-1 text-xs text-warning-primary">원문이 비어 있으면 아래 조건은 사이트에 안 나가요 — 본문의 조건 문장을 적어 주세요.</p>
            ) : (
              <p className="mt-1 text-xs text-tertiary">아래 칸에 넣은 조건도 이 문장에 근거가 있어야 사이트에 나가요.</p>
            )}
          </>,
        )}
        {row(
          'indoor',
          '실내',
          <div className="flex flex-wrap gap-1.5">
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
          </div>,
        )}
        {row('largeDogOk', '대형견', <TriButtons value={draft.policy.largeDogOk} yes="가능" no="불가" busy={busy} onChange={(largeDogOk) => setPolicy({ largeDogOk })} />)}
        {row('feeFree', '추가 요금', <TriButtons value={draft.policy.feeFree} yes="없음" no="있음" busy={busy} onChange={(feeFree) => setPolicy({ feeFree })} />)}
        {/*
          * 요금은 **여러 줄**이다(2026-09-30). 한 줄 `Input` 이던 동안 기준이 둘 이상인 곳
          * ("1~5kg 1만원" + "6~10kg 1.5만원")을 한 칸에 적을 수밖에 없었고, 그러면 사이트에도 한 칸으로 나갔다.
          */}
        {row(
          'feeLines',
          '강아지 요금',
          <textarea
            aria-label="강아지 요금"
            rows={2}
            value={draft.policy.feeLines}
            disabled={busy}
            placeholder={'기준마다 한 줄\n예: 1마리당 3만원\n청소비 5만원'}
            onChange={(event) => setPolicy({ feeLines: event.target.value })}
            className={TEXTAREA}
          />,
        )}
        {row('weightLimitKg', '무게 상한', <Input aria-label="무게 상한(kg)" placeholder="숫자만 (kg)" size="sm" value={draft.policy.weightLimitKg} isDisabled={busy} onChange={(weightLimitKg) => setPolicy({ weightLimitKg })} />)}
        {row('maxDogs', '마릿수 상한', <Input aria-label="마릿수 상한" placeholder="숫자만 (마리)" size="sm" value={draft.policy.maxDogs} isDisabled={busy} onChange={(maxDogs) => setPolicy({ maxDogs })} />)}
        {row('leash', '리드줄', <Checkbox size="sm" label="리드줄 필수" isSelected={draft.policy.leash} isDisabled={busy} onChange={(leash) => setPolicy({ leash })} />)}
        {row('smallDogOnly', '소형견만', <Checkbox size="sm" label="소형견만 가능" isSelected={draft.policy.smallDogOnly} isDisabled={busy} onChange={(smallDogOnly) => setPolicy({ smallDogOnly })} />)}
        {row('callFirst', '전화 확인', <Checkbox size="sm" label="가기 전 전화 확인" isSelected={draft.policy.callFirst} isDisabled={busy} onChange={(callFirst) => setPolicy({ callFirst })} />)}
        {row('notes', '그 밖의 조건', <Input aria-label="그 밖의 조건" size="sm" value={draft.policy.notes} isDisabled={busy} onChange={(notes) => setPolicy({ notes })} />)}
      </section>

      {/*
        * **결과를 미리 돌려 보여 준다 — 지금과 저장 뒤를 나란히.** 표의 동반 정보 칸과 같은 함수(`previewFor`→`policyCell`)라
        * 저장 뒤 화면과 어긋날 수 없다. 이 줄이 없으면 보정에 지워진 값이 조용히 사라진다.
        */}
      <section className="grid gap-2 rounded-lg bg-secondary px-3 py-2 md:grid-cols-2">
        <div>
          <p className="text-xs text-tertiary">사이트의 동반 정보 — 지금</p>
          <PreviewChips cell={cellBefore} />
        </div>
        <div className="md:border-l md:border-secondary md:pl-3">
          <p className="text-xs font-semibold text-secondary">저장하면</p>
          <PreviewChips cell={cell} />
          {corrections.length > 0 && <p className="mt-1 text-xs text-warning-primary">원문에 없어서 뺀 것: {corrections.join(' · ')}</p>}
        </div>
      </section>

      <AdminChangeList title="저장하면 바뀌는 것 — 지금 값 → 고칠 값" changes={changes} />

      {/*
        * 짝을 다시 잡는다는 것을 **누르기 전에** 말한다. 이름·주소를 고치는 가장 흔한 이유가
        * "네이버가 동명의 다른 가게를 집었다" 이고, 그때 사람이 기대하는 것이 정확히 이 재계산이다.
        */}
      {rematch && (
        <p className="text-xs text-tertiary">
          이름·종류·주소·좌표가 바뀌어서, 저장할 때 <span className="font-semibold">어느 장소와 같은 곳인지 다시 찾아요.</span> 짝이 바뀌거나 풀릴 수 있어요.
        </p>
      )}
      {problem && <p className="text-xs text-error-primary">{problem}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <Button color="primary" size="sm" isDisabled={busy || changes.length === 0 || Boolean(problem)} isLoading={busy} onClick={onSave}>
          {changes.length ? `${changes.length}칸 바꿔서 저장` : '저장'}
        </Button>
        <Button color="secondary" size="sm" isDisabled={busy} onClick={onCancel}>
          취소
        </Button>
        {!changes.length && <span className="text-xs text-tertiary">아직 바꾼 칸이 없어요</span>}
      </div>
    </div>
  );
}
