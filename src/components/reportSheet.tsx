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
  REASON_NOTE_MAX,
  REPORT_NOTE_MAX,
  reportFailureText,
  reportPromiseText,
  reportSentText,
  type TReportInsert,
  type TReportKind,
  type TVerdictReason,
  VERDICT_REASON_LABEL,
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
  /**
   * 무엇이 틀렸는지 고르는 줄('판정이 틀렸어요', 14 W261019.16). 넘기면 하나를 꼭 골라야 보내진다 — 빈 채로 가던 제보를 막는다.
   * 고른 말은 한 줄 앞머리로 붙는다(`buildReport`).
   */
  reasons?: readonly TVerdictReason[];
  notePlaceholder: string;
  /** 한 줄이 꼭 있어야 하나(장소 제안 — 가게 이름). */
  noteRequired?: boolean;
  /**
   * 열 때마다 한 줄 칸에 미리 채울 글(둘러보기의 방금 검색어). 시트는 닫혀도 마운트돼 있어 첫 값만으로는 다시 열 때 안 채워진다.
   * 사용자가 고쳐 둔 초안이 있으면 채우지 않는다.
   */
  initialNote?: string;
  /**
   * 보낸 뒤 화면 아래 한 줄(`showAppStatus`)을 띄우나. 입구 바로 밑에 흔적 줄이 서는 자리(상세 맨 아래 카드)는 끈다 —
   * 같은 말을 하는 알림이 그 흔적을 덮었다(haeun-17b). 끄면 흔적을 그리는 쪽이 읽어 주기까지 맡는다.
   */
  toastOnSent?: boolean;
  /** 보내고 기록까지 남긴 뒤 — 보낸 행으로 입구가 흔적을 그린다(상세의 흔적 줄 · 장소 제안의 "알려 주셨어요"). */
  onSent?: (row: TReportInsert) => void;
};

/** 고르는 줄 한 칸(종류 · 이유). 둘이 같은 꼴이어야 시트 안에서 같은 일로 읽힌다. */
function ReportSheetOption({ selected, label, onPress }: { selected: boolean; label: string; onPress: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onPress}
      className={cx(
        'flex min-h-11 w-full items-center gap-3 rounded-2xl border px-3 py-2 text-left transition-colors',
        selected ? 'border-brand bg-brand-primary' : 'border-secondary bg-primary hover:bg-tertiary',
      )}
    >
      <span
        aria-hidden="true"
        className={cx('grid size-5 shrink-0 place-items-center rounded-full border-2', selected ? 'border-brand-solid' : 'border-secondary')}
      >
        {selected && <span className="size-2.5 rounded-full bg-brand-solid" />}
      </span>
      <span className={cx('text-sm font-semibold', selected ? 'text-brand-secondary' : 'text-primary')}>{label}</span>
    </button>
  );
}

/**
 * 제보 시트 — 종류 하나(판정 제보면 이유 하나) 고르고 한 줄 적어 보낸다(ADR-021, docs/todo/10 F1·F8).
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
  reasons,
  notePlaceholder,
  noteRequired = false,
  initialNote = '',
  toastOnSent = true,
  onSent,
}: TReportSheetProps) {
  const firstKind = kinds.length === 1 ? kinds[0] : null;
  const [kind, setKind] = useState<TReportKind | null>(firstKind);
  const [reason, setReason] = useState<TVerdictReason | null>(null);
  const [note, setNote] = useState('');
  // 열리는 순간 미리 채운다 — effect 가 아니라 렌더 중 이전 값과 견주는 꼴(닫힌 사이에 바뀐 검색어도 열 때 반영된다).
  // 손댄 초안은 덮지 않는다(14 W261010.7f) — 비었거나 지난번에 채운 그대로일 때만 이번 검색어로 바꾼다.
  const [prefilled, setPrefilled] = useState('');
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen && (note === '' || note === prefilled)) {
      setNote(initialNote);
      setPrefilled(initialNote);
    }
  }
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const noteId = useId();

  /**
   * 바깥 탭·Esc·끌어 내리기·닫기 버튼 — **고른 종류와 쓴 글은 남긴다**(14 W261010.7f, tremor-35 가 바깥을 건드려 쓴 글을 잃었다).
   * 시트는 닫혀도 마운트돼 있어 다시 열면 그대로다. 묻는 창을 띄우지 않는 것은 한 번 더 누르게 하는 것보다 잃지 않는 쪽이 싸서다.
   */
  const close = () => {
    onOpenChange(false);
    setProblem(null);
  };

  /** 보냈으면 비운다 — 다음에 여는 것은 새 제보다. */
  const closeSent = () => {
    close();
    setKind(firstKind);
    setReason(null);
    setNote('');
    setPrefilled('');
  };

  const submit = async () => {
    if (!kind) {
      setProblem('무엇이 다른지 하나 골라 주세요.');
      return;
    }
    if (reasons && !reason) {
      setProblem('무엇이 틀렸는지 하나 골라 주세요.');
      return;
    }
    if (!canReportNow(readReportRecord(), placeId, kind, Date.now())) {
      showAppStatus(REPORT_COOLDOWN_TEXT);
      close();
      return;
    }
    const built = buildReport({ placeId, kind, note, build: APP_BUILD, reason: reason ?? undefined });
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
    if (toastOnSent) showAppStatus(reportSentText(kind));
    onSent?.(built.row);
    closeSent();
  };

  const length = [...note].length;
  const noteMax = reasons ? REASON_NOTE_MAX : REPORT_NOTE_MAX;

  return (
    <BottomSheet isOpen={isOpen} onOpenChange={(open) => (open ? onOpenChange(true) : close())} label={title}>
      <div className="flex max-h-[80dvh] flex-col">
        <h2 className="shrink-0 pt-2 pr-10 text-md font-bold text-primary">{title}</h2>
        {lead && <p className="mt-1 shrink-0 text-sm text-tertiary">{lead}</p>}

        <div className="mt-4 min-h-0 flex-1 space-y-4 overflow-y-auto pb-2">
          {kinds.length > 1 && (
            <div role="radiogroup" aria-label="무엇이 다른가요" className="space-y-2">
              {kinds.map((candidate) => (
                <ReportSheetOption
                  key={candidate}
                  selected={kind === candidate}
                  label={REPORT_KIND_LABEL[candidate]}
                  onPress={() => {
                    setKind(candidate);
                    setProblem(null);
                  }}
                />
              ))}
            </div>
          )}

          {reasons && (
            <div role="radiogroup" aria-label="무엇이 틀렸나요" className="space-y-2">
              {reasons.map((candidate) => (
                <ReportSheetOption
                  key={candidate}
                  selected={reason === candidate}
                  label={VERDICT_REASON_LABEL[candidate]}
                  onPress={() => {
                    setReason(candidate);
                    setProblem(null);
                  }}
                />
              ))}
            </div>
          )}

          <div>
            {/*
              글자 수는 라벨 줄 오른쪽 — 칸 밑에 두면 입력 중에 스크롤 칸·키보드 아래로 잘렸다(haeun-17a). 칸이 보이면 그 위 줄도 보인다.
            */}
            <div className="flex items-baseline justify-between gap-3">
              <label htmlFor={noteId} className="text-sm font-semibold text-secondary">
                {noteRequired ? '가게 이름과 동네' : '한 줄 더 (선택)'}
              </label>
              <span className={cx('shrink-0 text-xs tabular-nums', length > noteMax ? 'text-error-primary' : 'text-tertiary')}>
                {length}/{noteMax}
              </span>
            </div>
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
