'use client';

import { useState } from 'react';
import { Button } from '../components/base/button';
import { Checkbox } from '../components/base/checkbox';
import { Input } from '../components/base/input';
import { NO_AUTOFILL } from '../components/noAutofill';
import { postDateLabel, postStatus, rereadSummary, type TPostRow, type TReopenPlan } from '../lib/adminPosts';
import { cx } from '../utils/cx';

type TAdminPagePostsPanelRowProps = {
  row: TPostRow;
  /** 분석 제외 칸이 있나(마이그레이션 적용) — 없으면 `분석 제외`·`제외 해제` 를 안 그린다. */
  excludedApplied: boolean;
  selected: boolean;
  onSelect: (next: boolean) => void;
  /** 패널이 쓰는 중(일괄 포함) — 줄 버튼과 체크를 잠근다. */
  locked: boolean;
  /** 아래 넷은 성공하면 패널이 결과 한 줄을 말하고 페이지를 다시 읽는다. 실패하면 던진다 — 그 이유는 이 줄에 남는다. */
  onExclude: (note: string) => Promise<void>;
  onUnexclude: () => Promise<void>;
  onPlanReread: () => Promise<TReopenPlan>;
  onReread: (plan: TReopenPlan) => Promise<void>;
};

type TRowStep = { mode?: 'exclude' | 'reread'; plan?: TReopenPlan; busy?: boolean; error?: string };

const messageOf = (error: unknown) => (error instanceof Error ? error.message : '처리하지 못했어요.');

const ROW_ACTION = 'shrink-0 whitespace-nowrap';

/**
 * 수집 완료 칸의 글 한 줄(09 T3.2). 확인은 줄 안에서 한 번 더 누르는 꼴이다(패널의 ② 다시 열기와 같은 모양) —
 * `분석 제외` 는 사유 한 줄을 받고, `다시 읽기` 는 계획(`planReread`)을 먼저 읽어 눕힐 후보 수를 말한 뒤에 쓴다.
 */
export function AdminPagePostsPanelRow({
  row,
  excludedApplied,
  selected,
  onSelect,
  locked,
  onExclude,
  onUnexclude,
  onPlanReread,
  onReread,
}: TAdminPagePostsPanelRowProps) {
  const [step, setStep] = useState<TRowStep>({});
  const [note, setNote] = useState('');
  const status = postStatus(row);
  const excluded = Boolean(row.excluded_at);
  const analyzed = Boolean(row.analyzed_at) && !excluded;
  const disabled = locked || Boolean(step.busy);

  const run = async (write: () => Promise<void>, keep: TRowStep) => {
    setStep({ ...keep, busy: true, error: undefined });
    try {
      await write();
      setStep({});
      setNote('');
    } catch (error) {
      setStep({ ...keep, error: messageOf(error) });
    }
  };
  const planReread = async () => {
    setStep({ mode: 'reread', busy: true });
    try {
      setStep({ mode: 'reread', plan: await onPlanReread() });
    } catch (error) {
      setStep({ error: messageOf(error) });
    }
  };

  return (
    <li className="px-3 py-2">
      <div className="flex items-start gap-2">
        <span className="pt-0.5">
          <Checkbox size="sm" isSelected={selected} onChange={onSelect} isDisabled={disabled} aria-label={`${row.title ?? row.url} 고르기`} />
        </span>
        <div className="min-w-0 flex-1">
          <a className="break-all text-sm text-brand-secondary underline" href={row.url} target="_blank" rel="noopener noreferrer">
            {row.title ?? row.url}
          </a>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-tertiary">
            <span>{row.keyword ?? '검색어 없음'}</span>
            <span className="tabular-nums">{postDateLabel(row.posted_at)}</span>
            <span
              className={cx(
                'rounded-full px-2 py-0.5 font-medium',
                excluded ? 'bg-tertiary text-tertiary' : analyzed ? 'bg-success-primary text-success-primary' : 'bg-secondary text-secondary',
              )}
            >
              {status}
            </span>
          </p>
          {excluded && row.exclude_note ? <p className="mt-0.5 text-xs text-quaternary">{row.exclude_note}</p> : null}
        </div>
        {!step.mode && (
          <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
            {analyzed && (
              <Button color="secondary" size="sm" className={ROW_ACTION} isDisabled={disabled} isLoading={step.busy} onClick={() => void planReread()}>
                다시 읽기
              </Button>
            )}
            {excludedApplied && !excluded && (
              <Button color="secondary" size="sm" className={ROW_ACTION} isDisabled={disabled} onClick={() => setStep({ mode: 'exclude' })}>
                분석 제외
              </Button>
            )}
            {excludedApplied && excluded && (
              <Button color="secondary" size="sm" className={ROW_ACTION} isDisabled={disabled} isLoading={step.busy} onClick={() => void run(onUnexclude, {})}>
                제외 해제
              </Button>
            )}
          </div>
        )}
      </div>

      {step.mode === 'exclude' && (
        <div className="mt-2 flex flex-wrap items-center gap-2 pl-7">
          <div className="min-w-48 flex-1">
            <Input {...NO_AUTOFILL} aria-label="제외 사유(선택)" placeholder="제외 사유 (선택) — 예: 광고 글" value={note} onChange={setNote} isDisabled={step.busy} size="sm" />
          </div>
          <Button color="secondary" size="sm" isLoading={step.busy} isDisabled={disabled} onClick={() => void run(() => onExclude(note), { mode: 'exclude' })}>
            분석 제외
          </Button>
          <Button color="secondary" size="sm" isDisabled={step.busy} onClick={() => setStep({})}>
            취소
          </Button>
        </div>
      )}

      {step.mode === 'reread' && step.plan && (
        <div className="mt-2 space-y-1.5 pl-7 text-xs">
          <p className="text-tertiary">{rereadSummary(step.plan)}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              color="secondary"
              size="sm"
              isLoading={step.busy}
              isDisabled={disabled || step.plan.posts.length === 0}
              onClick={() => step.plan && void run(() => onReread(step.plan as TReopenPlan), { mode: 'reread', plan: step.plan })}
            >
              다시 읽기
            </Button>
            <Button color="secondary" size="sm" isDisabled={step.busy} onClick={() => setStep({})}>
              취소
            </Button>
          </div>
        </div>
      )}

      {step.error && <p className="mt-1 pl-7 text-xs text-error-primary">{step.error}</p>}
    </li>
  );
}
