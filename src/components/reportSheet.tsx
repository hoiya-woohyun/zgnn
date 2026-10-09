'use client';

import { useId, useState } from 'react';
import { BottomSheet } from './base/bottom-sheet';
import { Button } from './base/button';
import { showAppStatus } from '../lib/appStatus';
import {
  buildReport,
  canReportNow,
  REPORT_COOLDOWN_TEXT,
  REPORT_KIND_LABEL,
  REPORT_NOTE_MAX,
  reportFailureText,
  reportPromiseText,
  reportSentText,
  type TReportKind,
} from '../lib/placeReport';
import { APP_BUILD, readReportRecord, rememberReport, sendPlaceReport } from '../lib/placeReportSend';
import { NO_AUTOFILL } from './noAutofill';
import { cx } from '../utils/cx';

type TReportSheetProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** 무엇을 알리는지 한 줄. */
  lead?: string;
  /** 사이트 장소 id. 장소 제안(`suggest`)이면 null. */
  placeId: string | null;
  /** 고를 종류. 하나뿐이면 고르는 줄을 그리지 않는다. */
  kinds: readonly TReportKind[];
  notePlaceholder: string;
  /** 한 줄이 꼭 있어야 하나(장소 제안 — 가게 이름). */
  noteRequired?: boolean;
  /** 열 때마다 한 줄 칸에 미리 채울 글(둘러보기의 방금 검색어). 시트는 닫혀도 마운트돼 있어 첫 값만으로는 다시 열 때 안 채워진다. */
  initialNote?: string;
};

/**
 * 제보 시트 — 종류 하나 고르고(선택) 한 줄 적어 보낸다(ADR-021, docs/todo/10 F1·F8).
 *
 * **보낸 뒤 다시 읽을 수 없다**(비로그인 역할에 select 가 없다) — 그래서 결과는 성공/실패 한 줄(`showAppStatus`)뿐이고 답장이 없다.
 * 장소는 상세에서 자동으로 실린다 — 사용자가 어느 곳인지 다시 적지 않는다. 연락처를 묻는 칸은 만들지 않는다(ADR-012 의 선 바깥).
 */
export function ReportSheet({
  isOpen,
  onOpenChange,
  title,
  lead,
  placeId,
  kinds,
  notePlaceholder,
  noteRequired = false,
  initialNote = '',
}: TReportSheetProps) {
  const [kind, setKind] = useState<TReportKind | null>(kinds.length === 1 ? kinds[0] : null);
  const [note, setNote] = useState('');
  // 열리는 순간 미리 채운다 — effect 가 아니라 렌더 중 이전 값과 견주는 꼴(닫힌 사이에 바뀐 검색어도 열 때 반영된다).
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen && initialNote !== '') setNote(initialNote);
  }
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const noteId = useId();

  const close = () => {
    onOpenChange(false);
    setKind(kinds.length === 1 ? kinds[0] : null);
    setNote('');
    setProblem(null);
  };

  const submit = async () => {
    if (!kind) {
      setProblem('무엇이 다른지 하나 골라 주세요.');
      return;
    }
    if (!canReportNow(readReportRecord(), placeId, kind, Date.now())) {
      showAppStatus(REPORT_COOLDOWN_TEXT);
      close();
      return;
    }
    const built = buildReport({ placeId, kind, note, build: APP_BUILD });
    if (!built.ok) {
      setProblem(built.problem);
      return;
    }
    setSending(true);
    const result = await sendPlaceReport(built.row);
    setSending(false);
    if (!result.ok) {
      // 시트는 닫지 않는다 — 적은 말을 잃지 않고 다시 누를 수 있게.
      setProblem(reportFailureText(result.reason));
      return;
    }
    rememberReport(placeId, kind);
    showAppStatus(reportSentText(kind));
    close();
  };

  const length = [...note].length;

  return (
    <BottomSheet isOpen={isOpen} onOpenChange={(open) => (open ? onOpenChange(true) : close())} label={title}>
      <div className="flex max-h-[80dvh] flex-col">
        <h2 className="shrink-0 pt-2 pr-10 text-md font-bold text-primary">{title}</h2>
        {lead && <p className="mt-1 shrink-0 text-sm text-tertiary">{lead}</p>}

        <div className="mt-4 min-h-0 flex-1 space-y-4 overflow-y-auto pb-2">
          {kinds.length > 1 && (
            <div role="radiogroup" aria-label="무엇이 다른가요" className="space-y-2">
              {kinds.map((candidate) => {
                const selected = kind === candidate;
                return (
                  <button
                    key={candidate}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => {
                      setKind(candidate);
                      setProblem(null);
                    }}
                    className={cx(
                      'flex min-h-11 w-full items-center gap-3 rounded-2xl border px-3 py-2 text-left transition-colors',
                      selected ? 'border-brand bg-brand-primary' : 'border-secondary bg-primary hover:bg-tertiary',
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cx(
                        'grid size-5 shrink-0 place-items-center rounded-full border-2',
                        selected ? 'border-brand-solid' : 'border-secondary',
                      )}
                    >
                      {selected && <span className="size-2.5 rounded-full bg-brand-solid" />}
                    </span>
                    <span className={cx('text-sm font-semibold', selected ? 'text-brand-secondary' : 'text-primary')}>
                      {REPORT_KIND_LABEL[candidate]}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          <div>
            <label htmlFor={noteId} className="text-sm font-semibold text-secondary">
              {noteRequired ? '가게 이름과 동네' : '한 줄 더 (선택)'}
            </label>
            <textarea
              {...NO_AUTOFILL}
              id={noteId}
              value={note}
              onChange={(event) => {
                setNote(event.target.value);
                setProblem(null);
              }}
              rows={noteRequired ? 2 : 3}
              placeholder={notePlaceholder}
              className="mt-1.5 block w-full resize-none rounded-xl border border-secondary bg-primary px-3 py-2 text-md text-primary placeholder:text-placeholder focus:border-brand focus:outline-none"
            />
            <p className={cx('mt-1 text-right text-xs', length > REPORT_NOTE_MAX ? 'text-error-primary' : 'text-tertiary')}>
              {length}/{REPORT_NOTE_MAX}
            </p>
          </div>

          <p className="text-xs text-tertiary">{reportPromiseText(kinds)}</p>
        </div>

        {problem && (
          <p role="alert" className="shrink-0 pt-1 text-sm text-error-primary">
            {problem}
          </p>
        )}
        <Button size="lg" color="primary" className="mt-3 h-11 w-full shrink-0" isLoading={sending} isDisabled={sending} onClick={() => void submit()}>
          {sending ? '보내고 있어요' : '보내기'}
        </Button>
      </div>
    </BottomSheet>
  );
}
