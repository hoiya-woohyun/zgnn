'use client';

import { CheckCircle, MessageAlertSquare } from '@untitledui/icons';
import { useEffect, useState } from 'react';
import { Button } from '../components/base/button';
import { ReportSheet } from '../components/reportSheet';
import { showAppStatus } from '../lib/appStatus';
import {
  buildReport,
  canReportNow,
  PICKABLE_REPORT_KINDS,
  recentReportKinds,
  REPORT_COOLDOWN_TEXT,
  reportFailureText,
  reportSentText,
  reportTraceText,
  type TReportKind,
  visitedLateFailureText,
} from '../lib/placeReport';
import { APP_BUILD, forgetReport, readReportRecord, rememberReport, sendPlaceReportUndoable } from '../lib/placeReportSend';
import type { TPlaceEntry } from '../lib/places';
import { CARD_SURFACE } from '../components/cardSurface';

/** '판정이 틀렸어요' 가 보내는 종류 — 하나뿐이라 시트가 고르는 줄을 그리지 않는다. 렌더마다 새 배열이 되지 않게 밖에 둔다. */
const VERDICT_REPORT_KINDS = ['policy'] as const satisfies readonly TReportKind[];

/**
 * 상세 맨 아래 "정보가 달라요" — 사용자 제보의 입구(docs/todo/10 F1, ADR-021).
 *
 * 자리를 맨 아래로 둔 것은 07 의 판단 그대로다: 제보는 **다녀온 뒤**의 동작이라 제목 밑 액션 줄(가기 전의 동작 — 저장·공유·네이버)과 섞지 않는다.
 * 디자인 트랙(10 §7)이 자리·문구를 다시 정하면 이 컴포넌트 하나만 옮기면 된다.
 *
 * 판정 카드 밑 '판정이 틀렸어요'(14 W261010.29a)의 시트도 여기 산다 — 어디서 보내든 이 칸의 흔적 한 줄이 같이 바뀌어야 해서다.
 * 여는 신호(`verdictOpen`)만 상세가 내려 준다.
 */
export function PlaceDetailReport({
  place,
  verdictOpen,
  onVerdictOpenChange,
}: {
  place: TPlaceEntry;
  verdictOpen: boolean;
  onVerdictOpenChange: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  /** '그대로였어요' 를 누르고 되돌리기 창이 열려 있는 동안 — 두 번 눌림의 둘째가 쿨다운 알림으로 되돌리기를 덮지 않게 잠근다. */
  const [visitPending, setVisitPending] = useState(false);

  /*
   * 보낸 흔적(14 W261007.19) — 보낸 것을 서버에서 다시 읽을 수 없어 이 기기의 하루 기록(`zgnn-reports`)이 전부다.
   * 미리 그린 HTML 엔 localStorage 가 없어 마운트 뒤에 읽는다(빈 기록으로 시작 — 하이드레이션과 어긋나지 않게). 보낸 직후에는 다시 읽는다.
   */
  const [sentKinds, setSentKinds] = useState<TReportKind[]>([]);
  // 지금 시각은 읽는 순간에 잰다 — 렌더 중에 재면 다시 그릴 때마다 값이 흔들린다.
  const reread = () => setSentKinds(recentReportKinds(readReportRecord(), place.id, Date.now()));
  useEffect(() => {
    // localStorage 는 React 밖의 상태다 — 마운트 때 한 번 옮겨 담는다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSentKinds(recentReportKinds(readReportRecord(), place.id, Date.now()));
  }, [place.id]);
  const trace = reportTraceText(sentKinds);

  /*
   * 다녀왔어요(F2) — **한 번 누르면 된다.** 고를 것도 적을 것도 없는 긍정 신호라 시트를 열면 아무도 안 누른다. 제보 시트 안의 한 종류로
   * 묻지 않은 것도 같은 이유다: "정보가 달라요" 를 연 사람에게 "그대로였어요" 는 반대말이다.
   * 대신 **되돌릴 틈을 둔다**(14 W261010.7g) — 옆 '정보가 달라요' 를 노리다 누르면 틀린 확인 신호가 운영자에게 갔다(tremor-30 · ferry-57).
   * 보낸 것은 읽지도 지우지도 못하므로 보내기를 되돌리기 알림이 걷힐 때로 미룬다(`sendPlaceReportUndoable`). 기록은 누르는 순간 남긴다 —
   * 흔적 줄이 바로 서고, 되돌리거나 실패하면 걷는다. 오프라인은 "고마워요" 를 보이기 전에 거른다.
   */
  const sendVisited = () => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      showAppStatus(reportFailureText('offline'));
      return;
    }
    if (!canReportNow(readReportRecord(), place.id, 'visited_ok', Date.now())) {
      showAppStatus(REPORT_COOLDOWN_TEXT);
      return;
    }
    const built = buildReport({ placeId: place.id, kind: 'visited_ok', build: APP_BUILD });
    if (!built.ok) return;
    rememberReport(place.id, 'visited_ok');
    reread();
    setVisitPending(true);
    sendPlaceReportUndoable(built.row, {
      text: reportSentText('visited_ok'),
      onUndo: () => {
        forgetReport(place.id, 'visited_ok');
        reread();
        setVisitPending(false);
      },
      onDone: (result) => {
        setVisitPending(false);
        if (result.ok) return;
        forgetReport(place.id, 'visited_ok');
        reread();
        showAppStatus(visitedLateFailureText(result.reason));
      },
    });
  };

  return (
    <section className="mt-8 px-4 md:px-6" aria-labelledby="place-report-title" data-ev="detail.report">
      <div className={`${CARD_SURFACE} p-4`}>
        <h2 id="place-report-title" className="text-md font-bold text-primary">
          다녀오셨나요?
        </h2>
        <p className="mt-1 text-sm text-tertiary">
          그대로였는지, 달랐는지 알려 주세요. 다음 사람이 헛걸음하지 않게 확인 날짜를 고치고 정보를 바로잡을게요.
        </p>
        {/* 두 버튼 사이 16px — 8px 일 때 한쪽을 노리다 다른 쪽을 눌렀다(14 W261010.7g). 줄이 접혀도 위아래로 같은 틈. */}
        <div className="mt-3 flex flex-wrap gap-4">
          <Button
            size="md"
            color="secondary"
            iconLeading={CheckCircle}
            className="min-h-11"
            isDisabled={visitPending}
            onClick={sendVisited}
          >
            그대로였어요
          </Button>
          <Button size="md" color="secondary" iconLeading={MessageAlertSquare} className="min-h-11" onClick={() => setOpen(true)}>
            정보가 달라요
          </Button>
        </div>
        {trace && <p className="mt-3 text-sm text-secondary">{trace}</p>}
      </div>

      <ReportSheet
        isOpen={open}
        onOpenChange={setOpen}
        title="정보가 달라요"
        lead={`${place.name}에서 무엇이 다른지 골라 주세요.`}
        placeId={place.id}
        kinds={PICKABLE_REPORT_KINDS}
        notePlaceholder="예: 9월부터 영업 안 해요 · 실내는 안 되고 테라스만 돼요"
        onSent={reread}
      />
      {/*
        종류는 '반려동물 조건이 달라요' 하나라 고르는 줄이 없다 — 판정이 틀렸다는 것은 조건을 잘못 읽었거나 조건이 바뀐 것이다.
        새 종류를 만들지 않는다(표의 CHECK 와 짝이다). 시트는 종류를 처음 값으로 잡으므로 위 시트와 나눠 각자 고정한다.
      */}
      <ReportSheet
        isOpen={verdictOpen}
        onOpenChange={onVerdictOpenChange}
        title="판정이 틀렸어요"
        lead={`${place.name}에서 실제로는 어땠는지 알려 주세요.`}
        placeId={place.id}
        kinds={VERDICT_REPORT_KINDS}
        notePlaceholder="예: 10kg 넘는다고 못 들어갔어요 · 실내도 괜찮았어요"
        onSent={reread}
      />
    </section>
  );
}
